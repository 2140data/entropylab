// BIP174 rules for the PSBT v0 unsigned transaction, checked against the
// app's own hodlTx.
//
// Regression guard for #183: the consensus decode moved into rust-bitcoin,
// which rejects a witness marker whose stacks are all empty before the app
// ever sees a parsed transaction. Reading `tx.segwit` afterwards therefore
// reported that hostile PSBT as a generic truncation instead of naming the
// rule it broke, so the marker is checked on the raw bytes again.
// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = readFileSync(join(root, "src/js/app.js"), "utf8");

function slice(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let index = app.indexOf("{", start); index < app.length; index++) {
    if (app[index] === "{") depth++;
    else if (app[index] === "}" && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const txImport = app.match(/^import \{[^}]*\} from "\.\/tx\.js";$/m);
assert.ok(txImport, "import from ./tx.js");

const source = [
  txImport[0].replace('"./tx.js"', '"../src/js/tx.js"'),
  slice("hodlPsbtNeed"),
  slice("hodlTx"),
  "export { hodlTx };",
].join("\n");

const modulePath = join(root, "test", `.psbt-unsigned-tx-${process.pid}.mjs`);
writeFileSync(modulePath, source);
let hodlTx;
try {
  ({ hodlTx } = await import(pathToFileURL(modulePath).href));
} finally {
  unlinkSync(modulePath);
}

const bytes = (hex) => Uint8Array.from(Buffer.from(hex.replace(/\s+/g, ""), "hex"));
const PREVOUT = "00".repeat(32) + "00000000";
// version | 1 input (empty scriptSig) | 1 zero-value OP_RETURN-less output | locktime
const LEGAL = `01000000 01 ${PREVOUT} 00 ffffffff 01 0000000000000000 00 00000000`;

test("a well-formed unsigned transaction decodes", () => {
  const tx = hodlTx(bytes(LEGAL));
  assert.equal(tx.version, 1);
  assert.equal(tx.inputs.length, 1);
  assert.equal(tx.outputs.length, 1);
  assert.equal(tx.locktime, 0);
  assert.equal(tx.inputs[0].script.length, 0);
});

test("a witness marker is named as the rule it breaks, empty stacks included", () => {
  // Marker + flag, one input, and a zero-item witness stack: rust-bitcoin
  // refuses to decode this, so the message has to come from the byte check.
  const emptyStacks = `01000000 0001 01 ${PREVOUT} 00 ffffffff 01 0000000000000000 00 00 00000000`;
  assert.throws(
    () => hodlTx(bytes(emptyStacks)),
    /must not contain a witness marker/,
  );
  // Marker + flag with a real witness item, which decodes fine on its own.
  const withWitness = `01000000 0001 01 ${PREVOUT} 00 ffffffff 01 0000000000000000 00 0101aa 00000000`;
  assert.throws(
    () => hodlTx(bytes(withWitness)),
    /must not contain a witness marker/,
  );
});

test("non-empty scriptSigs are rejected", () => {
  const signed = `01000000 01 ${PREVOUT} 0151 ffffffff 01 0000000000000000 00 00000000`;
  assert.throws(() => hodlTx(bytes(signed)), /must have empty scriptSigs/);
});

test("trailing bytes are named, and truncation is reported as such", () => {
  assert.throws(() => hodlTx(bytes(LEGAL + "ff")), /contains trailing bytes/);
  assert.throws(() => hodlTx(bytes("0100000001")), /ended early/);
  assert.throws(() => hodlTx(bytes("0100")), /ended early/);
});
