import sharp from "sharp";

import {
  CHROMA_NOISE_GATE,
  DEFAULT_EDGE_HIGH,
  DEFAULT_EDGE_LOW,
  DEFAULT_EDGE_SIGMA,
  DEFAULT_CHROMA_SIGMA,
  DEFAULT_CHROMA_STRENGTH,
  type DenoiseParams,
} from "../config.js";
import { InvalidImageError, InvalidOptionsError } from "../errors.js";
import type { EnhanceStep } from "../internal-types.js";
import { estimateChromaNoise, NOISE_BLOCK } from "../metrics/noise.js";

/** Hệ số YCbCr BT.601 đầy đủ dải: RGB → YCbCr. */
const CB_FROM_BLUE = 0.564;
const CR_FROM_RED = 0.713;
/** Hệ số ngược: YCbCr → RGB. */
const RED_FROM_CR = 1.402;
const GREEN_FROM_CB = 0.344136;
const GREEN_FROM_CR = 0.714136;
const BLUE_FROM_CB = 1.772;
const CHROMA_MID = 128;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
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
  const chromaSigma = params.chromaSigma ?? DEFAULT_CHROMA_SIGMA;
  if (!Number.isFinite(chromaSigma) || chromaSigma <= 0) {
    throw new InvalidOptionsError(
      `chromaSigma phải là số dương, nhận được: ${String(params.chromaSigma)}.`,
    );
  }
  const chromaStrength = params.chromaStrength ?? DEFAULT_CHROMA_STRENGTH;
  if (
    !Number.isFinite(chromaStrength) ||
    chromaStrength < 0 ||
    chromaStrength > 1
  ) {
    throw new InvalidOptionsError(
      `chromaStrength phải nằm trong khoảng 0 đến 1, nhận được: ${String(params.chromaStrength)}.`,
    );
  }
}

/** Ảnh Float32 1 kênh → Buffer uint8 (làm tròn, kẹp 0-255). */
function toUint8Channel(values: Float32Array): Buffer {
  const out = Buffer.allocUnsafe(values.length);
  for (let p = 0; p < values.length; p++) {
    const v = values[p] ?? 0;
    out[p] = clampByte(Math.round(v));
  }
  return out;
}

/** Kernel Gaussian rời rạc (kích thước 2×ceil(2σ)+1), tổng chuẩn hóa. */
function gaussianKernel(
  sigma: number,
): { size: number; kernel: number[]; scale: number } {
  const radius = Math.max(1, Math.ceil(sigma * 2));
  const size = radius * 2 + 1;
  const kernel: number[] = [];
  let scale = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      kernel.push(value);
      scale += value;
    }
  }
  return { size, kernel, scale };
}

/**
 * Làm mờ Gaussian trên ảnh 1 kênh.
 * Dùng convolve với kernel tự chuẩn hóa (không dùng .blur()):
 * .blur() sigma > 2 của libvips lệch ~+2 mức trên ảnh hằng,
 * sẽ làm dịch chuyển màu ở bước chroma.
 */
async function gaussianBlurChannel(
  channel: Buffer,
  width: number,
  height: number,
  sigma: number,
): Promise<Buffer> {
  const { size, kernel, scale } = gaussianKernel(sigma);
  return sharp(channel, { raw: { width, height, channels: 1 } })
    .grayscale()
    .convolve({ width: size, height: size, kernel, scale })
    .raw()
    .toBuffer();
}

/**
 * Tạo bước khử nhiễu tách Y/Cb/Cr.
 *
 * 1. RGB → Y, Cb, Cr (BT.601, giữ Float32).
 * 2. Luma: median + mặt nạ cạnh — chỉ lọc vùng phẳng, cạnh và
 *    vết nứt giữ nguyên nên không mất nét.
 * 3. Chroma: blur Gaussian + trộn theo chromaStrength — mắt người
 *    ít nhạy với nhiễu màu nên lọc mạnh hơn mà không mất chi tiết.
 *    Cổng thích ứng: chỉ lọc khi nhiễu chroma ước lượng của ảnh
 *    đầu vào ≥ CHROMA_NOISE_GATE. Ảnh sạch (nhiễu chroma thấp)
 *    bỏ qua lọc chroma vì chuyển đổi YCbCr qua uint8 có sai lệch
 *    ±1 LSB — sẽ TẠO nhiễu chroma mới nhiều hơn mức lọc bỏ được.
 * 4. Y', Cb', Cr' → RGB (làm tròn 1 lần).
 *
 * `strength = 0` trả đúng Buffer gốc (tắt bước). Ảnh xám (R = G = B)
 * có Cb = Cr = 128 hằng → chroma path là identity.
 * Lưu ý: chuyển đổi qua uint8 YCbCr có sai lệch ±1 LSB trên ảnh màu
 * (PSNR floor ≈ 48 dB, không đáng kể so với 20–27 dB của pipeline).
 * Không thay đổi kích thước hay Buffer đầu vào.
 */
