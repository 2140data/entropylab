// EntropyLab build script (zero dependencies).
//
// Inlines the sources from src/ into a single self-contained HTML file in
// dist/. The output is byte-for-byte reproducible from the sources and the
// version declared in package.json.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, "src");
const DIST = join(root, "dist");

const read = (path) => readFileSync(join(SRC, path), "utf8");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

if (!/^\d+(?:\.\d+)*$/.test(version)) {
  throw new Error(`Invalid version in package.json: ${version}`);
}

if (process.argv.includes("--clean")) {
  rmSync(DIST, { recursive: true, force: true });
  console.log("Removed dist/");
  process.exit(0);
}

const template = read("index.html");
const css = read("css/styles.css");
const jsMain = read("js/vendor.js") + read("js/app.js");
const jsOnline = read("js/online.js");
const jsEnhanced = read("js/enhanced-inputs.js");
const jsRepeat = read("js/repeat-inputs.js");

let html = template
  .replace("/*@@CSS@@*/", () => css)
  .replace("/*@@JS_MAIN@@*/", () => jsMain)
  .replace("/*@@JS_ONLINE@@*/", () => jsOnline)
  .replace("/*@@JS_ENHANCED@@*/", () => jsEnhanced)
  .replace("/*@@JS_REPEAT@@*/", () => jsRepeat)
  .split("{{VERSION}}").join(version);

for (const leftover of html.match(/\/\*@@|{{VERSION}}/g) || []) {
  throw new Error(`Unreplaced build token in output: ${leftover}`);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(root, "assets"), join(DIST, "assets"), { recursive: true });

const fileName = `entropylab-${version}.html`;
writeFileSync(join(DIST, "entropylab.html"), html);
writeFileSync(join(DIST, fileName), html);
writeFileSync(join(DIST, "index.html"), html);
writeFileSync(
  join(DIST, "versions.json"),
  JSON.stringify({ versions: [{ version: `v${version}`, file: fileName }] }, null, 0) + "\n",
);
writeFileSync(join(DIST, ".nojekyll"), "");

console.log(`Built EntropyLab v${version}`);
console.log(`  dist/entropylab.html`);
console.log(`  dist/${fileName}`);
console.log(`  dist/index.html`);
console.log(`  dist/versions.json`);
console.log(`  dist/assets/ (${(cpSync && "copied") || "copied"})`);
console.log(`  size: ${Buffer.byteLength(html, "utf8")} bytes`);
