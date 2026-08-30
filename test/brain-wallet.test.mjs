// Brain-wallet passphrase normalization and SHA-256 compatibility.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "..", "src/js/app.js"), "utf8");

function loadSlice(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  let end = -1;
  for (let index = app.indexOf("{", start); index < app.length; index++) {
    if (app[index] === "{") depth++;
    else if (app[index] === "}") {
      depth--;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  assert.ok(end > start, name);
  return app.slice(start, end);
}

const Z = (input) => new Uint8Array(createHash("sha256").update(input).digest());
const helpers = new Function(
  "Z",
  "TextEncoder",
  `${loadSlice("hodlBrainWalletPassphrase")};${loadSlice("hodlBrainWalletPrivateKey")};return { hodlBrainWalletPassphrase, hodlBrainWalletPrivateKey };`,
)(Z, TextEncoder);

test("brain-wallet recovery hashes exact text by default", () => {
  const passphrase = " recovery phrase \t\n";
  const expected = createHash("sha256").update(passphrase, "utf8").digest("hex");
  assert.equal(Buffer.from(helpers.hodlBrainWalletPrivateKey(passphrase)).toString("hex"), expected);
  assert.equal(helpers.hodlBrainWalletPassphrase(passphrase), passphrase);
});

test("opt-in trimming removes boundary whitespace before hashing", () => {
  const passphrase = " \trecovery phrase\n ";
  const expected = createHash("sha256").update("recovery phrase", "utf8").digest("hex");
  assert.equal(Buffer.from(helpers.hodlBrainWalletPrivateKey(passphrase, true)).toString("hex"), expected);
  assert.equal(helpers.hodlBrainWalletPassphrase(passphrase, true), "recovery phrase");
});

test("exact mode accepts whitespace while trim mode rejects an empty result", () => {
  assert.equal(helpers.hodlBrainWalletPassphrase(" \t\n"), " \t\n");
  assert.throws(() => helpers.hodlBrainWalletPassphrase(" \t\n", true), /leaves an empty brain-wallet recovery passphrase/);
  assert.throws(() => helpers.hodlBrainWalletPassphrase(""), /Enter the brain-wallet recovery passphrase/);
});
