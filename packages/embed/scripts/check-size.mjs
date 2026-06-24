// Fail the embed build if the gzipped bundle reaches the 16.5 KB budget.
// The embed must stay tiny and dependency-light (no zod) — see the roadmap.
// Budget raised from 15 KB → 16.5 KB on 2026-06-24 to fit the runtime
// animation API (interpolation + controller) in one bundle.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BUDGET = 16.5 * 1024; // 16.5 KB
const bundle = fileURLToPath(new URL('../dist/plasma-bg.js', import.meta.url));
const gz = gzipSync(readFileSync(bundle)).length;

const kb = (n) => (n / 1024).toFixed(2);
if (gz >= BUDGET) {
  console.error(`embed bundle ${kb(gz)} KB gzip — over the ${kb(BUDGET)} KB budget`);
  process.exit(1);
}
console.log(`embed bundle ${kb(gz)} KB gzip — under the ${kb(BUDGET)} KB budget`);
