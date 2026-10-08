/**
 * scripts/evaluate.ts
 * Đánh giá chất lượng 3 chiều: Input / Output (từng level) / Target.
 * Mục tiêu chính (ảnh bằng chứng): độ trung thực với ảnh gốc (PSNR/SSIM).
 * Các chỉ số còn lại (nét, nhiễu, sáng, dải động, tương phản, chroma,
 * cháy sáng/tối) chỉ để giám sát không suy thoái. Độ phân giải là thông tin,
 * không phải tiêu chí (thuộc tính ảnh vào).
 *
 * Dùng:  npm run evaluate -- --input samples/anh-that.jpg --target samples/target_model.jpg
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

import { ENHANCE_LEVELS } from "../src/config.js";
import { enhance } from "../src/index.js";
import type { RawImage } from "../src/internal-types.js";
import {
  measure,
  psnr,
  ssim,
  toLuma,
} from "../src/metrics/index.js";
import { decode } from "../src/steps/decode.js";

// ─────────────────────────────────────────────
// Chỉ số bổ sung chưa có trong src/metrics/
// ─────────────────────────────────────────────

/** Ước lượng độ bão hòa màu trung bình (0=xám hoàn toàn, 255=bão hòa tối đa). */
function avgSaturation(image: RawImage): number {
  const { data } = image;
  let total = 0;
  const pixels = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    total += max - min; // chroma C
  }
  return total / pixels;
}

/** Dải động sử dụng thực tế: p99 - p1 của luma histogram. */
function dynamicRange(image: RawImage): number {
  const m = measure(image);
  return m.brightness.p99 - m.brightness.p1;
}

/** Ước lượng độ tương phản cục bộ (local contrast): mean |diff| giữa pixel kề nhau theo ngang. */
function localContrast(image: RawImage): number {
  const { width, height } = image;
  const luma = toLuma(image);
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      sum += Math.abs((luma[i] ?? 0) - (luma[i + 1] ?? 0));
      count++;
    }
  }
  return sum / count;
}

// ─────────────────────────────────────────────
// Tiêu chí đánh giá & kỳ vọng
// ─────────────────────────────────────────────

interface Criterion {
  label: string;
  unit: string;
  /** Hướng tốt: "higher" hoặc "lower" */
  better: "higher" | "lower";
  /** Giá trị kỳ vọng khi đạt chuẩn target. Lấy từ target image. */
  target?: number;
}

const CRITERIA: Record<string, Criterion> = {
  sharpness:     { label: "Độ nét (Laplacian)", unit: "var",   better: "higher" },
  noise:         { label: "Nhiễu (σ block)",    unit: "level", better: "lower"  },
  brightness:    { label: "Độ sáng TB",         unit: "0-255", better: "higher" },
  dynamicRange:  { label: "Dải động",           unit: "0-255", better: "higher" },
  localContrast: { label: "Tương phản cục bộ", unit: "level", better: "higher" },
  saturation:    { label: "Chroma trung bình (HSV)", unit: "0-255", better: "higher" },
  shadowClip:    { label: "Pixel tối cháy",     unit: "%",     better: "lower"  },
  highlightClip: { label: "Pixel sáng cháy",    unit: "%",     better: "lower"  },
};

// ─────────────────────────────────────────────
// Đo toàn bộ chỉ số từ 1 RawImage
// ─────────────────────────────────────────────

interface MetricsSnapshot {
  label: string;
  width: number;
  height: number;
  /** Thông tin (không xếp loại): độ phân giải tính bằng MP. */
  megapixels: number;
  sharpness: number;
  noise: number;
  brightness: number;
  dynamicRange: number;
  localContrast: number;
  saturation: number;
  shadowClip: number;
  highlightClip: number;
  /** PSNR (dB) so ảnh gốc — chỉ có ở output. */
  psnrVsInput?: number;
  /** SSIM (0-1) so ảnh gốc — chỉ có ở output. */
  ssimVsInput?: number;
}

function snapshot(label: string, image: RawImage): MetricsSnapshot {
  const m = measure(image);
  return {
    label,
    width: image.width,
    height: image.height,
    megapixels: (image.width * image.height) / 1_000_000,
    sharpness:     m.sharpness,
    noise:         m.noise,
    brightness:    m.brightness.mean,
    dynamicRange:  dynamicRange(image),
    localContrast: localContrast(image),
    saturation:    avgSaturation(image),
    shadowClip:    m.brightness.shadowClipped * 100,
    highlightClip: m.brightness.highlightClipped * 100,
  };
}

// ─────────────────────────────────────────────
// In bảng so sánh
// ─────────────────────────────────────────────

