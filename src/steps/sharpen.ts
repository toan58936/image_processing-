import sharp from "sharp";

import { SHARPEN_MAX_DELTA, type SharpenParams } from "../config.js";
import { InvalidImageError, InvalidOptionsError } from "../errors.js";
import type { EnhanceStep } from "../internal-types.js";

function assertValidParams(params: SharpenParams): void {
  const { sigma, amount, threshold } = params;
  if (!Number.isFinite(sigma) || sigma < 0.3 || sigma > 5) {
    throw new InvalidOptionsError(
      `sharpen.sigma phải nằm trong khoảng 0.3 đến 5, nhận được: ${String(sigma)}.`,
    );
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 3) {
    throw new InvalidOptionsError(
      `sharpen.amount phải nằm trong khoảng 0 đến 3, nhận được: ${String(amount)}.`,
    );
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 50) {
    throw new InvalidOptionsError(
      `sharpen.threshold phải nằm trong khoảng 0 đến 50, nhận được: ${String(threshold)}.`,
    );
  }
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/**
 * Tạo bước làm nét bằng unsharp mask trên độ sáng.
 * - Chênh lệch giữa ảnh gốc và bản làm mờ được cộng lại để cạnh rõ hơn.
 * - Chênh lệch nhỏ hơn `threshold` bị bỏ qua (không khuếch đại nhiễu).
 * - Mức thay đổi mỗi pixel bị chặn ở SHARPEN_MAX_DELTA (hạn chế halo).
 * - Cùng một lượng được cộng lên R, G, B nên không sinh viền màu.
 * Không thay đổi kích thước hay Buffer đầu vào.
 */
export function createSharpenStep(params: SharpenParams): EnhanceStep {
  assertValidParams(params);
  const { sigma, amount, threshold } = params;

  return async (image) => {
    const { data, width, height, channels } = image;
    if (amount === 0) {
      return { data: Buffer.from(data), width, height, channels };
    }

    const blurred = await sharp(data, { raw: { width, height, channels } })
      .blur(sigma)
      .raw()
      .toBuffer();

    if (blurred.length !== data.length) {
      throw new InvalidImageError(
        `Làm mờ trả về ${blurred.length} byte, kỳ vọng ${data.length}.`,
      );
    }

    const out = Buffer.allocUnsafe(data.length);
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;

      const diff =
        luma(r, g, b) -
        luma(blurred[i] ?? 0, blurred[i + 1] ?? 0, blurred[i + 2] ?? 0);

      const magnitude = Math.max(0, Math.abs(diff) - threshold) * amount;
      const signed = diff < 0 ? -magnitude : magnitude;
      const delta = Math.max(
        -SHARPEN_MAX_DELTA,
        Math.min(SHARPEN_MAX_DELTA, signed),
      );

      out[i] = clampByte(Math.round(r + delta));
      out[i + 1] = clampByte(Math.round(g + delta));
      out[i + 2] = clampByte(Math.round(b + delta));
    }

    return { data: out, width, height, channels };
  };
}
