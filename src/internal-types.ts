/** Kiểu nội bộ: KHÔNG export ra ngoài qua index.ts. */

import type { ImageFormat } from "./types.js";

/**
 * Ảnh dạng pixel thô, truyền giữa các bước (giải mã một lần, mã hóa một lần).
 * Luôn là RGB 3 kênh: bước decode đã bỏ alpha và ép ảnh xám về 3 kênh.
 */
export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: 3;
}

/** Mỗi bước xử lý pixel nhận một ảnh thô và trả về một ảnh thô. */
export type EnhanceStep = (image: RawImage) => Promise<RawImage>;

/** Thông tin ảnh do bước validate đọc từ metadata (chưa giải mã đầy đủ). */
export interface ImageInfo {
  /** Định dạng thực tế của ảnh (không phải định dạng do người gọi khai báo). */
  format: ImageFormat;
  width: number;
  height: number;
}
