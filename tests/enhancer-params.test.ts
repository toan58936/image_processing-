import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { LevelParams } from "../src/config.js";
import { enhanceWithParams } from "../src/enhancer.js";
import { makeNoisyFlatPng } from "./helpers.js";

const ALL_OFF: LevelParams = {
  denoise: { medianSize: 3, strength: 0 },
  tone: { strength: 0, maxSlope: 3, gamma: 1 },
  sharpen: { sigma: 1, amount: 0, threshold: 2 },
};

describe("enhanceWithParams (dùng nội bộ cho ablation)", () => {
  it("tắt hết các bước: PNG vào PNG ra giữ nguyên từng pixel", async () => {
    const data = await makeNoisyFlatPng(64, 30, 11);
    const out = await enhanceWithParams({ data }, ALL_OFF);
    const before = await sharp(data).raw().toBuffer();
    const after = await sharp(out.data).raw().toBuffer();
    expect(after.equals(before)).toBe(true);
  });

  it("bật một bước thì ảnh thay đổi", async () => {
    const data = await makeNoisyFlatPng(64, 30, 11);
    const params: LevelParams = {
      ...ALL_OFF,
      sharpen: { sigma: 1, amount: 2, threshold: 0 },
    };
    const out = await enhanceWithParams({ data }, params);
    const before = await sharp(data).raw().toBuffer();
    const after = await sharp(out.data).raw().toBuffer();
    expect(after.equals(before)).toBe(false);
  });
});
