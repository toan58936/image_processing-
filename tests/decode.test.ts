import { describe, expect, it } from "vitest";

import { ImageTooLargeError, InvalidImageError } from "../src/errors.js";
import { decode } from "../src/steps/decode.js";
import {
  makeGreyPng,
  makeImage,
  makeNoisyJpeg,
  makeRotatedJpeg,
  makeTransparentPng,
} from "./helpers.js";

describe("decode: kết quả cơ bản", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "giải mã %s thành RGB 3 kênh đúng kích thước",
    async (format) => {
      const raw = await decode(await makeImage(format, 12, 8));
      expect(raw.width).toBe(12);
      expect(raw.height).toBe(8);
      expect(raw.channels).toBe(3);
      expect(raw.data.length).toBe(12 * 8 * 3);
    },
  );
});

describe("decode: EXIF orientation", () => {
  it("xoay đúng chiều: ảnh 20x10 orientation 6 thành 10x20", async () => {
    const raw = await decode(await makeRotatedJpeg());
    expect(raw.width).toBe(10);
    expect(raw.height).toBe(20);
    expect(raw.data.length).toBe(10 * 20 * 3);
  });
});

describe("decode: kênh alpha và ảnh xám", () => {
  it("PNG trong suốt thành RGB 3 kênh, vùng trong suốt thành nền trắng", async () => {
    const raw = await decode(await makeTransparentPng());
    expect(raw.channels).toBe(3);
    expect(raw.data.length).toBe(10 * 10 * 3);
    expect(Array.from(raw.data.subarray(0, 3))).toEqual([255, 255, 255]);
  });

  it("ảnh xám 1 kênh được ép thành 3 kênh", async () => {
    const raw = await decode(await makeGreyPng(10, 10));
    expect(raw.channels).toBe(3);
    expect(raw.data.length).toBe(10 * 10 * 3);
  });
});

describe("decode: dữ liệu lỗi", () => {
  it("báo InvalidImageError với file bị cắt cụt", async () => {
    const full = await makeNoisyJpeg(200);
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    await expect(decode(truncated)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("báo InvalidImageError với dữ liệu rác", async () => {
    const data = Buffer.from("day-khong-phai-anh");
    await expect(decode(data)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("báo ImageTooLargeError khi vượt giới hạn pixel", async () => {
    const data = await makeImage("jpeg", 10, 10); // 100 pixel
    await expect(
      decode(data, { maxBytes: 1_000_000, maxPixels: 50 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
