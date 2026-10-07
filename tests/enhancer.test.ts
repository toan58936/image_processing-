import sharp from "sharp";
import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";
import {
  enhance,
  ImageEnhancementError,
  ImageTooLargeError,
  InvalidImageError,
  InvalidOptionsError,
  UnsupportedFormatError,
} from "../src/index.js";
import type { ImageInput } from "../src/index.js";
import {
  makeImage,
  makeNoisyFlatPng,
  makeNoisyJpeg,
  makeRotatedJpeg,
  makeTransparentPng,
  meanAbsDiff,
} from "./helpers.js";

describe("enhance: luồng cơ bản", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "giữ định dạng và kích thước đầu vào (%s)",
    async (format) => {
      const data = await makeImage(format, 24, 16);
      const out = await enhance({ data });
      expect(out.format).toBe(format);
      expect(out.width).toBe(24);
      expect(out.height).toBe(16);

      const meta = await sharp(out.data).metadata();
      expect(meta.format).toBe(format);
      expect(meta.width).toBe(24);
      expect(meta.height).toBe(16);
    },
  );

  it("outputFormat ghi đè định dạng đầu vào", async () => {
    const data = await makeImage("jpeg", 24, 16);
    const out = await enhance({ data }, { outputFormat: "webp" });
    expect(out.format).toBe("webp");
    expect((await sharp(out.data).metadata()).format).toBe("webp");
  });

  it("chấp nhận khai báo format khớp thực tế", async () => {
    const data = await makeImage("png");
    const out = await enhance({ data, format: "png" });
    expect(out.format).toBe("png");
  });

  it("xoay đúng chiều theo EXIF và bỏ EXIF khỏi đầu ra", async () => {
    const out = await enhance({ data: await makeRotatedJpeg() });
    expect(out.width).toBe(10);
    expect(out.height).toBe(20);
    const meta = await sharp(out.data).metadata();
    expect(meta.orientation).toBeUndefined();
  });

  it("ảnh trong suốt thành ảnh đặc trên nền trắng", async () => {
    const out = await enhance({ data: await makeTransparentPng() });
    const { data, info } = await sharp(out.data)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect(Array.from(data.subarray(0, 3))).toEqual([255, 255, 255]);
  });

  it.each(["light", "standard", "strong"] as const)(
    "chấp nhận level %s",
    async (level) => {
      const data = await makeImage("jpeg");
      const out = await enhance({ data }, { level });
      expect(out.width).toBe(10);
    },
  );
});

describe("enhance: tính chất của hàm", () => {
  it("cùng đầu vào cho cùng đầu ra (xác định)", async () => {
    const data = await makeNoisyJpeg(64);
    const a = await enhance({ data }, { level: "standard" });
    const b = await enhance({ data }, { level: "standard" });
    expect(a.data.equals(b.data)).toBe(true);
  });

  it("không giữ trạng thái: gọi song song vẫn cho kết quả đúng", async () => {
    const inputs = await Promise.all([
      makeImage("jpeg", 10, 10),
      makeImage("png", 20, 10),
      makeImage("webp", 30, 10),
    ]);
    const outs = await Promise.all(inputs.map((data) => enhance({ data })));
    expect(outs.map((o) => [o.format, o.width, o.height])).toEqual([
      ["jpeg", 10, 10],
      ["png", 20, 10],
      ["webp", 30, 10],
    ]);
  });

  it("không làm thay đổi Buffer đầu vào", async () => {
    const data = await makeNoisyJpeg(64);
    const copy = Buffer.from(data);
    await enhance({ data });
    expect(data.equals(copy)).toBe(true);
  });
});

describe("enhance: lỗi có kiểu ra tới project chính", () => {
  it("dữ liệu rác: InvalidImageError, là con của ImageEnhancementError", async () => {
    const data = Buffer.from("khong-phai-anh");
    const error = await enhance({ data }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidImageError);
    expect(error).toBeInstanceOf(ImageEnhancementError);
  });

  it("Buffer rỗng: InvalidImageError", async () => {
    await expect(enhance({ data: Buffer.alloc(0) })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it("input không phải object: InvalidImageError", async () => {
    const bad = null as unknown as ImageInput;
    await expect(enhance(bad)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("GIF: UnsupportedFormatError", async () => {
    const data = await makeImage("gif");
    await expect(enhance({ data })).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });

  it("khai báo sai format: InvalidImageError", async () => {
    const data = await makeImage("png");
    await expect(enhance({ data, format: "jpeg" })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it("ảnh quá nặng: ImageTooLargeError", async () => {
    // Ảnh nhiễu 4000x4000 nén ra lớn hơn 50 MB nên chạm maxBytes mặc định.
    // Dùng Buffer giả rỗng ruột để không tốn thời gian sinh ảnh thật.
    const data = Buffer.alloc(51 * 1024 * 1024);
    await expect(enhance({ data })).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});

describe("enhance: kiểm tra tùy chọn", () => {
  it.each([
    ["level", { level: "sieu-manh" }],
    ["outputFormat", { outputFormat: "gif" }],
    ["quality quá lớn", { quality: 150 }],
    ["quality bằng 0", { quality: 0 }],
  ])("%s không hợp lệ: InvalidOptionsError", async (_name, options) => {
    const data = await makeImage("jpeg");
    await expect(
      enhance({ data }, options as never),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
  });

  it("tùy chọn được kiểm tra TRƯỚC khi xử lý ảnh", async () => {
    const data = Buffer.from("khong-phai-anh");
    await expect(
      enhance({ data }, { level: "sai" as never }),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
  });

  it("options không phải object: InvalidOptionsError", async () => {
    const data = await makeImage("jpeg");
    await expect(
      enhance({ data }, null as never),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
  });
});

describe("enhance: giao diện công khai", () => {
  it("chỉ export đúng những gì đã cam kết, không lộ bước nội bộ", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "enhance",
        "ImageEnhancementError",
        "ImageTooLargeError",
        "InvalidImageError",
        "InvalidOptionsError",
        "UnsupportedFormatError",
      ].sort(),
    );
  });
});

describe("enhance: tác động của pipeline", () => {
  it("ảnh được thay đổi nhưng giữ kích thước và định dạng", async () => {
    const data = await makeNoisyFlatPng(64, 30, 7);
    const out = await enhance({ data });
    expect(out.format).toBe("png");
    expect(out.width).toBe(64);
    expect(out.height).toBe(64);

    const before = await sharp(data).raw().toBuffer();
    const after = await sharp(out.data).raw().toBuffer();
    expect(meanAbsDiff(before, after)).toBeGreaterThan(0);
  });

  it("level cao thay đổi ảnh nhiều hơn level thấp", async () => {
    const data = await makeNoisyFlatPng(64, 30, 7);
    const before = await sharp(data).raw().toBuffer();

    const diff = async (level: "light" | "strong"): Promise<number> => {
      const out = await enhance({ data }, { level });
      return meanAbsDiff(before, await sharp(out.data).raw().toBuffer());
    };

    expect(await diff("light")).toBeLessThan(await diff("strong"));
  });
});
