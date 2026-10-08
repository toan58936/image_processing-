import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

import { ENHANCE_LEVELS, LEVEL_PARAMS } from "../src/config.js";
import type { LevelParams } from "../src/config.js";
import { enhanceWithParams } from "../src/enhancer.js";
import type { EnhanceLevel } from "../src/index.js";
import { measure } from "../src/metrics/index.js";
import { decode } from "../src/steps/decode.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const DENOISE_OFF = { medianSize: 3, strength: 0 } as const;
const TONE_OFF = { strength: 0, maxSlope: 3, gamma: 1 } as const;
const SHARPEN_OFF = { sigma: 1, amount: 0, threshold: 2 } as const;

const USAGE = `Cách dùng:
  npm run ablate [-- --input samples --level standard]`;

/** Các biến thể: chạy riêng từng bước, và "đầy đủ nhưng bỏ một bước". */
function buildVariants(base: LevelParams): Array<[string, LevelParams]> {
  const off: LevelParams = {
    denoise: DENOISE_OFF,
    tone: TONE_OFF,
    sharpen: SHARPEN_OFF,
  };
  return [
    ["tắt hết (mốc so sánh)", off],
    ["chỉ khử nhiễu", { ...off, denoise: base.denoise }],
    ["chỉ CLAHE", { ...off, tone: { ...base.tone, gamma: 1 } }],
    ["chỉ gamma", { ...off, tone: { ...base.tone, strength: 0 } }],
    ["chỉ làm nét", { ...off, sharpen: base.sharpen }],
    ["đầy đủ", base],
    ["đầy đủ, bỏ khử nhiễu", { ...base, denoise: DENOISE_OFF }],
    ["đầy đủ, bỏ CLAHE", { ...base, tone: { ...base.tone, strength: 0 } }],
    ["đầy đủ, bỏ gamma", { ...base, tone: { ...base.tone, gamma: 1 } }],
    ["đầy đủ, bỏ làm nét", { ...base, sharpen: SHARPEN_OFF }],
  ];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      level: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const inputDir = values.input ?? "samples";
  const level = (values.level ?? "standard") as EnhanceLevel;
  if (!ENHANCE_LEVELS.includes(level)) {
    throw new Error(
      `Level "${level}" không hợp lệ. Hợp lệ: ${ENHANCE_LEVELS.join(", ")}.`,
    );
  }

  const files = (await readdir(inputDir))
    .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    console.error(`Không có ảnh (.jpg, .png, .webp) nào trong "${inputDir}".`);
    process.exitCode = 1;
    return;
  }

  const variants = buildVariants(LEVEL_PARAMS[level]);

  for (const file of files) {
    const buffer = await readFile(join(inputDir, file));
    const rows: Array<Record<string, string | number>> = [];
    let baseline: ReturnType<typeof measure> | undefined;

    for (const [name, params] of variants) {
      // Xuất PNG để số đo không bị lẫn nhiễu do nén JPEG.
      const out = await enhanceWithParams({ data: buffer }, params, {
        outputFormat: "png",
      });
      const m = measure(await decode(out.data));
      baseline ??= m;

      rows.push({
        "biến thể": name,
        "nét": m.sharpness.toFixed(1),
        "Δnét %":
          baseline.sharpness === 0
            ? "-"
            : (
                ((m.sharpness - baseline.sharpness) / baseline.sharpness) *
                100
              ).toFixed(1),
        "nhiễu": m.noise.toFixed(2),
        "sáng TB": m.brightness.mean.toFixed(1),
        p1: m.brightness.p1,
        p99: m.brightness.p99,
        "tối cháy %": (m.brightness.shadowClipped * 100).toFixed(2),
        "sáng cháy %": (m.brightness.highlightClipped * 100).toFixed(2),
      });
    }

    console.log(`\n=== ${file} (tham số của mức "${level}") ===`);
    console.table(rows);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
