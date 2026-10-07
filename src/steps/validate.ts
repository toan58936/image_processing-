import sharp from "sharp";

import {
  DEFAULT_INPUT_LIMITS,
  SUPPORTED_FORMATS,
  type InputLimits,
} from "../config.js";
import {
  ImageTooLargeError,
  InvalidImageError,
  UnsupportedFormatError,
} from "../errors.js";
import type { ImageInfo } from "../internal-types.js";
import type { ImageFormat, ImageInput } from "../types.js";

type SharpMetadata = Awaited<
  ReturnType<ReturnType<typeof sharp>["metadata"]>
>;

function isSupportedFormat(value: string | undefined): value is ImageFormat {
  return SUPPORTED_FORMATS.some((format) => format === value);
}

/**
 * Kiểm tra rẻ trước khi giải mã đầy đủ: chỉ đọc metadata (phần đầu file).
 * Trả về thông tin ảnh thực tế, hoặc ném lỗi có kiểu.
 *
 * LƯU Ý: file bị cắt cụt nhưng phần đầu còn nguyên có thể vượt qua bước này;
 * lỗi đó sẽ được bắt ở bước decode.
 */
export async function validate(
  input: ImageInput,
  limits: InputLimits = DEFAULT_INPUT_LIMITS,
): Promise<ImageInfo> {
  const { data } = input;

  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new InvalidImageError("Dữ liệu ảnh rỗng hoặc không phải Buffer.");
  }

  if (data.length > limits.maxBytes) {
    throw new ImageTooLargeError(
      `Dung lượng ảnh ${data.length} byte vượt giới hạn ${limits.maxBytes} byte.`,
    );
  }

  let metadata: SharpMetadata;
  try {
    metadata = await sharp(data, { limitInputPixels: false }).metadata();
  } catch (cause) {
    throw new InvalidImageError(
      "Không đọc được ảnh: dữ liệu không phải ảnh hợp lệ hoặc đã bị hỏng.",
      { cause },
    );
  }

  const format = metadata.format;
  if (!isSupportedFormat(format)) {
    throw new UnsupportedFormatError(
      `Định dạng "${String(format)}" không được hỗ trợ. Hỗ trợ: ${SUPPORTED_FORMATS.join(", ")}.`,
    );
  }

  const { width, height } = metadata;
  if (!width || !height) {
    throw new InvalidImageError("Không xác định được kích thước ảnh.");
  }

  if (width * height > limits.maxPixels) {
    throw new ImageTooLargeError(
      `Ảnh ${width}x${height} vượt giới hạn ${limits.maxPixels} pixel.`,
    );
  }

  if (input.format !== undefined && input.format !== format) {
    throw new InvalidImageError(
      `Định dạng khai báo "${input.format}" không khớp định dạng thực tế "${format}".`,
    );
  }

  return { format, width, height };
}
