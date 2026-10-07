import sharp from "sharp";

import type { ToneParams } from "../config.js";
import { InvalidImageError, InvalidOptionsError } from "../errors.js";
import type { EnhanceStep } from "../internal-types.js";

/** Cửa sổ CLAHE ~ 1/8 cạnh ngắn của ảnh, kẹp trong [MIN_TILE, MAX_TILE]. */
const TILES_ACROSS = 8;
const MIN_TILE = 8;
const MAX_TILE = 128;
/** Ảnh có cạnh ngắn dưới ngưỡng này thì bỏ qua CLAHE. */
const MIN_SIDE_FOR_CLAHE = 2 * MIN_TILE;

function assertValidParams(params: ToneParams): void {
  const { strength, maxSlope, gamma } = params;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new InvalidOptionsError(
      `tone.strength phải nằm trong khoảng 0 đến 1, nhận được: ${String(strength)}.`,
    );
  }
  if (!Number.isInteger(maxSlope) || maxSlope < 1 || maxSlope > 100) {
    throw new InvalidOptionsError(
      `tone.maxSlope phải là số nguyên từ 1 đến 100, nhận được: ${String(maxSlope)}.`,
    );
  }
  if (!Number.isFinite(gamma) || gamma < 0.5 || gamma > 3) {
    throw new InvalidOptionsError(
      `tone.gamma phải nằm trong khoảng 0.5 đến 3, nhận được: ${String(gamma)}.`,
    );
  }
}

/** Trộn ảnh đã xử lý với ảnh gốc: out = gốc*(1-s) + xử lý*s. */
function blend(original: Buffer, processed: Buffer, strength: number): Buffer {
  const keep = 1 - strength;
  const out = Buffer.allocUnsafe(original.length);
  for (let i = 0; i < original.length; i++) {
    out[i] = Math.round(
      (original[i] ?? 0) * keep + (processed[i] ?? 0) * strength,
    );
  }
  return out;
}

/** Áp gamma bằng bảng tra 256 giá trị: out = 255 * (in/255)^(1/gamma). */
function applyGamma(data: Buffer, gamma: number): Buffer {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, 1 / gamma));
  }
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = lut[data[i] ?? 0] ?? 0;
  }
  return out;
}

/**
 * Tạo bước cân sáng và tương phản: CLAHE (trộn với ảnh gốc) rồi gamma.
 * Không thay đổi kích thước hay Buffer đầu vào.
 */
export function createToneStep(params: ToneParams): EnhanceStep {
  assertValidParams(params);
  const { strength, maxSlope, gamma } = params;

  return async (image) => {
    const { width, height, channels } = image;
    let data = image.data;

    const minSide = Math.min(width, height);
    if (strength > 0 && minSide >= MIN_SIDE_FOR_CLAHE) {
      const tile = Math.min(
        MAX_TILE,
        Math.max(MIN_TILE, Math.round(minSide / TILES_ACROSS)),
      );
      const equalised = await sharp(data, { raw: { width, height, channels } })
        .clahe({ width: tile, height: tile, maxSlope })
        .raw()
        .toBuffer();

      if (equalised.length !== data.length) {
        throw new InvalidImageError(
          `CLAHE trả về ${equalised.length} byte, kỳ vọng ${data.length}.`,
        );
      }
      data = blend(data, equalised, strength);
    }

    if (gamma !== 1) {
      data = applyGamma(data, gamma);
    }

    return { data, width, height, channels };
  };
}
