import { describe, expect, it } from "vitest";

import { InvalidOptionsError } from "../src/errors.js";
import type { RawImage } from "../src/internal-types.js";
import { estimateChromaNoise, estimateNoise } from "../src/metrics/index.js";
import { createDenoiseStep } from "../src/steps/denoise.js";
import {
  makeColorNoisyRaw,
  makeHardStep,
  makeNoisyRaw,
  stdDev,
} from "./helpers.js";

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

  it("pixel trên vết nứt giữ nguyên giá trị gốc (mặt nạ cạnh)", async () => {
    const size = 32;
    const input = makeLineImage(size);
    const out = await createDenoiseStep({ medianSize: 3, strength: 0.5 })(input);

    // Cạnh mạnh (|luma − mờ| >> edgeHigh) → trọng số lọc bằng 0.
    expect(out.data[(16 * size + 16) * 3]).toBe(50);
  });

  it("cạnh gắt (bước nhảy sáng) giữ nguyên hoàn toàn", async () => {
    const input = makeHardStep(64, 100, 140);
    const out = await createDenoiseStep({ medianSize: 5, strength: 0.8 })(input);
    expect(out.data.equals(input.data)).toBe(true);
  });
});

describe("denoise: tách luma/chroma", () => {
  /** Ảnh 32x32: nửa trái đỏ (200,50,50), nửa phải xanh (50,50,200). */
  function makeColorStep(size = 32): RawImage {
    const data = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3;
        if (x < size / 2) {
          data[i] = 200;
          data[i + 1] = 50;
          data[i + 2] = 50;
        } else {
          data[i] = 50;
          data[i + 1] = 50;
          data[i + 2] = 200;
        }
      }
    }
    return { data, width: size, height: size, channels: 3 };
  }

  /** Sai lệch mỗi kênh tối đa `tolerance` mức. */
  function colorClose(
    actual: RawImage,
    expected: readonly number[],
    index: number,
    tolerance = 1,
  ): boolean {
    for (let c = 0; c < 3; c++) {
      if (
        Math.abs((actual.data[index + c] ?? 0) - (expected[c] ?? 0)) >
        tolerance
      ) {
        return false;
      }
    }
    return true;
  }

  it("lọc chroma mạnh hơn luma trên ảnh nhiễu màu", async () => {
    const input = makeColorNoisyRaw(64, 30, 1);
    const out = await createDenoiseStep({
      medianSize: 5,
      strength: 0.5,
      chromaSigma: 2.5,
      chromaStrength: 0.6,
    })(input);

    const chromaBefore = estimateChromaNoise(input);
    const chromaAfter = estimateChromaNoise(out);
    const lumaBefore = estimateNoise(input);
    const lumaAfter = estimateNoise(out);

    expect(chromaAfter).toBeLessThan(chromaBefore * 0.7);
    expect(lumaAfter).toBeLessThan(lumaBefore);
    // Tỉ lệ giảm chroma lớn hơn tỉ lệ giảm luma.
    expect(chromaAfter / chromaBefore).toBeLessThan(
      lumaAfter / lumaBefore,
    );
  });

  it("vùng màu phẳng giữ nguyên màu (sai lệch ≤ 1 mức)", async () => {
    const size = 32;
    const input = makeColorStep(size);
    const out = await createDenoiseStep({
      medianSize: 5,
      strength: 0.8,
      chromaSigma: 3,
      chromaStrength: 0.8,
    })(input);

    // Giữa mỗi vùng, xa cạnh: màu giữ nguyên (±1 LSB do chuyển đổi YCbCr).
    expect(colorClose(out, [200, 50, 50], (16 * size + 4) * 3)).toBe(true);
    expect(colorClose(out, [50, 50, 200], (16 * size + 28) * 3)).toBe(true);
  });

  it("cạnh màu: luma giữ nguyên, chroma được làm mềm", async () => {
    const size = 32;
    const input = makeColorStep(size);
    const out = await createDenoiseStep({
      medianSize: 5,
      strength: 0.8,
      chromaSigma: 3,
      chromaStrength: 0.8,
    })(input);

    // Pixel ngay cạnh biên (trái): luma ≈ luma gốc (94.85), không bị lọc.
    const i = (16 * size + 15) * 3;
    const luma =
      0.299 * (out.data[i] ?? 0) +
      0.587 * (out.data[i + 1] ?? 0) +
      0.114 * (out.data[i + 2] ?? 0);
    expect(luma).toBeCloseTo(94.85, 0);
  });

  it("cổng thích ứng: ảnh sạch (nhiễu chroma < ngưỡng) bỏ qua lọc chroma", async () => {
    const size = 32;
    const input = makeColorStep(size);
    // Ảnh phẳng màu: nhiễu chroma ước lượng bằng 0, dưới ngưỡng.
    expect(estimateChromaNoise(input)).toBeLessThan(1);

    const out = await createDenoiseStep({
      medianSize: 5,
      strength: 0.8,
      chromaSigma: 3,
      chromaStrength: 0.8,
    })(input);

    // Pixel sát cạnh màu (cuối nửa đỏ): chroma không bị trộn với
    // nửa xanh → màu giữ nguyên trong sai lệch làm tròn (±1 mức).
    // Nếu không có cổng, blur chroma sigma 3 sẽ trộn 2 màu và
    // đẩy giá trị lệch hàng chục mức.
    const i = (16 * size + 15) * 3;
    expect(Math.abs((out.data[i] ?? 0) - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs((out.data[i + 1] ?? 0) - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs((out.data[i + 2] ?? 0) - 50)).toBeLessThanOrEqual(1);
  });

  it("cổng thích ứng: ảnh nhiễu màu (nhiễu chroma ≥ ngưỡng) vẫn lọc chroma", async () => {
    const input = makeColorNoisyRaw(64, 30, 1);
    // Nhiễu độc lập từng kênh biên độ 30 → nhiễu chroma xa trên ngưỡng.
    expect(estimateChromaNoise(input)).toBeGreaterThanOrEqual(1);

    const out = await createDenoiseStep({
      medianSize: 5,
      strength: 0.5,
      chromaSigma: 2.5,
      chromaStrength: 0.6,
    })(input);

    expect(estimateChromaNoise(out)).toBeLessThan(
      estimateChromaNoise(input) * 0.7,
    );
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
    [{ medianSize: 3, strength: 0.5, edgeSigma: 0 }],
    [{ medianSize: 3, strength: 0.5, edgeSigma: -1 }],
    [{ medianSize: 3, strength: 0.5, edgeLow: -1 }],
    [{ medianSize: 3, strength: 0.5, edgeLow: 256 }],
    [{ medianSize: 3, strength: 0.5, edgeHigh: 256 }],
    [{ medianSize: 3, strength: 0.5, edgeLow: 16, edgeHigh: 16 }],
    [{ medianSize: 3, strength: 0.5, edgeLow: 20, edgeHigh: 16 }],
    [{ medianSize: 3, strength: 0.5, chromaSigma: 0 }],
    [{ medianSize: 3, strength: 0.5, chromaSigma: -1 }],
    [{ medianSize: 3, strength: 0.5, chromaStrength: -0.1 }],
    [{ medianSize: 3, strength: 0.5, chromaStrength: 1.5 }],
    [{ medianSize: 3, strength: 0.5, chromaStrength: Number.NaN }],
  ])("báo InvalidOptionsError với tham số %j", (params) => {
    expect(() => createDenoiseStep(params)).toThrow(InvalidOptionsError);
  });
});
