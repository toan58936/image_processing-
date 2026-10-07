import { describe, expect, it } from "vitest";

import { InvalidOptionsError } from "../src/errors.js";
import type { RawImage } from "../src/internal-types.js";
import { createDenoiseStep } from "../src/steps/denoise.js";
import { makeNoisyRaw, stdDev } from "./helpers.js";

/** Nền phẳng 200, có một đường ngang mảnh 1 pixel giá trị 50 (giống vết nứt). */
function makeLineImage(size = 32): RawImage {
  const data = Buffer.alloc(size * size * 3, 200);
  const row = Math.floor(size / 2);
  data.fill(50, row * size * 3, (row + 1) * size * 3);
  return { data, width: size, height: size, channels: 3 };
}

describe("denoise: giữ nguyên cấu trúc", () => {
  it("giữ kích thước, số kênh và độ dài dữ liệu", async () => {
    const input = makeNoisyRaw(48, 30, 3);
    const out = await createDenoiseStep({ medianSize: 3, strength: 0.5 })(input);
    expect(out.width).toBe(input.width);
    expect(out.height).toBe(input.height);
    expect(out.channels).toBe(3);
    expect(out.data.length).toBe(input.data.length);
  });

  it("không làm thay đổi Buffer đầu vào", async () => {
    const input = makeNoisyRaw(48, 30, 3);
    const copy = Buffer.from(input.data);
    await createDenoiseStep({ medianSize: 3, strength: 0.8 })(input);
    expect(input.data.equals(copy)).toBe(true);
  });

  it("strength = 0 trả về đúng dữ liệu gốc", async () => {
    const input = makeNoisyRaw(48, 30, 3);
    const out = await createDenoiseStep({ medianSize: 3, strength: 0 })(input);
    expect(out.data.equals(input.data)).toBe(true);
  });
});

describe("denoise: giảm nhiễu", () => {
  it("giảm độ lệch chuẩn trên vùng phẳng", async () => {
    const input = makeNoisyRaw(64, 30, 5);
    const before = stdDev(input.data);
    const out = await createDenoiseStep({ medianSize: 3, strength: 0.5 })(input);
    expect(stdDev(out.data)).toBeLessThan(before);
  });

  it("strength lớn khử nhiễu mạnh hơn strength nhỏ", async () => {
    const input = makeNoisyRaw(64, 30, 5);
    const light = await createDenoiseStep({ medianSize: 3, strength: 0.3 })(input);
    const strong = await createDenoiseStep({ medianSize: 3, strength: 0.8 })(input);
    expect(stdDev(strong.data)).toBeLessThan(stdDev(light.data));
  });
});

describe("denoise: bảo vệ chi tiết mảnh", () => {
  it("đường mảnh (vết nứt) không bị xóa hẳn, vùng phẳng không đổi", async () => {
    const size = 32;
    const input = makeLineImage(size);
    const out = await createDenoiseStep({ medianSize: 3, strength: 0.5 })(input);

    const at = (row: number, col: number): number =>
      out.data[(row * size + col) * 3] ?? -1;

    expect(at(16, 16)).toBeLessThan(190); // vẫn tối hơn nền 200
    expect(at(5, 16)).toBe(200); // vùng phẳng giữ nguyên
  });
});

describe("denoise: kiểm tra tham số", () => {
  it.each([
    [{ medianSize: 3, strength: 1.5 }],
    [{ medianSize: 3, strength: -0.1 }],
    [{ medianSize: 3, strength: Number.NaN }],
    [{ medianSize: 2, strength: 0.5 }],
    [{ medianSize: 4, strength: 0.5 }],
    [{ medianSize: 1, strength: 0.5 }],
    [{ medianSize: 3.5, strength: 0.5 }],
  ])("báo InvalidOptionsError với tham số %j", (params) => {
    expect(() => createDenoiseStep(params)).toThrow(InvalidOptionsError);
  });
});
