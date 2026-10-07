import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

import { enhance, ImageEnhancementError } from "../src/index.js";
import type { EnhanceLevel, ImageFormat } from "../src/index.js";

const USAGE = `Cách dùng:
  npm run try -- <đường-dẫn-ảnh> [--level light|standard|strong]
                                   [--format jpeg|png|webp] [--quality 1-100]
Ví dụ:
  npm run try -- samples/san-thuong.jpg --level standard`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      level: { type: "string" },
      format: { type: "string" },
      quality: { type: "string" },
    },
  });

  const inputPath = positionals[0];
  if (!inputPath) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  const data = await readFile(inputPath);
  const started = performance.now();

  // Giá trị được ép kiểu để thử luôn việc module tự kiểm tra tùy chọn.
  const out = await enhance(
    { data },
    {
      level: values.level as EnhanceLevel | undefined,
      outputFormat: values.format as ImageFormat | undefined,
      quality: values.quality === undefined ? undefined : Number(values.quality),
    },
  );
  const elapsed = performance.now() - started;

  const name = basename(inputPath, extname(inputPath));
  const ext = out.format === "jpeg" ? "jpg" : out.format;
  const outDir = "output";
  const outPath = join(outDir, `${name}-${values.level ?? "standard"}.${ext}`);

  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, out.data);

  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  console.log(`Ảnh vào : ${inputPath} (${kb(data.length)})`);
  console.log(`Ảnh ra  : ${outPath} (${kb(out.data.length)})`);
  console.log(`Kích thước: ${out.width} x ${out.height}, định dạng: ${out.format}`);
  console.log(`Thời gian : ${elapsed.toFixed(0)} ms`);
}

main().catch((error: unknown) => {
  if (error instanceof ImageEnhancementError) {
    console.error(`Lỗi (${error.name}): ${error.message}`);
    process.exitCode = 1;
    return;
  }
  throw error;
});