function scoreEmoji(value: number, target: number, better: "higher" | "lower"): string {
  const ratio = better === "higher" ? value / target : target / value;
  if (ratio >= 0.95) return "✅";
  if (ratio >= 0.75) return "🟡";
  return "❌";
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function printComparisonTable(snapshots: MetricsSnapshot[], targetSnap: MetricsSnapshot): void {
  const keys = Object.keys(CRITERIA) as (keyof typeof CRITERIA)[];

  // Header
  const colWidth = 18;
  const labelWidth = 26;
  const header = ["Chỉ số".padEnd(labelWidth), ...snapshots.map(s => s.label.padStart(colWidth))].join(" | ");
  const sep = "-".repeat(header.length);
  console.log("\n" + sep);
  console.log(header);
  console.log(sep);

  // Thông tin (không xếp loại): kích thước ảnh
  const sizeRow = [
    "Kích thước (MP)".padEnd(labelWidth),
    ...snapshots.map(s => `${fmt(s.megapixels, 2)} MP`.padStart(colWidth)),
  ].join(" | ");
  console.log(sizeRow);

  for (const key of keys) {
    const criterion = CRITERIA[key]!;
    const targetVal = targetSnap[key as keyof MetricsSnapshot] as number;
    const cells = snapshots.map(s => {
      const val = s[key as keyof MetricsSnapshot] as number;
      const emoji = scoreEmoji(val, targetVal, criterion.better);
      const decimals = key === "shadowClip" || key === "highlightClip" ? 2 : 1;
      return `${emoji} ${fmt(val, decimals)} ${criterion.unit}`.padStart(colWidth);
    });
    const rowLabel = `${criterion.label}`.padEnd(labelWidth);
    console.log([rowLabel, ...cells].join(" | "));
  }
  console.log(sep);

  console.log("\nLegend: ✅ ≥95% target  🟡 75–94%  ❌ <75%  🎯 = target value");
}

// ─────────────────────────────────────────────
// Gap analysis: tìm chỉ số tệ nhất → ưu tiên cải thiện
// ─────────────────────────────────────────────

interface GapItem {
  key: string;
  label: string;
  inputVal: number;
  bestOutputVal: number;
  targetVal: number;
  gapRatio: number; // 0 = đạt target, 1 = hoàn toàn không đạt
  improvement: number; // % cải thiện so với input
}

function gapAnalysis(input: MetricsSnapshot, outputs: MetricsSnapshot[], target: MetricsSnapshot): GapItem[] {
  const keys = Object.keys(CRITERIA) as (keyof typeof CRITERIA)[];
  const items: GapItem[] = [];

  for (const key of keys) {
    const criterion = CRITERIA[key]!;
    const inputVal = input[key as keyof MetricsSnapshot] as number;
    const targetVal = target[key as keyof MetricsSnapshot] as number;

    // Tìm output tốt nhất
    let bestOutputVal = inputVal;
    for (const out of outputs) {
      const v = out[key as keyof MetricsSnapshot] as number;
      if (criterion.better === "higher" ? v > bestOutputVal : v < bestOutputVal) {
        bestOutputVal = v;
      }
    }

    const gapRatio = criterion.better === "higher"
      ? Math.max(0, 1 - bestOutputVal / targetVal)
      : Math.max(0, 1 - targetVal / bestOutputVal);

    const improvement = criterion.better === "higher"
      ? inputVal === 0 ? 0 : ((bestOutputVal - inputVal) / inputVal) * 100
      : inputVal === 0 ? 0 : ((inputVal - bestOutputVal) / inputVal) * 100;

    items.push({ key, label: criterion.label, inputVal, bestOutputVal, targetVal, gapRatio, improvement });
  }

  // Sort by gap (lớn nhất = cần cải thiện nhất)
  return items.sort((a, b) => b.gapRatio - a.gapRatio);
}

function printGapAnalysis(gaps: GapItem[]): void {
  console.log("\n=== 📊 GAP ANALYSIS — Ưu tiên cải thiện (xếp theo khoảng cách với target) ===\n");
  const cols = ["STT", "Chỉ số", "Input hiện tại", "Output tốt nhất", "Target", "Gap còn lại", "Cải thiện vs Input"];
  const colW = [4, 26, 18, 18, 18, 14, 20];
  const header = cols.map((c, i) => c.padEnd(colW[i] ?? 10)).join(" ");
  console.log(header);
  console.log("-".repeat(header.length));

  gaps.forEach((g, idx) => {
    const dec = 2;
    const priority = g.gapRatio > 0.5 ? "🔴" : g.gapRatio > 0.2 ? "🟡" : "🟢";
    const row = [
      `${priority} ${idx + 1}`.padEnd(colW[0] ?? 4),
      g.label.padEnd(colW[1] ?? 26),
      fmt(g.inputVal, dec).padEnd(colW[2] ?? 18),
      fmt(g.bestOutputVal, dec).padEnd(colW[3] ?? 18),
      fmt(g.targetVal, dec).padEnd(colW[4] ?? 18),
      `${(g.gapRatio * 100).toFixed(1)}%`.padEnd(colW[5] ?? 14),
      (g.improvement >= 0 ? "+" : "") + fmt(g.improvement, 1) + "%",
    ];
    console.log(row.join(" "));
  });
}

// ─────────────────────────────────────────────
// Độ trung thực với ảnh gốc (PSNR/SSIM)
// ─────────────────────────────────────────────

function printFidelityTable(snapshots: MetricsSnapshot[]): void {
  const rows = snapshots.filter(
    (s) => s.psnrVsInput !== undefined && s.ssimVsInput !== undefined,
  );
  if (rows.length === 0) return;

  console.log(
    "\n=== 🛡️  ĐỘ TRUNG THỰC VỚI ẢNH GỐC (PSNR/SSIM càng cao = càng ít thay đổi) ===\n",
  );
  const cols = ["Biến thể", "PSNR (dB)", "SSIM"];
  const colW = [26, 14, 12];
  console.log(cols.map((c, i) => c.padEnd(colW[i] ?? 10)).join(" "));
  console.log("-".repeat(cols.reduce((sum, c, i) => sum + (colW[i] ?? 10), 0)));

  for (const s of rows) {
    const psnrText = Number.isFinite(s.psnrVsInput!)
      ? s.psnrVsInput!.toFixed(2)
      : "∞";
    const ssimText = s.ssimVsInput!.toFixed(4);
    console.log(
      [
        s.label.padEnd(colW[0] ?? 26),
        psnrText.padStart(colW[1] ?? 14),
        ssimText.padStart(colW[2] ?? 12),
      ].join(" "),
    );
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input:  { type: "string" },
      target: { type: "string" },
      out:    { type: "string" },
      help:   { type: "boolean" },
    },
  });

  if (values.help || !values.input) {
    console.log(`Cách dùng:
  npm run evaluate -- --input samples/anh-that.jpg --target samples/target_model.jpg [--out output/eval]`);
    return;
  }

  const inputPath  = values.input;
  const targetPath = values.target;
  const outDir     = values.out ?? join("output", "evaluate");

  await mkdir(outDir, { recursive: true });

  // Đọc và decode input
  const inputBuf = await readFile(inputPath);
  const inputRaw = await decode(inputBuf);
  const inputSnap = snapshot("📷 Input", inputRaw);
  // Ảnh gốc so với chính nó: PSNR = ∞, SSIM = 1 (mốc tham chiếu)
  inputSnap.psnrVsInput = psnr(inputRaw, inputRaw);
  inputSnap.ssimVsInput = ssim(inputRaw, inputRaw);

  console.log(`\n🔍 Đang đánh giá: ${inputPath}`);
  console.log(`   Kích thước: ${inputRaw.width}×${inputRaw.height} px`);

  // Decode target nếu có
  let targetSnap: MetricsSnapshot | undefined;
  if (targetPath) {
    const targetBuf = await readFile(targetPath);
    // Target có thể kích thước khác → decode bình thường
    const targetRaw = await decode(targetBuf);
    targetSnap = snapshot("🎯 Target", targetRaw);
    console.log(`   Target    : ${targetRaw.width}×${targetRaw.height} px`);
  }

  // Chạy enhance tất cả levels
  const outputSnaps: MetricsSnapshot[] = [];
  for (const level of ENHANCE_LEVELS) {
    process.stdout.write(`   Xử lý level "${level}"... `);
    const started = performance.now();
    const out = await enhance({ data: inputBuf }, { level, outputFormat: "png" });
    const elapsed = performance.now() - started;
    const outRaw = await decode(out.data);
    const snap = snapshot(`⚙️  ${level}`, outRaw);
    // Output cùng kích thước input (không upscale) nên so trực tiếp được
    snap.psnrVsInput = psnr(inputRaw, outRaw);
    snap.ssimVsInput = ssim(inputRaw, outRaw);
    outputSnaps.push(snap);

    // Lưu ảnh output
    const name = basename(inputPath, extname(inputPath));
    await writeFile(join(outDir, `${name}-${level}.png`), out.data);
    console.log(`✓ (${elapsed.toFixed(0)}ms)`);
  }

  // Dùng target hoặc dùng "lý tưởng từ ảnh strong" làm chuẩn nếu không có target
  const referenceSnap = targetSnap ?? outputSnaps[outputSnaps.length - 1]!;

  // In bảng so sánh
  const allSnaps = [inputSnap, ...outputSnaps];
  if (targetSnap) allSnaps.push(targetSnap);

  console.log("\n\n=== 📋 BẢNG SO SÁNH CHẤT LƯỢNG ===");
  console.log(`    (Chuẩn đánh giá: ${referenceSnap.label})\n`);
  printComparisonTable(allSnaps, referenceSnap);

  // Độ trung thực với ảnh gốc (không xếp vào gap analysis)
  printFidelityTable(allSnaps);

  // Gap analysis
  const gaps = gapAnalysis(inputSnap, outputSnaps, referenceSnap);
  printGapAnalysis(gaps);

  // Xuất JSON
  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    targetPath,
    snapshots: allSnaps,
    gapAnalysis: gaps,
    criteria: CRITERIA,
  };
  const reportPath = join(outDir, "eval-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report JSON: ${reportPath}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
