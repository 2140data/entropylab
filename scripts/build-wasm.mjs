// Builds the WASM artifact from the pinned Rust sources in
// entropylab-wasm/ and writes it as a committed, importable JS module:
// src/js/entropylab-wasm-b64.js (base64 + sha256 of the wasm bytes).
//
// The generated module is committed so that `npm run build` keeps working
// with Node alone. CI rebuilds it from the Rust sources (pinned by
// entropylab-wasm/rust-toolchain.toml and Cargo.lock) and runs the
// entropylab-wasm test suite against the fresh build, so a stale committed
// copy cannot survive; the artifact job commits the runner's copy back
// after each merge. Byte identity across machines is not asserted: the C
// side compiles with the builder's clang. Build-host paths are remapped
// below so the binary does not carry the builder's home directory.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const crateDir = join(root, "entropylab-wasm");
const wasmPath = join(crateDir, "target/wasm32-unknown-unknown/release/entropylab_wasm.wasm");
const outPath = join(root, "src/js/entropylab-wasm-b64.js");

// Without a remap, rustc bakes the builder's absolute paths (e.g.
// /home/<user>/.cargo/...) into panicking code of registry sources, which
// both fingerprints the build host and breaks cross-machine comparisons.
const home = process.env.HOME ?? "";
const rustflags = [
  `--remap-path-prefix=${home}/.cargo/=cargo/`,
  `--remap-path-prefix=${home}/.rustup/=rustup/`,
].join(" ");

execFileSync(
  "cargo",
  ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"],
  { cwd: crateDir, stdio: "inherit", env: { ...process.env, RUSTFLAGS: rustflags } }
);

const wasm = readFileSync(wasmPath);
const sha256 = createHash("sha256").update(wasm).digest("hex");
const b64 = wasm.toString("base64");

const out = `// GENERATED FILE - do not edit. Rebuild with \`npm run build:wasm\`.
// libsecp256k1 v0.4.1 (vendored by secp256k1-sys 0.10.1 via secp256k1 0.29.1)
// and bitcoin_hashes 0.14.101 (see entropylab-wasm/Cargo.lock) compiled to
// WebAssembly from entropylab-wasm/ with the pinned Rust 1.95.0 toolchain.
// wasm sha256: ${sha256}
export const ENTROPOLAB_WASM_B64 =
  "${b64}";
`;

writeFileSync(outPath, out);
console.log(`Built entropylab WASM artifact`);
console.log(`  ${wasm.length} bytes wasm, sha256 ${sha256}`);
console.log(`  wrote ${outPath} (${Buffer.byteLength(out, "utf8")} bytes)`);
