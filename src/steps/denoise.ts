import sharp from "sharp";

import type { DenoiseParams } from "../config.js";
import { InvalidImageError, InvalidOptionsError } from "../errors.js";
import type { EnhanceStep } from "../internal-types.js";

function assertValidParams(params: DenoiseParams): void {
  const { medianSize, strength } = params;
  if (!Number.isInteger(medianSize) || medianSize < 3 || medianSize % 2 === 0) {
    throw new InvalidOptionsError(
      `medianSize phải là số nguyên lẻ từ 3 trở lên, nhận được: ${String(medianSize)}.`,
    );
  }
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new InvalidOptionsError(
      `strength phải nằm trong khoảng 0 đến 1, nhận được: ${String(strength)}.`,
    );
  }
}

/**
 * Tạo bước khử nhiễu: lọc median rồi trộn với ảnh gốc theo `strength`.
 * Trộn (thay vì dùng median thuần) để vết nứt mảnh chỉ bị giảm tương phản
 * chứ không bị xóa hẳn. Không thay đổi kích thước hay Buffer đầu vào.
 */
export function createDenoiseStep(params: DenoiseParams): EnhanceStep {
  assertValidParams(params);
  const { medianSize, strength } = params;
  const keep = 1 - strength;

  return async (image) => {
    const { data, width, height, channels } = image;

    const filtered = await sharp(data, { raw: { width, height, channels } })
      .median(medianSize)
      .raw()
      .toBuffer();

    if (filtered.length !== data.length) {
      throw new InvalidImageError(
        `Khử nhiễu trả về ${filtered.length} byte, kỳ vọng ${data.length}.`,
      );
    }

    const out = Buffer.allocUnsafe(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.round((data[i] ?? 0) * keep + (filtered[i] ?? 0) * strength);
    }

    return { data: out, width, height, channels };
  };
}
