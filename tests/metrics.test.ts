import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { degrade } from "../scripts/lib/degrade.js";
import type { RawImage } from "../src/internal-types.js";
import {
  brightnessStats,
  estimateChromaNoise,
  estimateNoise,
  laplacianVariance,
  measure,
  psnr,
  ssim,
  toLuma,
} from "../src/metrics/index.js";
import { makeBlurredEdge, makeColorNoisyRaw, makeNoisyRaw } from "./helpers.js";

function makeFlat(value: number, size = 32): RawImage {
  return {
    data: Buffer.alloc(size * size * 3, value),
    width: size,
    height: size,
    channels: 3,
  };
}

function makeFromLuma(
  size: number,
  valueAt: (x: number, y: number) => number,
): RawImage {
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data.fill(valueAt(x, y), (y * size + x) * 3, (y * size + x) * 3 + 3);
    }
  }
  return { data, width: size, height: size, channels: 3 };
}

async function blurred(image: RawImage, sigma: number): Promise<RawImage> {
  const data = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .blur(sigma)
    .raw()
    .toBuffer();
  return { ...image, data };
}

describe("toLuma", () => {
  it("ảnh xám giữ nguyên độ sáng", () => {
    const luma = toLuma(makeFlat(100, 4));
    expect(luma[0]).toBeCloseTo(100, 1);
  });

  it("đỏ thuần có độ sáng 0.299 * 255", () => {
    const image: RawImage = {
      data: Buffer.from([255, 0, 0]),
      width: 1,
      height: 1,
      channels: 3,
    };
    expect(toLuma(image)[0]).toBeCloseTo(76.245, 1);
  });
});

describe("laplacianVariance", () => {
  it("ảnh phẳng cho 0", () => {
    expect(laplacianVariance(makeFlat(120))).toBe(0);
  });

  it("ảnh có nhiễu lớn hơn ảnh phẳng", () => {
    expect(laplacianVariance(makeNoisyRaw(64, 30, 1))).toBeGreaterThan(0);
  });

  it("cạnh sắc có điểm cao hơn cạnh bị làm mờ", async () => {
    const sharpEdge = makeFromLuma(64, (x) => (x < 32 ? 100 : 140));
    const softEdge = await makeBlurredEdge(64);
    expect(laplacianVariance(sharpEdge)).toBeGreaterThan(
      laplacianVariance(softEdge),
    );
  });

  it("ảnh nhỏ hơn 3x3 báo RangeError", () => {
    expect(() => laplacianVariance(makeFlat(100, 2))).toThrow(RangeError);
  });
});

describe("estimateNoise", () => {
  it("ảnh phẳng cho 0", () => {
    expect(estimateNoise(makeFlat(128, 64))).toBe(0);
  });

  it("nhiễu biên độ lớn cho số lớn hơn nhiều so với nhiễu nhỏ", () => {
    const small = estimateNoise(makeNoisyRaw(64, 5, 1));
    const large = estimateNoise(makeNoisyRaw(64, 30, 1));
    expect(large).toBeGreaterThan(small * 3);
  });

  it("vùng nhiễu nhỏ trong ảnh phần lớn là phẳng không làm lệch ước lượng", () => {
    const size = 64;
    const noisy = makeNoisyRaw(size, 40, 3);
    const data = Buffer.alloc(size * size * 3, 128);
    for (let y = 0; y < size; y++) {
      const start = (y * size + 48) * 3;
      noisy.data.copy(data, start, start, (y * size + size) * 3);
    }
    const image: RawImage = { data, width: size, height: size, channels: 3 };
    expect(estimateNoise(image)).toBeLessThan(0.5);
  });

  it("ảnh nhỏ hơn 8x8 báo RangeError", () => {
    expect(() => estimateNoise(makeFlat(100, 4))).toThrow(RangeError);
  });
});

describe("estimateChromaNoise", () => {
  it("ảnh phẳng cho 0", () => {
    expect(estimateChromaNoise(makeFlat(128, 64))).toBeCloseTo(0, 5);
  });

  it("ảnh xám (R = G = B) cho 0 kể cả khi có nhiễu luma", () => {
    expect(estimateChromaNoise(makeNoisyRaw(64, 30, 1))).toBeCloseTo(0, 5);
  });

  it("nhiễu màu cho giá trị lớn hơn 0", () => {
    expect(
      estimateChromaNoise(makeColorNoisyRaw(64, 30, 1)),
    ).toBeGreaterThan(0);
  });

  it("nhiễu màu biên độ lớn cho số lớn hơn nhiều so với biên độ nhỏ", () => {
    const small = estimateChromaNoise(makeColorNoisyRaw(64, 5, 1));
    const large = estimateChromaNoise(makeColorNoisyRaw(64, 30, 1));
    expect(large).toBeGreaterThan(small * 3);
  });

  it("vùng nhiễu màu nhỏ trong ảnh phần lớn là phẳng không làm lệch ước lượng", () => {
    const size = 64;
    const noisy = makeColorNoisyRaw(size, 40, 3);
    const data = Buffer.alloc(size * size * 3, 128);
    for (let y = 0; y < size; y++) {
      const start = (y * size + 48) * 3;
      noisy.data.copy(data, start, start, (y * size + size) * 3);
    }
    const image: RawImage = { data, width: size, height: size, channels: 3 };
    expect(estimateChromaNoise(image)).toBeLessThan(0.5);
  });

  it("ảnh nhỏ hơn 8x8 báo RangeError", () => {
    expect(() => estimateChromaNoise(makeFlat(100, 4))).toThrow(RangeError);
  });
});

