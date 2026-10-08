import type { LevelParams } from "./config.js";
import type { EnhanceStep, RawImage } from "./internal-types.js";
import { createDenoiseStep } from "./steps/denoise.js";
import { createSharpenStep } from "./steps/sharpen.js";
import { createToneStep } from "./steps/tone.js";

/**
 * Danh sách các bước xử lý pixel, theo đúng thứ tự thực thi:
 * khử nhiễu -> cân sáng -> làm nét.
 */
export function buildPipeline(params: LevelParams): readonly EnhanceStep[] {
  const steps: EnhanceStep[] = [];

  if (params.denoise.strength > 0) {
    steps.push(createDenoiseStep(params.denoise));
  }
  if (params.tone.strength > 0 || params.tone.gamma !== 1) {
    steps.push(createToneStep(params.tone));
  }
  if (params.sharpen.amount > 0) {
    steps.push(createSharpenStep(params.sharpen));
  }

  return steps;
}

/** Chạy tuần tự từng bước: bước sau nhận kết quả của bước trước. */
export async function runPipeline(
  image: RawImage,
  steps: readonly EnhanceStep[],
): Promise<RawImage> {
  let current = image;
  for (const step of steps) {
    current = await step(current);
  }
  return current;
}
