import type { RawImage } from "../internal-types.js";
import { toLuma } from "./luma.js";

const SSIM_WINDOW = 8;
const SSIM_STRIDE = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

function assertSameSize(a: RawImage, b: RawImage): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(
      `Hai ảnh phải cùng kích thước: ${a.width}x${a.height} và ${b.width}x${b.height}.`,
    );
  }
}

/** PSNR (dB) trên cả ba kênh. Hai ảnh giống hệt nhau cho Infinity. */
export function psnr(a: RawImage, b: RawImage): number {
  assertSameSize(a, b);
  let squared = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = (a.data[i] ?? 0) - (b.data[i] ?? 0);
    squared += d * d;
  }
  const mse = squared / a.data.length;
  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

/**
 * SSIM bản đơn giản: cửa sổ đều 8x8, bước 4, tính trên độ sáng.
 * Chỉ dùng để so sánh giữa các mức xử lý, không so với số liệu trong tài liệu khoa học.
 */
export function ssim(a: RawImage, b: RawImage): number {
  assertSameSize(a, b);
  const { width, height } = a;
  if (width < SSIM_WINDOW || height < SSIM_WINDOW) {
    throw new RangeError("Ảnh phải có kích thước tối thiểu 8x8.");
  }
  const lumaA = toLuma(a);
  const lumaB = toLuma(b);
  const n = SSIM_WINDOW * SSIM_WINDOW;

  let total = 0;
  let count = 0;
  for (let y = 0; y + SSIM_WINDOW <= height; y += SSIM_STRIDE) {
    for (let x = 0; x + SSIM_WINDOW <= width; x += SSIM_STRIDE) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let wy = 0; wy < SSIM_WINDOW; wy++) {
        const row = (y + wy) * width + x;
        for (let wx = 0; wx < SSIM_WINDOW; wx++) {
          const va = lumaA[row + wx] ?? 0;
          const vb = lumaB[row + wx] ?? 0;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const ma = sa / n;
      const mb = sb / n;
      const varA = saa / n - ma * ma;
      const varB = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      total +=
        ((2 * ma * mb + C1) * (2 * cov + C2)) /
        ((ma * ma + mb * mb + C1) * (varA + varB + C2));
      count++;
    }
  }
  return total / count;
}
