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
