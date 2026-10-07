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

/** Các mức xử lý hợp lệ. */
export const ENHANCE_LEVELS: readonly EnhanceLevel[] = [
  "light",
  "standard",
  "strong",
];

/** Tham số bước khử nhiễu. */
export interface DenoiseParams {
  /** Kích thước cửa sổ median (số lẻ, từ 3 trở lên). */
  readonly medianSize: number;
  /** Mức trộn kết quả median với ảnh gốc, 0 (tắt) đến 1 (hoàn toàn median). */
  readonly strength: number;
}

/** Tham số bước cân sáng và tương phản. */
export interface ToneParams {
  /** Mức trộn kết quả CLAHE với ảnh gốc, 0 (tắt CLAHE) đến 1. */
  readonly strength: number;
  /** Giới hạn khuếch đại tương phản của CLAHE (số nguyên 1-100). Thấp = nhẹ tay. */
  readonly maxSlope: number;
  /** Gamma kéo sáng vùng tối: 1 = tắt, lớn hơn 1 = sáng hơn (0.5 đến 3). */
  readonly gamma: number;
}

/** Tham số của toàn bộ các bước cho một mức xử lý. */
export interface LevelParams {
  readonly denoise: DenoiseParams;
  readonly tone: ToneParams;
}

/**
 * Tham số theo mức xử lý.
 * LƯU Ý: đây là giá trị khởi điểm TẠM THỜI, chưa được tinh chỉnh trên ảnh thật.
 * Để tắt một bước: denoise.strength = 0; tone.strength = 0 và tone.gamma = 1.
 */
export const LEVEL_PARAMS: Record<EnhanceLevel, LevelParams> = {
  light: {
    denoise: { medianSize: 3, strength: 0.3 },
    tone: { strength: 0.3, maxSlope: 2, gamma: 1 },
  },
  standard: {
    denoise: { medianSize: 3, strength: 0.5 },
    tone: { strength: 0.5, maxSlope: 3, gamma: 1.1 },
  },
  strong: {
    denoise: { medianSize: 3, strength: 0.8 },
    tone: { strength: 0.7, maxSlope: 4, gamma: 1.2 },
  },
};
