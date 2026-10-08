import type { RawImage } from "../internal-types.js";
import { toLuma } from "./luma.js";

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
