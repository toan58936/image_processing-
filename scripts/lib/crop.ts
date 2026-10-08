import type { RawImage } from "../../src/internal-types.js";

export interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Cắt một vùng chữ nhật từ ảnh thô. Ném lỗi nếu vùng vượt ngoài ảnh. */
export function cropRaw(image: RawImage, region: Region): RawImage {
  const { left, top, width, height } = region;
  if (left + width > image.width || top + height > image.height) {
    throw new Error(
      `Vùng cắt vượt ngoài ảnh ${image.width}x${image.height}: x=${left}, y=${top}, rộng=${width}, cao=${height}.`,
    );
  }
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * image.width + left) * 3;
    image.data.copy(data, y * width * 3, start, start + width * 3);
  }
  return { data, width, height, channels: 3 };
}
