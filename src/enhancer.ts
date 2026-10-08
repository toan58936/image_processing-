import {
  DEFAULT_LEVEL,
  ENHANCE_LEVELS,
  LEVEL_PARAMS,
  SUPPORTED_FORMATS,
  type LevelParams,
} from "./config.js";
import { InvalidImageError, InvalidOptionsError } from "./errors.js";
import { buildPipeline, runPipeline } from "./pipeline.js";
import { decode } from "./steps/decode.js";
import { assertValidQuality, encode } from "./steps/encode.js";
import { validate } from "./steps/validate.js";
import type {
  EnhanceLevel,
  EnhanceOptions,
  ImageFormat,
  ImageInput,
  ImageOutput,
} from "./types.js";

interface ResolvedOptions {
  level: EnhanceLevel;
  outputFormat: ImageFormat | undefined;
  quality: number | undefined;
}

/** Kiểm tra tùy chọn TRƯỚC khi xử lý ảnh, để lỗi cấu hình báo sớm và rẻ. */
function resolveOptions(options: EnhanceOptions): ResolvedOptions {
  if (typeof options !== "object" || options === null) {
    throw new InvalidOptionsError("options phải là một object.");
  }

  const level = options.level ?? DEFAULT_LEVEL;
  if (!ENHANCE_LEVELS.includes(level)) {
    throw new InvalidOptionsError(
      `level "${String(level)}" không hợp lệ. Hợp lệ: ${ENHANCE_LEVELS.join(", ")}.`,
    );
  }

  const { outputFormat, quality } = options;
  if (outputFormat !== undefined && !SUPPORTED_FORMATS.includes(outputFormat)) {
    throw new InvalidOptionsError(
      `outputFormat "${String(outputFormat)}" không hợp lệ. Hợp lệ: ${SUPPORTED_FORMATS.join(", ")}.`,
    );
  }
  if (quality !== undefined) {
    assertValidQuality(quality);
  }

  return { level, outputFormat, quality };
}

/** Luồng chung: validate -> decode -> pipeline -> encode. */
async function run(
  input: ImageInput,
  resolved: ResolvedOptions,
  params: LevelParams,
): Promise<ImageOutput> {
  if (typeof input !== "object" || input === null) {
    throw new InvalidImageError("input phải là một object có trường data.");
  }

  const info = await validate(input);
  const raw = await decode(input.data);
  const processed = await runPipeline(raw, buildPipeline(params));

  return encode(
    processed,
    resolved.outputFormat ?? info.format,
    resolved.quality,
  );
}

/**
 * Cải thiện chất lượng một ảnh. Không giữ trạng thái giữa các lần gọi.
 * Mọi lỗi được ném là lớp con của ImageEnhancementError.
 */
export async function enhance(
  input: ImageInput,
  options: EnhanceOptions = {},
): Promise<ImageOutput> {
  const resolved = resolveOptions(options);
  return run(input, resolved, LEVEL_PARAMS[resolved.level]);
}

/**
 * CHỈ DÙNG NỘI BỘ (benchmark, ablation): chạy với bộ tham số tùy ý.
 * KHÔNG export qua index.ts; có test canh giao diện công khai.
 */
export async function enhanceWithParams(
  input: ImageInput,
  params: LevelParams,
  options: EnhanceOptions = {},
): Promise<ImageOutput> {
  const resolved = resolveOptions(options);
  return run(input, resolved, params);
}
