import { describe, expect, it } from "vitest";

import {
  ImageTooLargeError,
  InvalidImageError,
  UnsupportedFormatError,
} from "../src/errors.js";
import { validate } from "../src/steps/validate.js";
import { makeImage } from "./helpers.js";

describe("validate: ảnh hợp lệ", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "chấp nhận %s và trả đúng thông tin",
    async (format) => {
      const data = await makeImage(format, 12, 8);
      const info = await validate({ data });
      expect(info).toEqual({ format, width: 12, height: 8 });
    },
  );

  it("chấp nhận khi định dạng khai báo khớp thực tế", async () => {
    const data = await makeImage("png");
    const info = await validate({ data, format: "png" });
    expect(info.format).toBe("png");
  });
});

describe("validate: dữ liệu không hợp lệ", () => {
  it("báo InvalidImageError với Buffer rỗng", async () => {
    await expect(validate({ data: Buffer.alloc(0) })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it("báo InvalidImageError khi data không phải Buffer", async () => {
    const bad = { data: "khong-phai-buffer" as unknown as Buffer };
    await expect(validate(bad)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("báo InvalidImageError với dữ liệu rác", async () => {
    const data = Buffer.from("day-khong-phai-anh-chi-la-van-ban-thuong");
    await expect(validate({ data })).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("báo InvalidImageError khi khai báo sai định dạng", async () => {
    const data = await makeImage("png");
    await expect(validate({ data, format: "jpeg" })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });
});

describe("validate: định dạng không hỗ trợ", () => {
  it.each(["gif", "tiff"] as const)(
    "báo UnsupportedFormatError với %s",
    async (format) => {
      const data = await makeImage(format);
      await expect(validate({ data })).rejects.toBeInstanceOf(
        UnsupportedFormatError,
      );
    },
  );
});

describe("validate: vượt giới hạn", () => {
  it("báo ImageTooLargeError khi vượt maxBytes", async () => {
    const data = await makeImage("jpeg");
    await expect(
      validate({ data }, { maxBytes: 10, maxPixels: 1_000_000 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it("báo ImageTooLargeError khi vượt maxPixels", async () => {
    const data = await makeImage("jpeg", 10, 10); // 100 pixel
    await expect(
      validate({ data }, { maxBytes: 1_000_000, maxPixels: 50 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it("chấp nhận ảnh đúng bằng giới hạn", async () => {
    const data = await makeImage("jpeg", 10, 10);
    const info = await validate(
      { data },
      { maxBytes: 1_000_000, maxPixels: 100 },
    );
    expect(info.width).toBe(10);
  });
});
