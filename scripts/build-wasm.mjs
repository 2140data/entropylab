// Builds the secp256k1 WASM artifact from the pinned Rust sources in
// secp256k1-wasm/ and writes it as a committed, importable JS module:
// src/js/secp256k1-wasm-b64.js (base64 + sha256 of the wasm bytes).
//
// The generated module is committed so that `npm run build` keeps working
// with Node alone; CI rebuilds it and diffs against the committed copy to
// prove the artifact is reproducible from the Rust sources and the pinned
// toolchain (secp256k1-wasm/rust-toolchain.toml, Cargo.lock).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const crateDir = join(root, "secp256k1-wasm");
const wasmPath = join(crateDir, "target/wasm32-unknown-unknown/release/secp256k1_wasm.wasm");
const outPath = join(root, "src/js/secp256k1-wasm-b64.js");

execFileSync(
  "cargo",
  ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"],
  { cwd: crateDir, stdio: "inherit" }
);

const wasm = readFileSync(wasmPath);
const sha256 = createHash("sha256").update(wasm).digest("hex");
const b64 = wasm.toString("base64");

const out = `// GENERATED FILE - do not edit. Rebuild with \`npm run build:wasm\`.
// libsecp256k1 0.8.0 (vendored by secp256k1-sys 0.14.0, see
// secp256k1-wasm/Cargo.lock) compiled to WebAssembly from secp256k1-wasm/
// with the pinned Rust 1.95.0 toolchain. wasm sha256: ${sha256}
export const SECP256K1_WASM_B64 =
  "${b64}";
`;

writeFileSync(outPath, out);
console.log(`Built secp256k1 WASM artifact`);
console.log(`  ${wasm.length} bytes wasm, sha256 ${sha256}`);
console.log(`  wrote ${outPath} (${Buffer.byteLength(out, "utf8")} bytes)`);
