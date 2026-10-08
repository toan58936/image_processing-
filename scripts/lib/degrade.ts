import sharp from "sharp";

import type { RawImage } from "../../src/internal-types.js";

export interface DegradeOptions {
  /** Độ mờ (sigma); 0 = không làm mờ. */
  blurSigma: number;
  /** Biên độ nhiễu đều +-amplitude cho từng kênh; 0 = không nhiễu. */
  noiseAmplitude: number;
  /** Gamma làm tối: lớn hơn 1 = tối hơn; 1 = giữ nguyên. */
  gamma: number;
  /** Hạt giống: cùng seed cho cùng kết quả. */
  seed: number;
}

/** Mức làm xấu mặc định cho benchmark (giá trị khởi điểm, có thể chỉnh). */
export const DEFAULT_DEGRADE: DegradeOptions = {
  blurSigma: 1.5,
  noiseAmplitude: 12,
  gamma: 1.4,
  seed: 42,
};

/** Bộ sinh số ngẫu nhiên có hạt giống. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Làm xấu ảnh: làm mờ, làm tối, thêm nhiễu (theo thứ tự đó). Tái lập được. */
export async function degrade(
  image: RawImage,
  options: DegradeOptions = DEFAULT_DEGRADE,
): Promise<RawImage> {
  const { data, width, height, channels } = image;
  const { blurSigma, noiseAmplitude, gamma, seed } = options;

  let working: Buffer = data;
  if (blurSigma > 0) {
    working = await sharp(data, { raw: { width, height, channels } })
      .blur(Math.max(0.3, blurSigma))
      .raw()
      .toBuffer();
  }

  const random = mulberry32(seed);
  const out = Buffer.allocUnsafe(working.length);
  for (let i = 0; i < working.length; i++) {
    let value = working[i] ?? 0;
    if (gamma !== 1) {
      value = 255 * Math.pow(value / 255, gamma);
    }
    if (noiseAmplitude > 0) {
      value += (random() * 2 - 1) * noiseAmplitude;
    }
    out[i] = Math.max(0, Math.min(255, Math.round(value)));
  }

  return { data: out, width, height, channels };
}
