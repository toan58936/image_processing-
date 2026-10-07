import { describe, expect, it } from "vitest";

import { InvalidOptionsError } from "../src/errors.js";
import type { RawImage } from "../src/internal-types.js";
import { createToneStep } from "../src/steps/tone.js";
import { makeNoisyRaw, stdDev } from "./helpers.js";

const OFF = { strength: 0, maxSlope: 3, gamma: 1 } as const;

function makeFlat(value: number, size = 32): RawImage {
  return {
    data: Buffer.alloc(size * size * 3, value),
    width: size,
    height: size,
    channels: 3,
  };
}

describe("tone: giữ nguyên cấu trúc", () => {
  it("giữ kích thước, số kênh và độ dài dữ liệu", async () => {
    const input = makeNoisyRaw(48, 10, 3);
    const out = await createToneStep({ strength: 0.5, maxSlope: 3, gamma: 1.1 })(
      input,
    );
    expect(out.width).toBe(input.width);
    expect(out.height).toBe(input.height);
    expect(out.channels).toBe(3);
    expect(out.data.length).toBe(input.data.length);
  });

  it("không làm thay đổi Buffer đầu vào", async () => {
    const input = makeNoisyRaw(48, 10, 3);
    const copy = Buffer.from(input.data);
    await createToneStep({ strength: 1, maxSlope: 3, gamma: 1.5 })(input);
    expect(input.data.equals(copy)).toBe(true);
  });

  it("tắt cả CLAHE và gamma thì giữ nguyên dữ liệu", async () => {
    const input = makeNoisyRaw(48, 10, 3);
    const out = await createToneStep(OFF)(input);
    expect(out.data.equals(input.data)).toBe(true);
  });
});

describe("tone: gamma", () => {
  it("gamma > 1 kéo sáng đúng theo công thức", async () => {
    const out = await createToneStep({ ...OFF, gamma: 1.5 })(makeFlat(60));
    const expected = Math.round(255 * Math.pow(60 / 255, 1 / 1.5));
    expect(expected).toBeGreaterThan(60);
    expect(out.data[0]).toBe(expected);
  });

  it("gamma giữ nguyên đen tuyệt đối và trắng tuyệt đối", async () => {
    const black = await createToneStep({ ...OFF, gamma: 2 })(makeFlat(0));
    const white = await createToneStep({ ...OFF, gamma: 2 })(makeFlat(255));
    expect(black.data[0]).toBe(0);
    expect(white.data[0]).toBe(255);
  });
});

describe("tone: CLAHE", () => {
  it("tăng tương phản cục bộ trên ảnh tương phản thấp", async () => {
    const input = makeNoisyRaw(64, 10, 2);
    const out = await createToneStep({ strength: 1, maxSlope: 3, gamma: 1 })(
      input,
    );
    expect(stdDev(out.data)).toBeGreaterThan(stdDev(input.data));
  });

  it("strength lớn thay đổi ảnh nhiều hơn strength nhỏ", async () => {
    const input = makeNoisyRaw(64, 10, 2);
    const small = await createToneStep({ strength: 0.2, maxSlope: 3, gamma: 1 })(
      input,
    );
    const large = await createToneStep({ strength: 1, maxSlope: 3, gamma: 1 })(
      input,
    );
    expect(stdDev(large.data)).toBeGreaterThan(stdDev(small.data));
  });

  it("không đổi màu: ảnh xám vẫn xám sau CLAHE", async () => {
    const base = makeNoisyRaw(64, 10, 3);
    const gray = Buffer.from(base.data);
    for (let i = 0; i < gray.length; i += 3) {
      gray[i + 1] = gray[i] ?? 0;
      gray[i + 2] = gray[i] ?? 0;
    }
    const input: RawImage = { ...base, data: gray };
    const out = await createToneStep({ strength: 1, maxSlope: 3, gamma: 1 })(
      input,
    );

    let maxChannelGap = 0;
    for (let i = 0; i < out.data.length; i += 3) {
      const r = out.data[i] ?? 0;
      const g = out.data[i + 1] ?? 0;
      const b = out.data[i + 2] ?? 0;
      maxChannelGap = Math.max(
        maxChannelGap,
        Math.abs(r - g),
        Math.abs(g - b),
      );
    }
    expect(maxChannelGap).toBeLessThanOrEqual(2);
  });

  it("ảnh quá nhỏ: bỏ qua CLAHE, không báo lỗi", async () => {
    const input = makeNoisyRaw(10, 10, 4);
    const out = await createToneStep({ strength: 1, maxSlope: 3, gamma: 1 })(
      input,
    );
    expect(out.width).toBe(10);
    expect(out.data.equals(input.data)).toBe(true);
  });
});

describe("tone: kiểm tra tham số", () => {
  it.each([
    [{ strength: 1.5, maxSlope: 3, gamma: 1 }],
    [{ strength: -0.1, maxSlope: 3, gamma: 1 }],
    [{ strength: Number.NaN, maxSlope: 3, gamma: 1 }],
    [{ strength: 0.5, maxSlope: 0, gamma: 1 }],
    [{ strength: 0.5, maxSlope: 101, gamma: 1 }],
    [{ strength: 0.5, maxSlope: 2.5, gamma: 1 }],
    [{ strength: 0.5, maxSlope: 3, gamma: 0.2 }],
    [{ strength: 0.5, maxSlope: 3, gamma: 4 }],
    [{ strength: 0.5, maxSlope: 3, gamma: Number.NaN }],
  ])("báo InvalidOptionsError với tham số %j", (params) => {
    expect(() => createToneStep(params)).toThrow(InvalidOptionsError);
  });
});
