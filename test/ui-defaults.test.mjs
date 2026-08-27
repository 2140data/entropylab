import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const template = read("src/index.html");
const app = read("src/js/app.js");
const css = read("src/css/styles.css");

test("all wallet network selectors enable and default to mainnet", () => {
  for (const id of ["network", "msig-network", "psbt-network"]) {
    const selectedMainnet = new RegExp(
      `<select id="${id}"><option value="mainnet" selected(?:="selected")?>Bitcoin mainnet</option>`,
    );
    assert.match(template, selectedMainnet);
    assert.match(app, selectedMainnet);
  }
  assert.doesNotMatch(`${template}\n${app}`, /option value="mainnet"[^>]*disabled/);
  assert.doesNotMatch(app, /hodlForceTestnet|temporarily disabled/);
  assert.match(app, /network:"mainnet"/);
});

test("private alternate account exports are visible without an accordion", () => {
  assert.match(app, /if\(includePrivate\)return`<div class="wallet-advanced">\$\{privateExport\}<\/div>`/);
  assert.doesNotMatch(app, /Advanced private export/);
});

test("top banners share one consistent gap", () => {
  assert.match(
    css,
    /\.beta-warning, \.online-warning, \.network-warning\s*\{[^}]*margin: 0 0 18px;/s,
  );
});
