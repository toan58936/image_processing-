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
