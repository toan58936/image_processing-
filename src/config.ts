/**
 * Cấu hình tập trung của module.
 * LƯU Ý: các giá trị dưới đây là KHỞI ĐIỂM TẠM THỜI, chưa được xác nhận
 * với project chính. Khi có xác nhận, chỉ cần sửa tại file này.
 */

import type { EnhanceLevel, ImageFormat } from "./types.js";

/** Giới hạn đầu vào, dùng ở bước validate. */
export interface InputLimits {
  /** Dung lượng tối đa của Buffer đầu vào (byte). */
  readonly maxBytes: number;
  /** Số pixel tối đa (rộng x cao), chặn "ảnh bom" làm tràn RAM. */
  readonly maxPixels: number;
}

export const DEFAULT_INPUT_LIMITS: InputLimits = {
  maxBytes: 50 * 1024 * 1024, // 50 MB
  maxPixels: 100_000_000, // 100 megapixel
};

/** Các định dạng ảnh module hỗ trợ (đầu vào và đầu ra). */
export const SUPPORTED_FORMATS: readonly ImageFormat[] = [
  "jpeg",
  "png",
  "webp",
];

/** Mức xử lý mặc định khi người gọi không chỉ định. */
export const DEFAULT_LEVEL: EnhanceLevel = "standard";

/** Chất lượng nén mặc định cho jpeg/webp (PNG không dùng). */
export const DEFAULT_QUALITY = 92;

/** Khoảng chất lượng nén hợp lệ. */
export const MIN_QUALITY = 1;
export const MAX_QUALITY = 100;

/** Màu nền dùng khi làm phẳng ảnh trong suốt (PNG/WEBP có alpha). */
export const FLATTEN_BACKGROUND = { r: 255, g: 255, b: 255 } as const;
