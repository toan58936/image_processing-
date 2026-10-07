import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { InvalidImageError, InvalidOptionsError } from "../src/errors.js";
import type { RawImage } from "../src/internal-types.js";
import { decode } from "../src/steps/decode.js";
import { encode } from "../src/steps/encode.js";
import type { ImageFormat } from "../src/types.js";
import { makeNoisyJpeg, makeRotatedJpeg } from "./helpers.js";

/** Tạo ảnh thô có dải màu thay đổi (để kiểm tra nén có ý nghĩa). */
function makeRaw(width = 16, height = 12): RawImage {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = (i * 7) % 256;
  }
  return { data, width, height, channels: 3 };
}

describe("encode: kết quả cơ bản", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "mã hóa %s đúng định dạng và kích thước",
    async (format) => {
      const out = await encode(makeRaw(16, 12), format);
      expect(out.format).toBe(format);
      expect(out.width).toBe(16);
      expect(out.height).toBe(12);

      const meta = await sharp(out.data).metadata();
      expect(meta.format).toBe(format);
      expect(meta.width).toBe(16);
      expect(meta.height).toBe(12);
    },
  );

  it("PNG không mất dữ liệu: giải mã lại ra đúng từng pixel", async () => {
    const raw = makeRaw(16, 12);
    const out = await encode(raw, "png");
    const back = await decode(out.data);
    expect(back.width).toBe(raw.width);
    expect(back.height).toBe(raw.height);
    expect(back.data.equals(raw.data)).toBe(true);
  });
});

describe("encode: chất lượng nén", () => {
  it("JPEG chất lượng cao cho file lớn hơn chất lượng thấp", async () => {
    const raw = await decode(await makeNoisyJpeg(200));
    const high = await encode(raw, "jpeg", 95);
    const low = await encode(raw, "jpeg", 10);
    expect(high.data.length).toBeGreaterThan(low.data.length);
  });

  it("PNG chấp nhận quality hợp lệ (bị bỏ qua)", async () => {
    const out = await encode(makeRaw(), "png", 50);
    expect(out.format).toBe("png");
  });

  it.each([0, 101, 1.5, Number.NaN])(
    "báo InvalidOptionsError khi quality = %s",
    async (quality) => {
      await expect(encode(makeRaw(), "jpeg", quality)).rejects.toBeInstanceOf(
        InvalidOptionsError,
      );
    },
  );
});

describe("encode: đầu vào không hợp lệ", () => {
  it("báo InvalidOptionsError với định dạng đầu ra không hỗ trợ", async () => {
    const bad = "gif" as unknown as ImageFormat;
    await expect(encode(makeRaw(), bad)).rejects.toBeInstanceOf(
      InvalidOptionsError,
    );
  });

  it("báo InvalidImageError khi pixel thô không khớp kích thước", async () => {
    const raw = makeRaw(16, 12);
    const broken: RawImage = { ...raw, data: raw.data.subarray(0, 10) };
    await expect(encode(broken, "jpeg")).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });
});

describe("encode: siêu dữ liệu", () => {
  it("ảnh đầu ra đã xoay đúng chiều và không còn EXIF orientation", async () => {
    const raw = await decode(await makeRotatedJpeg()); // 20x10 + orientation 6
    const out = await encode(raw, "jpeg");
    const meta = await sharp(out.data).metadata();
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(20);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });
});
