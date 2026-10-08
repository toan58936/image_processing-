import type { RawImage } from "../internal-types.js";
import type { BrightnessStats } from "./brightness.js";
import { brightnessStats } from "./brightness.js";
import { estimateNoise } from "./noise.js";
import { laplacianVariance } from "./sharpness.js";

export interface QualityMetrics {
  sharpness: number;
  noise: number;
  brightness: BrightnessStats;
}

/** Gộp các chỉ số không cần ảnh chuẩn. */
export function measure(image: RawImage): QualityMetrics {
  return {
    sharpness: laplacianVariance(image),
    noise: estimateNoise(image),
    brightness: brightnessStats(image),
  };
}
