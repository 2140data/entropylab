// Guards the UI fixtures in test/fixtures/psbt/: the committed .b64 files
// must be byte-identical to what test/fixtures/psbt/generate.mjs produces
// (regenerate with `node test/fixtures/psbt/generate.mjs`), and every fixture
// must parse cleanly under rust-bitcoin with every known pair decoding — the
// fixtures exist to show off the editor's typed decodes, so a decode error
// in one is a bug in the fixture, not the decoder.
// Run with `npm test` (part of the default suite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { psbtInspectDoc } from "../src/js/psbt-wasm.js";
import { buildFixtures } from "./fixtures/psbt/generate.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "psbt");

const feeState = (doc) => (doc.fee.known ? (doc.fee.sats === null ? "exceeds" : "known") : "unknown");

for (const fixture of buildFixtures()) {
  test(`fixture ${fixture.name}: committed file matches the generator and parses cleanly`, () => {
    const committed = readFileSync(join(dir, `${fixture.name}.b64`), "utf8").trim();
    assert.equal(committed, Buffer.from(fixture.bytes).toString("base64"), "stale fixture: rerun test/fixtures/psbt/generate.mjs");

    const doc = psbtInspectDoc(new Uint8Array(Buffer.from(committed, "base64")));
    assert.equal(doc.rustBitcoinError, null, "rust-bitcoin rejected a fixture");
    assert.equal(doc.tx.inputs.length, fixture.expect.inputs, "input count changed");
    assert.equal(doc.tx.outputs.length, fixture.expect.outputs, "output count changed");
    assert.equal(feeState(doc), fixture.expect.fee, "fee state changed");
    for (const maps of [[doc.globals], doc.inputs, doc.outputs]) {
      for (const map of maps) {
        for (const pair of map) {
          assert.ok(!pair.decodeError, `${pair.name ?? pair.key} does not decode: ${pair.decodeError}`);
        }
      }
    }
  });
}
