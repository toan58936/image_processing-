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
import { mulberry32 } from "../src/utils/random.js";



/** Ảnh thô xám (R = G = B cùng giá trị) trung bình 128, cộng nhiễu đều
 * +-amplitude, có hạt giống: nhiễu luma thuần, không nhiễu màu. */
export function makeNoisyRaw(size = 64, amplitude = 30, seed = 1): RawImage {
  const random = mulberry32(seed);
  const data = Buffer.alloc(size * size * 3);
  for (let p = 0; p < size * size; p++) {
    const value = 128 + (random() * 2 - 1) * amplitude;
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    data.fill(clamped, p * 3, p * 3 + 3);
  }
  return { data, width: size, height: size, channels: 3 };
}

/** Ảnh thô nhiễu độc lập từng kênh R, G, B: có cả nhiễu luma và nhiễu màu. */
export function makeColorNoisyRaw(
  size = 64,
  amplitude = 30,
  seed = 1,
): RawImage {
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

/** Ảnh xám có cạnh dọc mềm: nửa trái 100, nửa phải 140, rồi làm mờ (sigma 2). */
export async function makeBlurredEdge(size = 64): Promise<RawImage> {
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data.fill(x < size / 2 ? 100 : 140, (y * size + x) * 3, (y * size + x) * 3 + 3);
    }
  }
  const blurred = await sharp(data, {
    raw: { width: size, height: size, channels: 3 },
  })
    .blur(2)
    .raw()
    .toBuffer();
  return { data: blurred, width: size, height: size, channels: 3 };
}

/** Giá trị nhỏ nhất và lớn nhất của dãy pixel. */
export function rangeOf(data: Uint8Array): { min: number; max: number } {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Ảnh xám có cạnh dọc gắt (không làm mờ): nửa trái `low`, nửa phải `high`. */
export function makeHardStep(size: number, low: number, high: number): RawImage {
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const start = (y * size + x) * 3;
      data.fill(x < size / 2 ? low : high, start, start + 3);
    }
  }
  return { data, width: size, height: size, channels: 3 };
}
