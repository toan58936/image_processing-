import type { EnhanceStep, RawImage } from "./internal-types.js";

/**
 * Danh sách các bước xử lý pixel, theo đúng thứ tự thực thi.
 * Thứ tự dự kiến: khử nhiễu -> cân sáng -> làm nét (thêm ở chặng C).
 * Hiện rỗng: ảnh đi qua mà không bị thay đổi nội dung.
 */
export function buildPipeline(): readonly EnhanceStep[] {
  return [];
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
