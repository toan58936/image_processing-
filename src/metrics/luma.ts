import type { RawImage } from "../internal-types.js";

/** Độ sáng (luma) từng pixel, thang 0-255, không làm tròn. */
export function toLuma(image: RawImage): Float32Array {
  const { data, width, height } = image;
  const pixels = width * height;
  const out = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) {
    const i = p * 3;
    out[p] =
      0.299 * (data[i] ?? 0) +
      0.587 * (data[i + 1] ?? 0) +
      0.114 * (data[i + 2] ?? 0);
  }
  return out;
}
