import { describe, expect, it } from "vitest";

import { createSharpenStep } from "../src/steps/sharpen.js";
import { makeHardStep, rangeOf } from "./helpers.js";

const PARAMS = { sigma: 1, amount: 1, threshold: 0 } as const;

describe("sharpen: không tạo thêm pixel cháy", () => {
  it("cạnh gắt ở vùng sáng: không đẩy pixel lên sát 255", async () => {
    const out = await createSharpenStep(PARAMS)(makeHardStep(64, 200, 250));
    expect(rangeOf(out.data).max).toBeLessThanOrEqual(253);
  });

  it("cạnh gắt ở vùng tối: không đẩy pixel xuống sát 0", async () => {
    const out = await createSharpenStep(PARAMS)(makeHardStep(64, 5, 60));
    expect(rangeOf(out.data).min).toBeGreaterThanOrEqual(2);
  });

  it("pixel đã là 255 giữ nguyên 255", async () => {
    const out = await createSharpenStep(PARAMS)(makeHardStep(64, 100, 255));
    expect(out.data[(0 * 64 + 63) * 3]).toBe(255);
  });

  it("vẫn làm nét phía đối diện của cạnh", async () => {
    const out = await createSharpenStep(PARAMS)(makeHardStep(64, 100, 255));
    expect(rangeOf(out.data).min).toBeLessThan(100);
  });
});
