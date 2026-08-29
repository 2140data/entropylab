// EntropyLab build script.
//
// Inlines the sources from src/ into a single self-contained entropylab.html
// at the repository root. The file is a generated artifact (gitignored); CI
// rebuilds it for every test run, deploys it with Pages, and commits it back
// to rock after each merge so the file stays downloadable. The Pages workflow
// copies it to a deployment-only index.html so both / and /entropylab.html
// serve the same application. The output is byte-for-byte reproducible from
// the sources and the version declared in package.json.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, "src");

const read = (path) => readFileSync(join(SRC, path), "utf8");
const readBase64 = (path) => readFileSync(join(SRC, path)).toString("base64");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

if (!/^\d+(?:\.\d+)*$/.test(version)) {
  throw new Error(`Invalid version in package.json: ${version}`);
}

const appFile = "entropylab.html";
const generated = () =>
  [appFile, ...readdirSync(root).filter((name) =>
    /^entropylab-\d+(?:\.\d+)*\.html$/.test(name)
  )];

if (process.argv.includes("--clean")) {
  for (const name of generated()) rmSync(join(root, name), { force: true });
  console.log("Removed generated files (entropylab.html, entropylab-*.html)");
  process.exit(0);
}

const template = read("index.html");
// The header logo is inlined as a data URI so the downloaded file shows it
// without reaching for assets/ (which only exists on the hosted site).
const css = read("css/styles.css")
  .replace("/*@@LOGO_DARK@@*/", () => readBase64("assets/logo-dark.png"))
  .replace("/*@@LOGO_LIGHT@@*/", () => readBase64("assets/logo-light.png"));
// Inlined from the same file the site publishes, so the downloaded document
// and the hosted tab icon can never drift apart.
const favicon = readFileSync(join(root, "assets/favicon.png")).toString("base64");
const jsMain = buildSync({
  entryPoints: [join(SRC, "js/app.js")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  charset: "utf8",
}).outputFiles[0].text;
const jsSqliteWriter = read("js/sqlite-writer.js");
const jsWalletExport = read("js/wallet-export.js");
const jsOnline = read("js/online.js");
const jsNetwork = read("js/network-check.js");
const jsBrowserCheck = read("js/browser-check.js");
const jsLifeHash = read("js/lifehash.js");
const jsEnhanced = read("js/enhanced-inputs.js");
const jsRepeat = read("js/repeat-inputs.js");

let html = template
  .replace("/*@@FAVICON@@*/", () => favicon)
  .replace("/*@@CSS@@*/", () => css)
  .replace("/*@@JS_MAIN@@*/", () => jsMain)
  .replace("/*@@JS_SQLITE_WRITER@@*/", () => jsSqliteWriter)
  .replace("/*@@JS_WALLET_EXPORT@@*/", () => jsWalletExport)
  .replace("/*@@JS_ONLINE@@*/", () => jsOnline)
  .replace("/*@@JS_NETWORK@@*/", () => jsNetwork)
  .replace("/*@@JS_BROWSER_CHECK@@*/", () => jsBrowserCheck)
  .replace("/*@@JS_LIFEHASH@@*/", () => jsLifeHash)
  .replace("/*@@JS_ENHANCED@@*/", () => jsEnhanced)
  .replace("/*@@JS_REPEAT@@*/", () => jsRepeat)
  .split("{{VERSION}}").join(version);

for (const leftover of html.match(/\/\*@@|{{VERSION}}/g) || []) {
  throw new Error(`Unreplaced build token in output: ${leftover}`);
}

// Remove stale generated files (e.g. versioned copies from older releases)
for (const name of generated()) rmSync(join(root, name), { force: true });

writeFileSync(join(root, appFile), html);

console.log(`Built EntropyLab v${version}`);
console.log(`  ${appFile} (${Buffer.byteLength(html, "utf8")} bytes)`);
