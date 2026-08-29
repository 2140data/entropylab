// BitBox diceware / Direct word selection for every target word size.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wordlist as Ae } from "@scure/bip39/wordlists/english.js";
import { validateMnemonic as Pn } from "@scure/bip39";

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
function loadVariable(name, nextName) {
  const start = app.search(new RegExp(`var\\s+${name}\\s*=`));
  const end = app.search(new RegExp(`var\\s+${nextName}\\s*=`));
  assert.ok(start >= 0 && end > start, name);
  return app.slice(start, end);
}

const Z = (input) => new Uint8Array(createHash("sha256").update(input).digest());
const api = new Function(
  "Ae",
  "Pn",
  "Z",
  `
  var Pt = 24;
  ${loadVariable("hodlSeedLengths", "hodlEntropyFormats")}
  ${["hodlSeedConfig", "mi", "hodlTargetLastWords", "hodlComputeTargetLastWords", "Rn", "Mt", "hodlBitBoxRolls", "hodlValidateTargetMnemonic", "hodlSeedCountStatus"].map(loadSlice).join("\n")}
  var hodlLastWordCache = new Map();
  var hodlBip39WordSet = new Set(Ae);
  var hodlBip39WordIndex = new Map(Ae.map((word, index) => [word, index]));
  return { hodlBitBoxRolls, hodlTargetLastWords, hodlValidateTargetMnemonic, hodlSeedConfig };
  `,
)(Ae, Pn, Z);

const SIZES = [12, 15, 18, 21, 24];

test("BitBox diceware reaches the checksum pick for every target size", () => {
  for (const words of SIZES) {
    const config = api.hodlSeedConfig(words);
    // Each word: a stray 5 skipped as a reroll, five dice showing 1-4, then
    // the sixth die (4-6 means Heads) as its coin flip.
    const word = "5" + "12341" + "6";
    const parsed = api.hodlBitBoxRolls(word.repeat(config.partialWords), words);
    assert.equal(parsed.waiting, "last-word", `${words}: waiting=${parsed.waiting}`);
    assert.equal(parsed.words.length, config.partialWords, `${words}: ${parsed.words.length}`);
    assert.ok(parsed.skippedHigh >= config.partialWords, `${words}: reroll faces were not skipped`);
    const options = api.hodlTargetLastWords(parsed.words.join(" "), words);
    assert.equal(options.candidates.length, config.candidates, `${words}-word candidates`);
    for (const candidate of options.candidates) {
      assert.equal(api.hodlValidateTargetMnemonic([...parsed.words, candidate].join(" "), words).ok, true, `${words}: ${candidate}`);
    }
  }
});
