/** Các kiểu công khai: project chính chỉ cần biết những kiểu này. */

export type ImageFormat = "jpeg" | "png" | "webp";

export type EnhanceLevel = "light" | "standard" | "strong";

export interface ImageInput {
  /** Dữ liệu ảnh nhị phân (nội dung file ảnh). */
  data: Buffer;
  /** Định dạng ảnh. Bỏ trống để module tự phát hiện. */
  format?: ImageFormat;
}

export interface EnhanceOptions {
  /** Mức xử lý. Mặc định: "standard". */
  level?: EnhanceLevel;
  /** Định dạng đầu ra. Mặc định: giữ định dạng đầu vào. */
  outputFormat?: ImageFormat;
  /** Chất lượng nén 1-100 (jpeg/webp). */
  quality?: number;
}

export interface ImageOutput {
  data: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
}

export interface ImageEnhancementModule {
  enhance(input: ImageInput, options?: EnhanceOptions): Promise<ImageOutput>;
}
