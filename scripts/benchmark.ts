import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

import sharp from "sharp";

import { ENHANCE_LEVELS } from "../src/config.js";
import { enhance } from "../src/index.js";
import type { EnhanceLevel } from "../src/index.js";
import type { RawImage } from "../src/internal-types.js";
import { measure, psnr, ssim } from "../src/metrics/index.js";
import type { QualityMetrics } from "../src/metrics/index.js";
import { decode } from "../src/steps/decode.js";
import { DEFAULT_DEGRADE, degrade } from "./lib/degrade.js";
import { cropRaw } from "./lib/crop.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_TILE_WIDTH = 800;
const GAP = 8;

interface Crop {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Row = Record<string, string | number>;

const USAGE = `Cách dùng:
  npm run benchmark [-- --input samples --out output/benchmark
                        --levels light,standard,strong
                        --crop x,y,rộng,cao --zoom 3 --skip-synthetic]`;

function parseLevels(value: string | undefined): EnhanceLevel[] {
  if (value === undefined) return [...ENHANCE_LEVELS];
  const levels = value.split(",").map((s) => s.trim());
  for (const level of levels) {
    if (!ENHANCE_LEVELS.includes(level as EnhanceLevel)) {
      throw new Error(
        `Level "${level}" không hợp lệ. Hợp lệ: ${ENHANCE_LEVELS.join(", ")}.`,
      );
    }
  }
  return levels as EnhanceLevel[];
}

function parseCrop(value: string | undefined): Crop | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0)
  ) {
    throw new Error("--crop phải có dạng x,y,rộng,cao (4 số nguyên không âm).");
  }
  const [left = 0, top = 0, width = 0, height = 0] = parts;
  if (width === 0 || height === 0) {
    throw new Error("--crop: rộng và cao phải lớn hơn 0.");
  }
  return { left, top, width, height };
}

function assertCropInside(crop: Crop, image: RawImage): void {
  if (
    crop.left + crop.width > image.width ||
    crop.top + crop.height > image.height
  ) {
    throw new Error(
      `--crop vượt ngoài ảnh ${image.width}x${image.height}: x=${crop.left}, y=${crop.top}, rộng=${crop.width}, cao=${crop.height}.`,
    );
  }
}

/** Ghép các ảnh cùng kích thước cạnh nhau (có thể cắt vùng và phóng to). */
async function makeMontage(
  images: readonly RawImage[],
  crop: Crop | undefined,
  zoom: number,
): Promise<Buffer> {
  const tiles = [];
  for (const image of images) {
    let pipeline = sharp(image.data, {
      raw: {
        width: image.width,
        height: image.height,
        channels: image.channels,
      },
    });
    if (crop) {
      assertCropInside(crop, image);
      pipeline = pipeline
        .extract(crop)
        .resize({ width: crop.width * zoom, kernel: "nearest" });
    } else if (image.width > MAX_TILE_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_TILE_WIDTH });
    }
    tiles.push(await pipeline.png().toBuffer({ resolveWithObject: true }));
  }

  const height = Math.max(...tiles.map((t) => t.info.height));
  const width =
    tiles.reduce((sum, t) => sum + t.info.width, 0) + GAP * (tiles.length - 1);

  let left = 0;
  const layers = tiles.map((tile) => {
    const layer = { input: tile.data, left, top: 0 };
    left += tile.info.width + GAP;
    return layer;
  });

  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

async function toPng(image: RawImage): Promise<Buffer> {
  return sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels,
    },
  })
    .png()
    .toBuffer();
}

function describeRow(
  image: string,
  variant: string,
  m: QualityMetrics,
  ms: string,
): Row {
  return {
    image,
    variant,
    "nét": m.sharpness.toFixed(1),
    "nhiễu": m.noise.toFixed(2),
    "sáng TB": m.brightness.mean.toFixed(1),
    p1: m.brightness.p1,
    p99: m.brightness.p99,
    "tối cháy %": (m.brightness.shadowClipped * 100).toFixed(2),
    "sáng cháy %": (m.brightness.highlightClipped * 100).toFixed(2),
    ms,
  };
}

function fidelityRow(
  image: string,
  variant: string,
  truth: RawImage,
  candidate: RawImage,
): Row {
  return {
    image,
    variant,
    "PSNR (dB)": psnr(truth, candidate).toFixed(2),
    SSIM: ssim(truth, candidate).toFixed(4),
  };
}

