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
  /** Mức lọc luma tối đa ở vùng phẳng, 0 (tắt) đến 1. */
  readonly strength: number;
  /** sigma blur để dò cạnh (mặc định 1.5). */
  readonly edgeSigma?: number;
  /** |luma gốc − luma mờ| dưới ngưỡng này là vùng phẳng, lọc tối đa (0-255, mặc định 4). */
  readonly edgeLow?: number;
  /** Từ ngưỡng này là cạnh/chi tiết, không lọc (0-255, phải > edgeLow, mặc định 16). */
  readonly edgeHigh?: number;
  /** sigma blur cho kênh chroma (mặc định 2.5, lớn hơn edgeSigma). */
  readonly chromaSigma?: number;
  /** Cường độ lọc chroma, 0 (tắt) đến 1 (mặc định 0.6). Mắt ít nhạy nhiễu màu nên mặc định mạnh hơn luma. */
  readonly chromaStrength?: number;
}

/** Mặc định cho mặt nạ cạnh và lọc chroma của bước khử nhiễu. */
export const DEFAULT_EDGE_SIGMA = 1.5;
export const DEFAULT_EDGE_LOW = 4;
export const DEFAULT_EDGE_HIGH = 16;
export const DEFAULT_CHROMA_SIGMA = 2.5;
export const DEFAULT_CHROMA_STRENGTH = 0.6;

/**
 * Ngưỡng nhiễu chroma để bật lọc chroma trong bước khử nhiễu.
 * Ảnh có nhiễu chroma dưới ngưỡng này (ảnh sạch) bỏ qua lọc
 * chroma: chuyển đổi YCbCr qua uint8 có sai lệch ±1 LSB,
 * sẽ TẠO nhiễu chroma mới nhiều hơn mức lọc bỏ được.
 */
export const CHROMA_NOISE_GATE = 1.0;

/** Tham số bước cân sáng và tương phản. */
export interface ToneParams {
  /** Mức trộn kết quả CLAHE với ảnh gốc, 0 (tắt CLAHE) đến 1. */
  readonly strength: number;
  /** Giới hạn khuếch đại tương phản của CLAHE (số nguyên 1-100). Thấp = nhẹ tay. */
  readonly maxSlope: number;
  /** Gamma kéo sáng vùng tối: 1 = tắt, lớn hơn 1 = sáng hơn (0.5 đến 3). */
  readonly gamma: number;
}

/** Tham số bước làm nét (unsharp mask trên độ sáng). */
export interface SharpenParams {
  /** Độ rộng làm mờ để tách chi tiết (0.3 đến 5). Nhỏ = làm nét chi tiết mịn. */
  readonly sigma: number;
  /** Cường độ làm nét, 0 (tắt) đến 3. */
  readonly amount: number;
  /** Chênh lệch độ sáng nhỏ hơn ngưỡng này bị coi là nhiễu, không làm nét (0 đến 50). */
  readonly threshold: number;
}

/** Mức tăng/giảm độ sáng tối đa mỗi pixel do làm nét, để hạn chế viền sáng (halo). */
export const SHARPEN_MAX_DELTA = 48;

/** Tham số của toàn bộ các bước cho một mức xử lý. */
export interface LevelParams {
  readonly denoise: DenoiseParams;
  readonly tone: ToneParams;
  readonly sharpen: SharpenParams;
}

/**
 * Tham số theo mức xử lý.
 * LƯU Ý: đây là giá trị khởi điểm TẠM THỜI, chưa được tinh chỉnh trên ảnh thật.
 * Để tắt một bước: denoise.strength = 0; tone.strength = 0 và tone.gamma = 1;
 * sharpen.amount = 0.
 *
 * Khử nhiễu tách Y/Cb/Cr: luma dùng median có mặt nạ cạnh
 * (chỉ lọc vùng phẳng, cạnh và vết nứt giữ nguyên), chroma
 * dùng blur Gaussian trộn theo chromaStrength (mắt ít nhạy
 * nhiễu màu nên lọc mạnh mà không mất chi tiết). Thử nghiệm
 * scripts/exp-denoise.ts (2 mẫu): giảm nhiễu luma 12–33%,
 * gần như không mất nét (−1–2%).
 */
export const LEVEL_PARAMS: Record<EnhanceLevel, LevelParams> = {
  light: {
    denoise: {
      medianSize: 3,
      strength: 0.4,
      chromaSigma: 2.0,
      chromaStrength: 0.5,
    },
    tone: { strength: 0.4, maxSlope: 3, gamma: 1.15 },
    sharpen: { sigma: 1.2, amount: 0.2, threshold: 5 },
  },
  standard: {
    denoise: {
      medianSize: 5,
      strength: 0.5,
      chromaSigma: 2.5,
      chromaStrength: 0.6,
    },
    tone: { strength: 0.55, maxSlope: 4, gamma: 1.25 },
    sharpen: { sigma: 1.5, amount: 0.3, threshold: 4 },
  },
  strong: {
    denoise: {
      medianSize: 5,
      strength: 0.6,
      edgeSigma: 2,
      chromaSigma: 3.0,
      chromaStrength: 0.8,
    },
    tone: { strength: 0.75, maxSlope: 5, gamma: 1.35 },
    sharpen: { sigma: 1.5, amount: 0.4, threshold: 3 },
  },
};

/**
 * Làm nét chỉ được cộng/trừ tối đa tỉ lệ này của "chỗ trống" còn lại tới 255
 * (hoặc tới 0), nên không tạo thêm pixel cháy sáng hoặc cháy tối. Giá trị khởi điểm.
 */
export const SHARPEN_HEADROOM_RATIO = 0.5;
