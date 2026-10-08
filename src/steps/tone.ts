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

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
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
 * Tạo bước cân sáng và tương phản: CLAHE chỉ trên kênh độ sáng (luma) rồi gamma.
 *
 * Chiến lược luma-preserving (tránh color shift):
 *   1. Chuyển RGB sang grayscale để lấy luma BT.601 của từng pixel.
 *   2. Áp CLAHE chỉ trên kênh grayscale 1 kênh → luma mới.
 *   3. Blend: blended_luma = old_luma*(1−strength) + clahe_luma*strength.
 *   4. scale = blended_luma / old_luma → nhân cả R, G, B theo cùng tỉ lệ.
 *      → Hue và bão hòa màu được bảo toàn; chỉ độ sáng thay đổi.
 *
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

      // 1. Lấy kênh luma grayscale (1 kênh, BT.601)
      const lumaGray = await sharp(data, { raw: { width, height, channels } })
        .grayscale()
        .raw()
        .toBuffer();

      if (lumaGray.length !== width * height) {
        throw new InvalidImageError(
          `Grayscale trả về ${lumaGray.length} byte, kỳ vọng ${width * height}.`,
        );
      }

      // 2. CLAHE chỉ trên kênh grayscale (1 kênh)
      const lumaClahe = await sharp(lumaGray, {
        raw: { width, height, channels: 1 },
      })
        .clahe({ width: tile, height: tile, maxSlope })
        .toColourspace("b-w")
        .raw()
        .toBuffer();

      if (lumaClahe.length !== width * height) {
        throw new InvalidImageError(
          `CLAHE trả về ${lumaClahe.length} byte, kỳ vọng ${width * height}.`,
        );
      }

      // 3. Nhân tỉ lệ thay đổi luma vào cả R,G,B → hue và saturation không đổi
      const out = Buffer.allocUnsafe(data.length);
      for (let p = 0; p < width * height; p++) {
        const oldL = lumaGray[p] ?? 0;
        const claheL = lumaClahe[p] ?? 0;
        // Blend theo strength
        const newL = oldL * (1 - strength) + claheL * strength;
        // Scale factor; pixel hoàn toàn đen (oldL=0) → giữ nguyên
        const scale = oldL > 0 ? newL / oldL : 1;

        const ri = p * 3;
        out[ri]     = clampByte(Math.round((data[ri]     ?? 0) * scale));
        out[ri + 1] = clampByte(Math.round((data[ri + 1] ?? 0) * scale));
        out[ri + 2] = clampByte(Math.round((data[ri + 2] ?? 0) * scale));
      }
      data = out;
    }

    if (gamma !== 1) {
      data = applyGamma(data, gamma);
    }

    return { data, width, height, channels };
  };
}
