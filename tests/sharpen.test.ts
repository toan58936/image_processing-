import { describe, expect, it } from "vitest";

import { SHARPEN_MAX_DELTA } from "../src/config.js";
import { InvalidOptionsError } from "../src/errors.js";
import type { RawImage } from "../src/internal-types.js";
import { createSharpenStep } from "../src/steps/sharpen.js";
import { makeBlurredEdge, makeNoisyRaw, rangeOf, stdDev } from "./helpers.js";

const BASE = { sigma: 1, amount: 1, threshold: 0 } as const;

function makeFlat(value: number, size = 32): RawImage {
  return {
    data: Buffer.alloc(size * size * 3, value),
    width: size,
    height: size,
    channels: 3,
  };
}

describe("sharpen: giữ nguyên cấu trúc", () => {
  it("giữ kích thước, số kênh và độ dài dữ liệu", async () => {
    const input = makeNoisyRaw(48, 20, 3);
    const out = await createSharpenStep(BASE)(input);
    expect(out.width).toBe(input.width);
    expect(out.height).toBe(input.height);
    expect(out.channels).toBe(3);
    expect(out.data.length).toBe(input.data.length);
  });

  it("không làm thay đổi Buffer đầu vào", async () => {
    const input = makeNoisyRaw(48, 20, 3);
    const copy = Buffer.from(input.data);
    await createSharpenStep({ ...BASE, amount: 2 })(input);
    expect(input.data.equals(copy)).toBe(true);
  });

  it("amount = 0 trả về đúng dữ liệu gốc", async () => {
    const input = makeNoisyRaw(48, 20, 3);
    const out = await createSharpenStep({ ...BASE, amount: 0 })(input);
    expect(out.data.equals(input.data)).toBe(true);
  });

  it("ảnh phẳng không bị thay đổi", async () => {
    const input = makeFlat(120);
    const out = await createSharpenStep(BASE)(input);
    expect(out.data.equals(input.data)).toBe(true);
  });
});

describe("sharpen: làm nét cạnh", () => {
  it("cạnh mềm thành tương phản hơn: vọt lên trên và xuống dưới hai mức phẳng", async () => {
    const input = await makeBlurredEdge(64);
    const before = rangeOf(input.data);
    const out = await createSharpenStep({ sigma: 1, amount: 2, threshold: 0 })(
      input,
    );
    const after = rangeOf(out.data);

    expect(after.min).toBeLessThan(before.min);
    expect(after.max).toBeGreaterThan(before.max);
    expect(stdDev(out.data)).toBeGreaterThan(stdDev(input.data));
  });

  it("amount lớn làm nét mạnh hơn amount nhỏ", async () => {
    const input = await makeBlurredEdge(64);
    const small = await createSharpenStep({ ...BASE, amount: 0.5 })(input);
    const large = await createSharpenStep({ ...BASE, amount: 2 })(input);
    expect(stdDev(large.data)).toBeGreaterThan(stdDev(small.data));
  });

  it("mức thay đổi mỗi pixel không vượt giới hạn chống halo", async () => {
    const input = await makeBlurredEdge(64);
    const before = rangeOf(input.data);
    const out = await createSharpenStep({ sigma: 1, amount: 3, threshold: 0 })(
      input,
    );
    const after = rangeOf(out.data);
    expect(after.max).toBeLessThanOrEqual(before.max + SHARPEN_MAX_DELTA);
    expect(after.min).toBeGreaterThanOrEqual(before.min - SHARPEN_MAX_DELTA);
  });
});

describe("sharpen: không khuếch đại nhiễu nhỏ", () => {
  it("nhiễu dưới ngưỡng threshold được giữ nguyên", async () => {
    const input = makeNoisyRaw(64, 3, 9); // nhiễu biên độ +-3
    const out = await createSharpenStep({ sigma: 1, amount: 2, threshold: 10 })(
      input,
    );
    expect(out.data.equals(input.data)).toBe(true);
  });

  it("threshold = 0 thì nhiễu bị khuếch đại", async () => {
    const input = makeNoisyRaw(64, 3, 9);
    const out = await createSharpenStep({ sigma: 1, amount: 2, threshold: 0 })(
      input,
    );
    expect(stdDev(out.data)).toBeGreaterThan(stdDev(input.data));
  });
});

describe("sharpen: không đổi màu", () => {
  it("cùng một lượng được cộng lên cả ba kênh: ảnh xám vẫn xám", async () => {
    const base = makeNoisyRaw(64, 20, 4);
    const gray = Buffer.from(base.data);
    for (let i = 0; i < gray.length; i += 3) {
      gray[i + 1] = gray[i] ?? 0;
      gray[i + 2] = gray[i] ?? 0;
    }
    const out = await createSharpenStep({ sigma: 1, amount: 1.5, threshold: 0 })({
      ...base,
      data: gray,
    });
    for (let i = 0; i < out.data.length; i += 3) {
      expect(out.data[i + 1]).toBe(out.data[i]);
      expect(out.data[i + 2]).toBe(out.data[i]);
    }
  });
});

describe("sharpen: kiểm tra tham số", () => {
  it.each([
    [{ sigma: 0.1, amount: 1, threshold: 0 }],
    [{ sigma: 6, amount: 1, threshold: 0 }],
    [{ sigma: Number.NaN, amount: 1, threshold: 0 }],
    [{ sigma: 1, amount: -0.1, threshold: 0 }],
    [{ sigma: 1, amount: 3.5, threshold: 0 }],
    [{ sigma: 1, amount: Number.NaN, threshold: 0 }],
    [{ sigma: 1, amount: 1, threshold: -1 }],
    [{ sigma: 1, amount: 1, threshold: 51 }],
  ])("báo InvalidOptionsError với tham số %j", (params) => {
    expect(() => createSharpenStep(params)).toThrow(InvalidOptionsError);
  });
});
