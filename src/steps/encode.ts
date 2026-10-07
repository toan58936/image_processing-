import sharp from "sharp";

import {
  DEFAULT_QUALITY,
  MAX_QUALITY,
  MIN_QUALITY,
  SUPPORTED_FORMATS,
} from "../config.js";
import { InvalidImageError, InvalidOptionsError } from "../errors.js";
import type { RawImage } from "../internal-types.js";
import type { ImageFormat, ImageOutput } from "../types.js";

function assertValidQuality(quality: number): void {
  if (
    !Number.isInteger(quality) ||
    quality < MIN_QUALITY ||
    quality > MAX_QUALITY
  ) {
    throw new InvalidOptionsError(
      `quality phải là số nguyên từ ${MIN_QUALITY} đến ${MAX_QUALITY}, nhận được: ${String(quality)}.`,
    );
  }
}

/**
 * Mã hóa pixel thô RGB thành Buffer ảnh (nén một lần duy nhất cho cả pipeline).
 * - quality chỉ có tác dụng với jpeg/webp; PNG không mất dữ liệu nên bỏ qua,
 *   nhưng giá trị truyền vào vẫn được kiểm tra để lỗi cấu hình không bị che.
 * - Siêu dữ liệu (EXIF, GPS...) không được ghi vào ảnh đầu ra.
 */
export async function encode(
  image: RawImage,
  format: ImageFormat,
  quality?: number,
): Promise<ImageOutput> {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new InvalidOptionsError(
      `Định dạng đầu ra "${String(format)}" không được hỗ trợ. Hỗ trợ: ${SUPPORTED_FORMATS.join(", ")}.`,
    );
  }

  if (quality !== undefined) {
    assertValidQuality(quality);
  }
  const q = quality ?? DEFAULT_QUALITY;

  const { data, width, height, channels } = image;
  if (data.length !== width * height * channels) {
    throw new InvalidImageError(
      `Kích thước pixel thô không khớp: ${data.length} byte, kỳ vọng ${width * height * channels}.`,
    );
  }

  const pipeline = sharp(data, { raw: { width, height, channels } });

  switch (format) {
    case "jpeg":
      // 4:4:4 giữ màu ở cạnh và nét chữ, không làm mờ màu như 4:2:0.
      pipeline.jpeg({ quality: q, chromaSubsampling: "4:4:4" });
      break;
    case "webp":
      pipeline.webp({ quality: q });
      break;
    case "png":
      pipeline.png();
      break;
  }

  const result = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    data: result.data,
    format,
    width: result.info.width,
    height: result.info.height,
  };
}
