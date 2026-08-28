// Card entropy parsing and bit counts.
// Run with: npm test
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
  for (let i = app.indexOf("{", start); i < app.length; i++) {
    if (app[i] === "{") depth++;
    else if (app[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.ok(end > start, name);
  return app.slice(start, end);
}

const hodlNormalizeCardToken = new Function(`${loadSlice("hodlNormalizeCardToken")}; return hodlNormalizeCardToken;`)();
const hodlCardWithoutReplacementBits = new Function(`${loadSlice("hodlCardWithoutReplacementBits")}; return hodlCardWithoutReplacementBits;`)();
const hodlSeedLengths = {
  12: { words: 12, bits: 128, bytes: 16 },
  18: { words: 18, bits: 192, bytes: 24 },
  24: { words: 24, bits: 256, bytes: 32 },
};
function hodlSeedConfig(words = 12) {
  return hodlSeedLengths[words];
}
const hodlCardNeeded = new Function("hodlSeedConfig", `${loadSlice("hodlCardNeeded")}; return hodlCardNeeded;`)(hodlSeedConfig);
const hodlParseCards = new Function(
  "hodlCardNeeded",
  "hodlNormalizeCardToken",
  "hodlCardWithoutReplacementBits",
  `${loadSlice("hodlParseCards")}; return hodlParseCards;`,
)(hodlCardNeeded, hodlNormalizeCardToken, hodlCardWithoutReplacementBits);

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];
const DECK = SUITS.flatMap((suit) => RANKS.map((rank) => rank + suit));

test("card tokens normalize 10 and suit glyphs to ASCII", () => {
  assert.equal(hodlNormalizeCardToken("as"), "AS");
  assert.equal(hodlNormalizeCardToken("10h"), "TH");
  assert.equal(hodlNormalizeCardToken("A♠"), "AS");
  assert.equal(hodlNormalizeCardToken("Q♦"), "QD");
  assert.equal(hodlNormalizeCardToken("foo"), "");
});

test("25 unique cards reach 12-word bits; 24 unique do not", () => {
  assert.ok(hodlCardWithoutReplacementBits(24) < 128);
  assert.ok(hodlCardWithoutReplacementBits(25) >= 128);
  assert.ok(hodlCardWithoutReplacementBits(39) >= 192);
  assert.ok(hodlCardWithoutReplacementBits(52) < 256);
  assert.equal(hodlCardNeeded(12).first, 25);
  assert.equal(hodlCardNeeded(18).first, 39);
  assert.deepEqual(hodlCardNeeded(24), { first: 52, extra: 6 });
});

test("parse rejects a repeated card in the first shuffle", () => {
  const parsed = hodlParseCards("AS 2C AS", 12);
  assert.deepEqual(parsed.duplicates, ["AS"]);
  assert.deepEqual(parsed.cards, ["AS", "2C"]);
});

test("24-word extra cards may repeat the first shuffle", () => {
  const first = DECK.join(" ");
  const parsed = hodlParseCards(`${first} AS 2C 3D 4H 5S 6C`, 24);
  assert.equal(parsed.duplicates.length, 0);
  assert.equal(parsed.cards.length, 58);
  assert.ok(parsed.bits >= 256);
});

test("hashed transcript is SHA-256 of ASCII codes", () => {
  const transcript = "AS 2C TD";
  const digest = createHash("sha256").update(transcript, "utf8").digest("hex");
  assert.match(app, /Z\(new TextEncoder\(\)\.encode\(parsed\.hashInput\)\)/);
  assert.equal(hodlParseCards(transcript, 12).hashInput, transcript);
  assert.equal(digest.length, 64);
});
