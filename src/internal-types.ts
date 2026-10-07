/** Kiểu nội bộ: KHÔNG export ra ngoài qua index.ts. */

/** Ảnh dạng pixel thô, truyền giữa các bước (giải mã một lần, mã hóa một lần). */
export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: 3 | 4;
}

/** Mỗi bước trong pipeline nhận một ảnh thô và trả về một ảnh thô. */
export type EnhanceStep = (image: RawImage) => Promise<RawImage>;
