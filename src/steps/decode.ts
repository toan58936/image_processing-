import sharp from "sharp";

import {
  DEFAULT_INPUT_LIMITS,
  FLATTEN_BACKGROUND,
  type InputLimits,
} from "../config.js";
import { ImageTooLargeError, InvalidImageError } from "../errors.js";
import type { RawImage } from "../internal-types.js";

/**
 * Giải mã ảnh thành pixel thô RGB 3 kênh (giải mã một lần cho cả pipeline).
 * - Xoay đúng chiều theo EXIF orientation.
 * - Ảnh trong suốt được trải lên nền trắng, rồi bỏ kênh alpha.
 * - Ảnh xám được ép thành 3 kênh; không gian màu về sRGB.
 * - Giới hạn số pixel của Sharp được bật như lớp bảo vệ thứ hai sau validate.
 * Mọi lỗi giải mã (kể cả file bị cắt cụt) được bọc thành lỗi có kiểu.
 */
export async function decode(
  data: Buffer,
  limits: InputLimits = DEFAULT_INPUT_LIMITS,
): Promise<RawImage> {
  try {
    const result = await sharp(data, { limitInputPixels: limits.maxPixels })
      .rotate()
      .flatten({ background: FLATTEN_BACKGROUND })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = result.info;
    if (channels !== 3) {
      throw new InvalidImageError(
        `Sau giải mã kỳ vọng 3 kênh nhưng nhận ${channels} kênh.`,
      );
    }

    return { data: result.data, width, height, channels };
  } catch (cause) {
    if (cause instanceof InvalidImageError) {
      throw cause;
    }
    if (cause instanceof Error && /pixel limit/i.test(cause.message)) {
      throw new ImageTooLargeError("Ảnh vượt giới hạn số pixel khi giải mã.", {
        cause,
      });
    }
    throw new InvalidImageError(
      "Không giải mã được ảnh: dữ liệu bị hỏng hoặc không đầy đủ.",
      { cause },
    );
  }
}
