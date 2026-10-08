import type { RawImage } from "../internal-types.js";
import { toLuma } from "./luma.js";

const NOISE_BLOCK = 8;
const NOISE_PERCENTILE = 0.1;
const SHADOW_LEVEL = 2;
const HIGHLIGHT_LEVEL = 253;

export interface BrightnessStats {
  /** Độ sáng trung bình (0-255). */
  mean: number;
  /** Phân vị 1% và 99% của độ sáng: độ rộng dải sáng thực dùng. */
  p1: number;
  p99: number;
  /** Tỉ lệ (0-1) pixel có độ sáng <= 2 (mất chi tiết vùng tối). */
  shadowClipped: number;
  /** Tỉ lệ (0-1) pixel có độ sáng >= 253 (cháy sáng). */
  highlightClipped: number;
}

export interface QualityMetrics {
  sharpness: number;
  noise: number;
  brightness: BrightnessStats;
}

/**
 * Độ sắc nét: phương sai của Laplacian trên độ sáng (càng cao càng nét).
 * LƯU Ý: nhiễu cũng làm số này tăng, cần đọc cùng chỉ số nhiễu.
 */
export function laplacianVariance(image: RawImage): number {
  const { width, height } = image;
  if (width < 3 || height < 3) {
    throw new RangeError("Ảnh phải có kích thước tối thiểu 3x3.");
  }
  const luma = toLuma(image);

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        (luma[i - 1] ?? 0) +
        (luma[i + 1] ?? 0) +
        (luma[i - width] ?? 0) +
        (luma[i + width] ?? 0) -
        4 * (luma[i] ?? 0);
      sum += value;
      sumSq += value * value;
      count++;
    }
  }
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

/**
 * Ước lượng mức nhiễu: độ lệch chuẩn độ sáng trong các khối 8x8, lấy phân vị
 * thứ 10 (khối phẳng nhất, ít bị ảnh hưởng bởi chi tiết thật).
 * Chỉ nên dùng để SO SÁNH trước/sau, không phải số đo tuyệt đối.
 */
export function estimateNoise(image: RawImage): number {
  const { width, height } = image;
  const blocksX = Math.floor(width / NOISE_BLOCK);
  const blocksY = Math.floor(height / NOISE_BLOCK);
  if (blocksX === 0 || blocksY === 0) {
    throw new RangeError("Ảnh phải có kích thước tối thiểu 8x8.");
  }
  const luma = toLuma(image);
  const n = NOISE_BLOCK * NOISE_BLOCK;

  const stds: number[] = [];
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let sum = 0;
      let sumSq = 0;
      for (let y = 0; y < NOISE_BLOCK; y++) {
        const row = (by * NOISE_BLOCK + y) * width + bx * NOISE_BLOCK;
        for (let x = 0; x < NOISE_BLOCK; x++) {
          const v = luma[row + x] ?? 0;
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / n;
      stds.push(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
    }
  }

  stds.sort((a, b) => a - b);
  const index = Math.floor((stds.length - 1) * NOISE_PERCENTILE);
  return stds[index] ?? 0;
}

/** Thống kê độ sáng dựa trên histogram 256 mức của luma. */
export function brightnessStats(image: RawImage): BrightnessStats {
  const luma = toLuma(image);
  const histogram = new Uint32Array(256);
  let sum = 0;
  for (const value of luma) {
    const level = Math.min(255, Math.max(0, Math.round(value)));
    histogram[level] = (histogram[level] ?? 0) + 1;
    sum += value;
  }
  const total = luma.length;

  const percentile = (q: number): number => {
    const target = q * total;
    let acc = 0;
    for (let level = 0; level < 256; level++) {
      acc += histogram[level] ?? 0;
      if (acc >= target) return level;
    }
    return 255;
  };

  let shadow = 0;
  for (let level = 0; level <= SHADOW_LEVEL; level++) {
    shadow += histogram[level] ?? 0;
  }
  let highlight = 0;
  for (let level = HIGHLIGHT_LEVEL; level < 256; level++) {
    highlight += histogram[level] ?? 0;
  }

  return {
    mean: sum / total,
    p1: percentile(0.01),
    p99: percentile(0.99),
    shadowClipped: shadow / total,
    highlightClipped: highlight / total,
  };
}

/** Gộp các chỉ số không cần ảnh chuẩn. */
export function measure(image: RawImage): QualityMetrics {
  return {
    sharpness: laplacianVariance(image),
    noise: estimateNoise(image),
    brightness: brightnessStats(image),
  };
}
