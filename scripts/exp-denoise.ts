/**
 * Thử nghiệm khử nhiễu: so sánh median toàn cục (hiện tại) với
 * khử nhiễu có mặt nạ cạnh — chỉ lọc vùng phẳng, bảo vệ chi tiết.
 * CHƯA phải code sản phẩm: chỉ để thu thập số liệu ra quyết định.
 */
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

import sharp from "sharp";

import { ENHANCE_LEVELS, LEVEL_PARAMS } from "../src/config.js";
import type { EnhanceLevel } from "../src/index.js";
import type { ImageOutput } from "../src/types.js";
import { psnr, ssim } from "../src/metrics/fidelity.js";
import { measure } from "../src/metrics/measure.js";
import { encode } from "../src/steps/encode.js";
import { createSharpenStep } from "../src/steps/sharpen.js";
import { createToneStep } from "../src/steps/tone.js";
import { decode } from "../src/steps/decode.js";
import type { RawImage } from "../src/internal-types.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const USAGE = `Cách dùng:
  npx tsx scripts/exp-denoise.ts [--input samples]`;

interface MaskDenoiseOpts {
  /** Bộ lọc nền: median (chống impulse) hoặc gaussian (mịn). */
  readonly filter: "median" | "gaussian";
  readonly medianSize: number;
  /** sigma blur dùng để dò cạnh (và là bộ lọc khi filter=gaussian). */
  readonly sigma: number;
  /** Chênh lệch luma |gốc − mờ| dưới ngưỡng này = vùng phẳng (được lọc tối đa). */
  readonly edgeLow: number;
  /** Từ ngưỡng này trở lên = cạnh/chi tiết (không lọc). */
  readonly edgeHigh: number;
  /** Cường độ lọc tối đa ở vùng phẳng, 0 đến 1. */
  readonly strength: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Khử nhiễu có mặt nạ cạnh: lọc (median/gaussian) chỉ ở vùng phẳng. */
async function maskDenoise(
  image: RawImage,
  opts: MaskDenoiseOpts,
): Promise<RawImage> {
  const { data, width, height, channels } = image;
  const pixels = width * height;

  const blurred = await sharp(data, { raw: { width, height, channels } })
    .blur(opts.sigma)
    .raw()
    .toBuffer();

  const filtered =
    opts.filter === "gaussian"
      ? blurred
      : await sharp(data, { raw: { width, height, channels } })
          .median(opts.medianSize)
          .raw()
          .toBuffer();

  const out = Buffer.allocUnsafe(data.length);
  const { edgeLow, edgeHigh, strength } = opts;
  const span = edgeHigh - edgeLow;

  for (let p = 0; p < pixels; p++) {
    const i = p * 3;
    const luma =
      0.299 * (data[i] ?? 0) +
      0.587 * (data[i + 1] ?? 0) +
      0.114 * (data[i + 2] ?? 0);
    const lumaBlur =
      0.299 * (blurred[i] ?? 0) +
      0.587 * (blurred[i + 1] ?? 0) +
      0.114 * (blurred[i + 2] ?? 0);
    const edge = Math.abs(luma - lumaBlur);
    // Vùng phẳng (edge thấp) → trọng số lọc cao; cạnh → 0.
    const flatness = span > 0 ? clamp01((edgeHigh - edge) / span) : 1;
    const w = strength * flatness;
    out[i] = Math.round((data[i] ?? 0) + ((filtered[i] ?? 0) - (data[i] ?? 0)) * w);
    out[i + 1] = Math.round(
      (data[i + 1] ?? 0) + ((filtered[i + 1] ?? 0) - (data[i + 1] ?? 0)) * w,
    );
    out[i + 2] = Math.round(
      (data[i + 2] ?? 0) + ((filtered[i + 2] ?? 0) - (data[i + 2] ?? 0)) * w,
    );
  }

  return { data: out, width, height, channels };
}

type Variant =
  | { kind: "off" }
  | { kind: "uniform"; medianSize: number; strength: number }
  | { kind: "mask"; opts: MaskDenoiseOpts };

  /** Chạy pipeline: [denoise tùy chọn] -> tone -> sharpen, xuất PNG. */
async function runVariant(
  input: RawImage,
  level: EnhanceLevel,
  variant: Variant,
): Promise<ImageOutput> {
  const params = LEVEL_PARAMS[level];
  const steps = [];

  if (variant.kind === "uniform") {
    const { medianSize, strength } = variant;
    const keep = 1 - strength;
    steps.push(async (image: RawImage): Promise<RawImage> => {
      const { data, width, height, channels } = image;
      const filtered = await sharp(data, { raw: { width, height, channels } })
        .median(medianSize)
        .raw()
        .toBuffer();
      const out = Buffer.allocUnsafe(data.length);
      for (let i = 0; i < data.length; i++) {
        out[i] = Math.round((data[i] ?? 0) * keep + (filtered[i] ?? 0) * strength);
      }
      return { data: out, width, height, channels };
    });
  } else if (variant.kind === "mask") {
    steps.push((image: RawImage) => maskDenoise(image, variant.opts));
  }

  steps.push(createToneStep(params.tone));
  steps.push(createSharpenStep(params.sharpen));

  let current = input;
  for (const step of steps) {
    current = await step(current);
  }
  return encode(current, "png");
}

interface VariantDef {
  readonly name: string;
  readonly variant: Variant;
}

const VARIANTS: readonly VariantDef[] = [
  { name: "tắt", variant: { kind: "off" } },
  { name: "median3 ×0.35 (hiện tại)", variant: { kind: "uniform", medianSize: 3, strength: 0.35 } },
  { name: "mask median3 s0.5", variant: { kind: "mask", opts: { filter: "median", medianSize: 3, sigma: 1.5, edgeLow: 4, edgeHigh: 16, strength: 0.5 } } },
  { name: "mask median3 s0.8", variant: { kind: "mask", opts: { filter: "median", medianSize: 3, sigma: 1.5, edgeLow: 4, edgeHigh: 16, strength: 0.8 } } },
  { name: "mask median5 s0.6", variant: { kind: "mask", opts: { filter: "median", medianSize: 5, sigma: 2, edgeLow: 4, edgeHigh: 16, strength: 0.6 } } },
  { name: "mask blur s0.5", variant: { kind: "mask", opts: { filter: "gaussian", medianSize: 3, sigma: 1.5, edgeLow: 4, edgeHigh: 16, strength: 0.5 } } },
];

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { input: { type: "string" }, help: { type: "boolean" } },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const inputDir = values.input ?? "samples";
  const files = (await readdir(inputDir))
    .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    console.error(`Không có ảnh (.jpg, .png, .webp) nào trong "${inputDir}".`);
    process.exitCode = 1;
    return;
  }

  for (const file of files) {
    const buffer = await readFile(join(inputDir, file));
    const input = await decode(buffer);

    for (const level of ENHANCE_LEVELS) {
      const rows: Array<Record<string, string | number>> = [];

      for (const { name, variant } of VARIANTS) {
        const png = await runVariant(input, level, variant);
        const out = await decode(png.data);
        const m = measure(out);

        rows.push({
          "biến thể": name,
          "nét": m.sharpness.toFixed(1),
          "nhiễu": m.noise.toFixed(2),
          "PSNR dB": Number.isFinite(psnr(input, out))
            ? psnr(input, out).toFixed(2)
            : "∞",
          "SSIM": ssim(input, out).toFixed(4),
          "sáng TB": m.brightness.mean.toFixed(1),
          "tối cháy %": (m.brightness.shadowClipped * 100).toFixed(2),
          "sáng cháy %": (m.brightness.highlightClipped * 100).toFixed(2),
        });
      }

      console.log(`\n=== ${file} — mức "${level}" ===`);
      console.table(rows);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
