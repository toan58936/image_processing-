import sharp from "sharp";

export type MakeFormat = "jpeg" | "png" | "webp" | "gif" | "tiff";

/** Tự sinh một ảnh RGB đơn sắc để dùng trong test. */
export async function makeImage(
  format: MakeFormat = "jpeg",
  width = 10,
  height = 10,
): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  });

  switch (format) {
    case "jpeg":
      return base.jpeg().toBuffer();
    case "png":
      return base.png().toBuffer();
    case "webp":
      return base.webp().toBuffer();
    case "gif":
      return base.gif().toBuffer();
    case "tiff":
      return base.tiff().toBuffer();
  }
}

/** JPEG 20x10 gắn EXIF orientation 6 (khi hiển thị đúng chiều sẽ thành 10x20). */
export async function makeRotatedJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 20,
      height: 10,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

/** PNG 10x10 có alpha, toàn bộ pixel trong suốt (nền đỏ, alpha = 0). */
export async function makeTransparentPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

/** PNG ảnh xám 1 kênh. */
export async function makeGreyPng(width = 10, height = 10): Promise<Buffer> {
  const raw = Buffer.alloc(width * height, 100);
  return sharp(raw, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** JPEG chứa nhiễu ngẫu nhiên (đủ lớn để việc cắt cụt có ý nghĩa). */
export async function makeNoisyJpeg(size = 200): Promise<Buffer> {
  const raw = Buffer.alloc(size * size * 3);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = Math.floor(Math.random() * 256);
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg()
    .toBuffer();
}

import type { RawImage } from "../src/internal-types.js";

/** Bộ sinh số ngẫu nhiên có hạt giống: cùng seed cho cùng dãy số. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ảnh thô xám trung bình (128) cộng nhiễu đều +-amplitude, có hạt giống. */
export function makeNoisyRaw(size = 64, amplitude = 30, seed = 1): RawImage {
  const random = mulberry32(seed);
  const data = Buffer.alloc(size * size * 3);
  for (let i = 0; i < data.length; i++) {
    const value = 128 + (random() * 2 - 1) * amplitude;
    data[i] = Math.max(0, Math.min(255, Math.round(value)));
  }
  return { data, width: size, height: size, channels: 3 };
}

/** PNG (không mất dữ liệu) của ảnh nhiễu trên, để đưa vào enhance(). */
export async function makeNoisyFlatPng(
  size = 64,
  amplitude = 30,
  seed = 1,
): Promise<Buffer> {
  const raw = makeNoisyRaw(size, amplitude, seed);
  return sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .png()
    .toBuffer();
}

/** Độ lệch chuẩn của dãy giá trị pixel (đo mức nhiễu trên vùng phẳng). */
export function stdDev(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
  const mean = sum / data.length;
  let sq = 0;
  for (let i = 0; i < data.length; i++) {
    const d = (data[i] ?? 0) - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / data.length);
}

/** Sai khác tuyệt đối trung bình giữa hai dãy pixel cùng độ dài. */
export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("meanAbsDiff: hai dãy phải cùng độ dài và không rỗng");
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return sum / a.length;
}
