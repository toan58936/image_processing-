import sharp from "sharp";

import {
  DEFAULT_EDGE_HIGH,
  DEFAULT_EDGE_LOW,
  DEFAULT_EDGE_SIGMA,
  type DenoiseParams,
} from "../config.js";
import { InvalidImageError, InvalidOptionsError } from "../errors.js";
import type { EnhanceStep } from "../internal-types.js";

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function assertValidParams(params: DenoiseParams): void {
  const { medianSize, strength, edgeSigma, edgeLow, edgeHigh } = params;
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
  const sigma = edgeSigma ?? DEFAULT_EDGE_SIGMA;
  if (!Number.isFinite(sigma) || sigma <= 0) {
    throw new InvalidOptionsError(
      `edgeSigma phải là số dương, nhận được: ${String(edgeSigma)}.`,
    );
  }
  const low = edgeLow ?? DEFAULT_EDGE_LOW;
  const high = edgeHigh ?? DEFAULT_EDGE_HIGH;
  if (!Number.isFinite(low) || low < 0 || low > 255) {
    throw new InvalidOptionsError(
      `edgeLow phải nằm trong khoảng 0 đến 255, nhận được: ${String(edgeLow)}.`,
    );
  }
  if (!Number.isFinite(high) || high < 0 || high > 255) {
    throw new InvalidOptionsError(
      `edgeHigh phải nằm trong khoảng 0 đến 255, nhận được: ${String(edgeHigh)}.`,
    );
  }
  if (low >= high) {
    throw new InvalidOptionsError(
      `edgeLow (${String(low)}) phải nhỏ hơn edgeHigh (${String(high)}).`,
    );
  }
}

/**
 * Tạo bước khử nhiễu có mặt nạ cạnh.
 *
 * Median chỉ được áp dụng ở vùng phẳng — nơi nhiễu xuất hiện:
 * trọng số lọc = strength × flatness, với flatness giảm từ 1 về 0 khi
 * |luma gốc − luma sau blur| tăng từ edgeLow tới edgeHigh. Vùng có cạnh
 * (vết nứt, chi tiết mảnh) giữ nguyên pixel gốc nên không bị mất nét.
 * Trộn (thay vì median thuần) để vết nứt mảnh chỉ bị giảm tương phản
 * chứ không bị xóa hẳn. Không thay đổi kích thước hay Buffer đầu vào.
 */
export function createDenoiseStep(params: DenoiseParams): EnhanceStep {
  assertValidParams(params);
  const { medianSize, strength } = params;
  const edgeSigma = params.edgeSigma ?? DEFAULT_EDGE_SIGMA;
  const edgeLow = params.edgeLow ?? DEFAULT_EDGE_LOW;
  const edgeHigh = params.edgeHigh ?? DEFAULT_EDGE_HIGH;
  const span = edgeHigh - edgeLow;

  return async (image) => {
    const { data, width, height, channels } = image;
    const pixels = width * height;

    const [blurred, filtered] = await Promise.all([
      sharp(data, { raw: { width, height, channels } })
        .blur(edgeSigma)
        .raw()
        .toBuffer(),
      sharp(data, { raw: { width, height, channels } })
        .median(medianSize)
        .raw()
        .toBuffer(),
    ]);

    if (blurred.length !== data.length || filtered.length !== data.length) {
      throw new InvalidImageError(
        `Khử nhiễu trả về ${String(blurred.length)}/${String(filtered.length)} byte, kỳ vọng ${String(data.length)}.`,
      );
    }

    const out = Buffer.allocUnsafe(data.length);
    for (let p = 0; p < pixels; p++) {
      const i = p * 3;
      const luma =
        0.299 * (data[i] ?? 0) +
        0.587 * (data[i + 1] ?? 0) +
        0.114 * (data[i + 2] ?? 0);
      const lumaBlur =
        0.299 * (blurred[i] ?? 0) +
        0.587 * (blurred[i + 1] ?? 0) +
        0.114 * (blurred[i + 2] ?? 0);
      const flatness = clamp01((edgeHigh - Math.abs(luma - lumaBlur)) / span);
      const weight = strength * flatness;
      out[i] = Math.round(
        (data[i] ?? 0) + ((filtered[i] ?? 0) - (data[i] ?? 0)) * weight,
      );
      out[i + 1] = Math.round(
        (data[i + 1] ?? 0) + ((filtered[i + 1] ?? 0) - (data[i + 1] ?? 0)) * weight,
      );
      out[i + 2] = Math.round(
        (data[i + 2] ?? 0) + ((filtered[i + 2] ?? 0) - (data[i + 2] ?? 0)) * weight,
      );
    }

    return { data: out, width, height, channels };
  };
}
