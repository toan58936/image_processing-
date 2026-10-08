import type { RawImage } from "../internal-types.js";
import { toLuma } from "./luma.js";

const NOISE_BLOCK = 8;
const NOISE_PERCENTILE = 0.1;

/** Ước lượng mức nhiễu: độ lệch chuẩn độ sáng trong các khối 8x8, lấy phân vị
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

/**
 * Ước lượng mức nhiễu màu: phương sai của Cb, Cr (BT.601) trong các khối
 * 8x8, kết hợp RMS (sqrt(varCb + varCr)), lấy phân vị thứ 10 như estimateNoise.
 * Ảnh xám (R = G = B) cho 0 vì Cb = Cr = 0.
 * Chỉ nên dùng để SO SÁNH trước/sau, không phải số đo tuyệt đối.
 */
export function estimateChromaNoise(image: RawImage): number {
  const { width, height, data } = image;
  const blocksX = Math.floor(width / NOISE_BLOCK);
  const blocksY = Math.floor(height / NOISE_BLOCK);
  if (blocksX === 0 || blocksY === 0) {
    throw new RangeError("Ảnh phải có kích thước tối thiểu 8x8.");
  }
  const n = NOISE_BLOCK * NOISE_BLOCK;

  const stds: number[] = [];
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let sumCb = 0;
      let sumSqCb = 0;
      let sumCr = 0;
      let sumSqCr = 0;
      for (let y = 0; y < NOISE_BLOCK; y++) {
        const row = (by * NOISE_BLOCK + y) * width + bx * NOISE_BLOCK;
        for (let x = 0; x < NOISE_BLOCK; x++) {
          const i = (row + x) * 3;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          // Chroma đặt tại 0 (bỏ +128): hằng số cộng không ảnh hưởng phương sai.
          const cb = 0.564 * (b - luma);
          const cr = 0.713 * (r - luma);
          sumCb += cb;
          sumSqCb += cb * cb;
          sumCr += cr;
          sumSqCr += cr * cr;
        }
      }
      const varCb = Math.max(0, sumSqCb / n - (sumCb / n) ** 2);
      const varCr = Math.max(0, sumSqCr / n - (sumCr / n) ** 2);
      stds.push(Math.sqrt(varCb + varCr));
    }
  }

  stds.sort((a, b) => a - b);
  const index = Math.floor((stds.length - 1) * NOISE_PERCENTILE);
  return stds[index] ?? 0;
}
