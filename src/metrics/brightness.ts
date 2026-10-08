import type { RawImage } from "../internal-types.js";
import { toLuma } from "./luma.js";

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
