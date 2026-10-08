import { readFile } from "node:fs/promises";

import { enhance } from "../src/index.js";
import { estimateChromaNoise, estimateNoise } from "../src/metrics/index.js";
import { decode } from "../src/steps/decode.js";

const inputBuf = await readFile("samples/anh-that.jpg");
const input = await decode(inputBuf);

console.log(
  "input:  luma =",
  estimateNoise(input).toFixed(2),
  "| chroma =",
  estimateChromaNoise(input).toFixed(2),
);

for (const level of ["light", "standard", "strong"] as const) {
  const out = await enhance({ data: inputBuf }, { level, outputFormat: "png" });
  const decoded = await decode(out.data);
  console.log(
    `${level.padEnd(8)}: luma =`,
    estimateNoise(decoded).toFixed(2),
    "| chroma =",
    estimateChromaNoise(decoded).toFixed(2),
  );
}