export function createDenoiseStep(params: DenoiseParams): EnhanceStep {
  assertValidParams(params);
  const { medianSize, strength } = params;
  const edgeSigma = params.edgeSigma ?? DEFAULT_EDGE_SIGMA;
  const edgeLow = params.edgeLow ?? DEFAULT_EDGE_LOW;
  const edgeHigh = params.edgeHigh ?? DEFAULT_EDGE_HIGH;
  const chromaSigma = params.chromaSigma ?? DEFAULT_CHROMA_SIGMA;
  const chromaStrength = params.chromaStrength ?? DEFAULT_CHROMA_STRENGTH;
  const span = edgeHigh - edgeLow;

  return async (image) => {
    const { data, width, height, channels } = image;
    if (strength === 0) {
      return { data: Buffer.from(data), width, height, channels };
    }
    const pixels = width * height;

    // 1. RGB → Y, Cb, Cr (Float32)
    const y = new Float32Array(pixels);
    const cb = new Float32Array(pixels);
    const cr = new Float32Array(pixels);
    for (let p = 0; p < pixels; p++) {
      const i = p * 3;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      y[p] = luma;
      cb[p] = CHROMA_MID + CB_FROM_BLUE * (b - luma);
      cr[p] = CHROMA_MID + CR_FROM_RED * (r - luma);
    }

    // 2. Luma path: median + mặt nạ cạnh
    const yUint8 = toUint8Channel(y);
    const [blurredY, medianY] = await Promise.all([
      gaussianBlurChannel(yUint8, width, height, edgeSigma),
      sharp(yUint8, { raw: { width, height, channels: 1 } })
        .grayscale()
        .median(medianSize)
        .raw()
        .toBuffer(),
    ]);
    if (blurredY.length !== pixels || medianY.length !== pixels) {
      throw new InvalidImageError(
        `Khử nhiễu luma trả về ${String(blurredY.length)}/${String(medianY.length)} byte, kỳ vọng ${String(pixels)}.`,
      );
    }

    // 3. Chroma path: blur + trộn (không mặt nạ cạnh),
    //    chỉ khi ảnh thực sự có nhiễu màu (cổng thích ứng).
    const chromaNoisy =
      chromaStrength > 0 &&
      width >= NOISE_BLOCK &&
      height >= NOISE_BLOCK &&
      estimateChromaNoise(image) >= CHROMA_NOISE_GATE;
    let blurredCb: Buffer | undefined;
    let blurredCr: Buffer | undefined;
    if (chromaNoisy) {
      const cbUint8 = toUint8Channel(cb);
      const crUint8 = toUint8Channel(cr);
      [blurredCb, blurredCr] = await Promise.all([
        gaussianBlurChannel(cbUint8, width, height, chromaSigma),
        gaussianBlurChannel(crUint8, width, height, chromaSigma),
      ]);
      if (blurredCb.length !== pixels || blurredCr.length !== pixels) {
        throw new InvalidImageError(
          `Khử nhiễu chroma trả về ${String(blurredCb.length)}/${String(blurredCr.length)} byte, kỳ vọng ${String(pixels)}.`,
        );
      }
    }

    // 4. Kết hợp và ngược về RGB (làm tròn 1 lần)
    const out = Buffer.allocUnsafe(data.length);
    for (let p = 0; p < pixels; p++) {
      const i = p * 3;
      const yValue = y[p] ?? 0;
      const cbValue = cb[p] ?? 0;
      const crValue = cr[p] ?? 0;
      const edge = Math.abs(yValue - (blurredY[p] ?? 0));
      const flatness = clamp01((edgeHigh - edge) / span);
      const weight = strength * flatness;
      const newY = yValue + ((medianY[p] ?? 0) - yValue) * weight;
      const newCb =
        chromaNoisy && blurredCb
          ? cbValue + ((blurredCb[p] ?? 0) - cbValue) * chromaStrength
          : cbValue;
      const newCr =
        chromaNoisy && blurredCr
          ? crValue + ((blurredCr[p] ?? 0) - crValue) * chromaStrength
          : crValue;

      const dCb = newCb - CHROMA_MID;
      const dCr = newCr - CHROMA_MID;
      out[i] = clampByte(Math.round(newY + RED_FROM_CR * dCr));
      out[i + 1] = clampByte(
        Math.round(newY - GREEN_FROM_CB * dCb - GREEN_FROM_CR * dCr),
      );
      out[i + 2] = clampByte(Math.round(newY + BLUE_FROM_CB * dCb));
    }

    return { data: out, width, height, channels };
  };
}