function extensionOf(format: string): string {
  return format === "jpeg" ? "jpg" : format;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      out: { type: "string" },
      levels: { type: "string" },
      crop: { type: "string" },
      zoom: { type: "string" },
      "skip-synthetic": { type: "boolean" },
      "measure-crop": { type: "boolean" },
      help: { type: "boolean" },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const inputDir = values.input ?? "samples";
  const outDir = values.out ?? join("output", "benchmark");
  const levels = parseLevels(values.levels);
  const crop = parseCrop(values.crop);
  const region = (image: RawImage): RawImage =>
    values["measure-crop"] === true && crop ? cropRaw(image, crop) : image;
  const zoom = values.zoom === undefined ? 3 : Number(values.zoom);
  if (!Number.isInteger(zoom) || zoom < 1 || zoom > 10) {
    throw new Error("--zoom phải là số nguyên từ 1 đến 10.");
  }
  const skipSynthetic = values["skip-synthetic"] === true;

  let entries: string[];
  try {
    entries = await readdir(inputDir);
  } catch (cause) {
    throw new Error(`Không đọc được thư mục "${inputDir}".`, { cause });
  }
  const files = entries
    .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    console.error(`Không có ảnh (.jpg, .png, .webp) nào trong "${inputDir}".`);
    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });

  const realRows: Row[] = [];
  const syntheticRows: Row[] = [];
  let peakRss = 0;

  for (const file of files) {
    const name = basename(file, extname(file));
    const buffer = await readFile(join(inputDir, file));
    const original = await decode(buffer);

    // 1. Ảnh thật: chỉ số không cần ảnh chuẩn
    realRows.push(describeRow(file, "gốc", measure(region(original)), "-"));
    const tiles: RawImage[] = [original];

    for (const level of levels) {
      const started = performance.now();
      const out = await enhance({ data: buffer }, { level });
      const elapsed = performance.now() - started;
      peakRss = Math.max(peakRss, process.memoryUsage().rss);

      const enhanced = await decode(out.data);
      realRows.push(
        describeRow(file, level, measure(region(enhanced)), elapsed.toFixed(0)),
      );
      await writeFile(
        join(outDir, `${name}-${level}.${extensionOf(out.format)}`),
        out.data,
      );
      tiles.push(enhanced);
    }
    await writeFile(
      join(outDir, `${name}-compare.png`),
      await makeMontage(tiles, crop, zoom),
    );

    // 2. Cặp ảnh nhân tạo: ảnh gốc là ground truth
    if (!skipSynthetic) {
      const degraded = await degrade(original, DEFAULT_DEGRADE);
      const degradedPng = await toPng(degraded);
      await writeFile(join(outDir, `${name}-degraded.png`), degradedPng);

      syntheticRows.push(fidelityRow(file, "ảnh làm xấu", original, degraded));
      const synthTiles: RawImage[] = [original, degraded];

      for (const level of levels) {
        const out = await enhance(
          { data: degradedPng },
          { level, outputFormat: "png" },
        );
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        const enhanced = await decode(out.data);
        syntheticRows.push(fidelityRow(file, level, original, enhanced));
        synthTiles.push(enhanced);
      }
      await writeFile(
        join(outDir, `${name}-synthetic-compare.png`),
        await makeMontage(synthTiles, crop, zoom),
      );
    }
  }

  console.log("\n=== ẢNH THẬT (không có ảnh chuẩn) ===");
  console.table(realRows);
  if (!skipSynthetic) {
    console.log("\n=== CẶP ẢNH NHÂN TẠO (ảnh gốc là chuẩn; PSNR/SSIM cao hơn = gần ảnh gốc hơn) ===");
    console.table(syntheticRows);
  }

  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), levels, real: realRows, synthetic: syntheticRows },
      null,
      2,
    ),
  );

  console.log(`\nRSS cao nhất khoảng ${(peakRss / 1024 / 1024).toFixed(0)} MB.`);
  console.log(`Kết quả nằm trong "${outDir}": ảnh đã xử lý, *-compare.png (thứ tự trái sang phải: gốc, ${levels.join(", ")}), report.json.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
