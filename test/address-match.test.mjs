// Paste-an-address check against derived receive/change lists.
// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = readFileSync(join(root, "src/js/app.js"), "utf8");

function extract(startNeedle, endNeedle) {
  const start = app.indexOf(startNeedle);
  const end = app.indexOf(endNeedle, start);
  if (start < 0 || end < 0) throw new Error(`extract failed: ${startNeedle}`);
  return app.slice(start, end);
}

const path = join(root, "test", `.address-match-slice-${Math.random().toString(16).slice(2)}.mjs`);
writeFileSync(
  path,
  `${extract("function hodlNormalizeAddressCheck", "function hodlAddressCheckRows")}\nexport { hodlNormalizeAddressCheck, hodlMatchDerivedAddress };\n`,
);
const { hodlNormalizeAddressCheck, hodlMatchDerivedAddress } = await import(pathToFileURL(path).href);
unlinkSync(path);

const receive = [
  { index: 0, path: "0/0", address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" },
  { index: 1, path: "0/1", address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" },
];
const change = [{ index: 0, path: "1/0", address: "3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy" }];

test("empty paste is empty state", () => {
  assert.equal(hodlMatchDerivedAddress("  ", receive, change).state, "empty");
});

test("receive match reports chain and index", () => {
  const result = hodlMatchDerivedAddress(
    "bitcoin:BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ",
    receive,
    change,
  );
  assert.equal(result.state, "match");
  assert.equal(result.chain, "receive");
  assert.equal(result.index, 0);
});

test("change match keeps base58 case", () => {
  const result = hodlMatchDerivedAddress(change[0].address, receive, change);
  assert.equal(result.state, "match");
  assert.equal(result.chain, "change");
  assert.equal(result.index, 0);
});

test("unknown address is a miss with derived counts", () => {
  const result = hodlMatchDerivedAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", receive, change);
  assert.equal(result.state, "miss");
  assert.equal(result.receiveCount, 2);
  assert.equal(result.changeCount, 1);
});

test("normalize strips bitcoin URIs and lowercases bech32", () => {
  assert.equal(
    hodlNormalizeAddressCheck("bitcoin:BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4?amount=1"),
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  );
  assert.equal(hodlNormalizeAddressCheck("  3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy  "), "3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy");
});