describe("brightnessStats", () => {
  it("ảnh phẳng: trung bình và phân vị đều bằng giá trị đó, không cháy", () => {
    const stats = brightnessStats(makeFlat(100, 16));
    expect(stats.mean).toBeCloseTo(100, 1);
    expect(stats.p1).toBe(100);
    expect(stats.p99).toBe(100);
    expect(stats.shadowClipped).toBe(0);
    expect(stats.highlightClipped).toBe(0);
  });

  it("ảnh đen hoàn toàn: toàn bộ pixel là tối cháy", () => {
    const stats = brightnessStats(makeFlat(0, 16));
    expect(stats.mean).toBe(0);
    expect(stats.shadowClipped).toBe(1);
    expect(stats.highlightClipped).toBe(0);
  });

  it("nửa đen nửa trắng: mỗi phần chiếm một nửa", () => {
    const stats = brightnessStats(makeFromLuma(16, (x) => (x < 8 ? 0 : 255)));
    expect(stats.mean).toBeCloseTo(127.5, 1);
    expect(stats.p1).toBe(0);
    expect(stats.p99).toBe(255);
    expect(stats.shadowClipped).toBeCloseTo(0.5, 5);
    expect(stats.highlightClipped).toBeCloseTo(0.5, 5);
  });
});

describe("measure", () => {
  it("gộp đủ ba nhóm chỉ số", () => {
    const m = measure(makeFlat(100, 16));
    expect(m.sharpness).toBe(0);
    expect(m.noise).toBe(0);
    expect(m.brightness.mean).toBeCloseTo(100, 1);
  });
});

describe("psnr", () => {
  it("hai ảnh giống hệt cho Infinity", () => {
    expect(psnr(makeFlat(100), makeFlat(100))).toBe(Infinity);
  });

  it("lệch đều 10 mức cho khoảng 28.13 dB", () => {
    expect(psnr(makeFlat(100), makeFlat(110))).toBeCloseTo(28.13, 1);
  });

  it("khác kích thước báo RangeError", () => {
    expect(() => psnr(makeFlat(100, 16), makeFlat(100, 32))).toThrow(RangeError);
  });
});

describe("ssim", () => {
  it("hai ảnh giống hệt cho 1", () => {
    const image = makeNoisyRaw(64, 30, 1);
    expect(ssim(image, image)).toBeCloseTo(1, 6);
  });

  it("làm mờ nhẹ giữ SSIM cao hơn làm mờ mạnh, và đều nhỏ hơn 1", async () => {
    const base = makeNoisyRaw(64, 30, 1);
    const light = ssim(base, await blurred(base, 0.8));
    const heavy = ssim(base, await blurred(base, 3));
    expect(light).toBeGreaterThan(heavy);
    expect(light).toBeLessThan(1);
  });

  it("khác kích thước hoặc quá nhỏ báo RangeError", () => {
    expect(() => ssim(makeFlat(100, 16), makeFlat(100, 32))).toThrow(RangeError);
    expect(() => ssim(makeFlat(100, 4), makeFlat(100, 4))).toThrow(RangeError);
  });
});

describe("degrade (công cụ benchmark)", () => {
  it("giữ kích thước", async () => {
    const base = makeNoisyRaw(48, 30, 1);
    const out = await degrade(base);
    expect(out.width).toBe(48);
    expect(out.height).toBe(48);
    expect(out.data.length).toBe(base.data.length);
  });

  it("làm mờ làm giảm độ sắc nét", async () => {
    const base = makeNoisyRaw(64, 30, 1);
    const out = await degrade(base, {
      blurSigma: 2,
      noiseAmplitude: 0,
      gamma: 1,
      seed: 1,
    });
    expect(laplacianVariance(out)).toBeLessThan(laplacianVariance(base));
  });

  it("gamma lớn hơn 1 làm ảnh tối đi", async () => {
    const base = makeNoisyRaw(64, 30, 1);
    const out = await degrade(base, {
      blurSigma: 0,
      noiseAmplitude: 0,
      gamma: 1.5,
      seed: 1,
    });
    expect(brightnessStats(out).mean).toBeLessThan(brightnessStats(base).mean);
  });

  it("cùng seed cho cùng kết quả, khác seed cho kết quả khác", async () => {
    const base = makeNoisyRaw(48, 30, 1);
    const options = { blurSigma: 0, noiseAmplitude: 10, gamma: 1 };
    const a = await degrade(base, { ...options, seed: 7 });
    const b = await degrade(base, { ...options, seed: 7 });
    const c = await degrade(base, { ...options, seed: 8 });
    expect(a.data.equals(b.data)).toBe(true);
    expect(a.data.equals(c.data)).toBe(false);
  });
});
