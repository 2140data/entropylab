// The character filters behind the entropy, seed, and key fields. They are
// the first thing standing between a paste and a derivation: over-filtering
// silently changes the input (a different wallet), under-filtering lets
// misleading characters through to the analyzers.
// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "..", "src/js/app.js"), "utf8");

function loadSlice(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let index = app.indexOf("{", start); index < app.length; index++) {
    if (app[index] === "{") depth++;
    else if (app[index] === "}" && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const api = new Function(
  `
  ${["hodlLooksExtendedKey", "hodlFilterHex", "hodlFilterBin", "hodlFilterSeed", "hodlFilterKey"].map(loadSlice).join("\n")}
  return { hodlLooksExtendedKey, hodlFilterHex, hodlFilterBin, hodlFilterSeed, hodlFilterKey };
  `,
)();

const { hodlLooksExtendedKey, hodlFilterHex, hodlFilterBin, hodlFilterSeed, hodlFilterKey } = api;

test("the hex filter keeps hexadecimal characters and whitespace only", () => {
  assert.equal(hodlFilterHex("0x AbCdEf 019\t"), "0 AbCdEf 019\t", "the x of a 0x prefix is filtered out");
  assert.equal(hodlFilterHex("gh!@#$%^&*()z"), "");
  assert.equal(hodlFilterHex(""), "");
});

test("the binary filter keeps 0, 1, and whitespace only", () => {
  assert.equal(hodlFilterBin("0101 1100"), "0101 1100");
  assert.equal(hodlFilterBin("01201a3"), "0101", "digits past 1 and letters drop out");
});

test("the seed filter lowercases words but never mangles an extended key", () => {
  assert.equal(hodlFilterSeed("Abandon ABILITY"), "abandon ability");
  assert.equal(hodlFilterSeed("word-one_two!"), "wordonetwo", "punctuation is stripped before analysis");
  const xpub = `xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj`;
  assert.equal(hodlFilterSeed(xpub), xpub, "extended keys are case-sensitive and must survive verbatim");
  const xprvLike = `xprv${"A".repeat(107)}`;
  assert.equal(hodlFilterSeed(xprvLike), xprvLike);
  assert.equal(hodlFilterSeed("XpubShortMixedCase"), "xpubshortmixedcase", "short mixed-case text is not an extended key");
  assert.equal(hodlFilterSeed(null), "");
});

test("the extended-key shape test is the gate the seed filter relies on", () => {
  assert.equal(hodlLooksExtendedKey("xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj"), true);
  assert.equal(hodlLooksExtendedKey(`  xpub${"1".repeat(107)}  `), true, "surrounding whitespace is tolerated");
  assert.equal(hodlLooksExtendedKey("xpubShort"), false);
  assert.equal(hodlLooksExtendedKey(`qpub${"1".repeat(107)}`), false, "q is not an extended-key prefix");
  assert.equal(hodlLooksExtendedKey(`xpub${"1".repeat(107)}!`), false, "punctuation breaks the shape");
});

test("the key filter passes brain-wallet text through untouched", () => {
  assert.equal(hodlFilterKey("any $ymbols! are—allowed éè", "brain"), "any $ymbols! are—allowed éè");
  assert.equal(hodlFilterKey("KxFC1jmwwCoACiCAWZ3eXa96mBM6tb3TYzGmf6YwgdGWZgawvrtJ", "wif"), "KxFC1jmwwCoACiCAWZ3eXa96mBM6tb3TYzGmf6YwgdGWZgawvrtJ");
  assert.equal(hodlFilterKey("KxFC!@#$%^&*()", "wif"), "KxFC", "non-brain kinds strip everything but alphanumerics and whitespace");
  assert.equal(hodlFilterKey("0x1234 abcd", "hex-key"), "0x1234 abcd", "the hex analyzer owns the 0x handling");
});
