// Workspace sync copies an already-derived session. It must not invent entropy,
// run Derive/Inspect, store keys, or write the PSBT editor.
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
  let paren = 0, body = -1;
  for (let index = start; index < app.length; index++) {
    if (app[index] === "(") paren++;
    else if (app[index] === ")") {
      paren--;
      if (paren === 0) {
        body = app.indexOf("{", index);
        break;
      }
    }
  }
  let depth = 0;
  for (let index = body; index < app.length; index++) {
    if (app[index] === "{") depth++;
    else if (app[index] === "}" && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const api = new Function(`
  ${loadSlice("hodlWorkspaceHasHdRoot")}
  ${loadSlice("hodlWorkspaceHasPsbtKey")}
  ${loadSlice("hodlWorkspaceMsigToken")}
  ${loadSlice("hodlWorkspaceSyncTargets")}
  return { hodlWorkspaceHasHdRoot, hodlWorkspaceHasPsbtKey, hodlWorkspaceMsigToken, hodlWorkspaceSyncTargets };
`)();

const hd = {
  kind: "hd",
  mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  rootXprv: "xprv...",
  accounts: [{
    def: { id: "bip84" },
    genericPublic: "xpubABC",
    originFingerprint: "deadbeef",
    originPath: "84h/0h/0h",
  }],
};
const wif = { kind: "single", privHex: "11".repeat(32) };
const importedAccount = {
  kind: "hd",
  mnemonic: null,
  rootXprv: null,
  importedPrivateKey: "xprvAccount",
  accounts: [{ def: { id: "bip84" }, genericPublic: "xpubABC" }],
};

test("HD roots can fill BIP-85, Silent Payments, PSBT, and an empty multisig slot", () => {
  const targets = Object.fromEntries(api.hodlWorkspaceSyncTargets(hd, { accountId: "bip84", msigEmpty: true }).map((row) => [row.id, row]));
  assert.equal(targets.bip85.ok, true);
  assert.equal(targets.sp.ok, true);
  assert.equal(targets.psbt.ok, true);
  assert.equal(targets.msig.ok, true);
  assert.equal(targets.psbted.ok, false);
  assert.equal(targets.psbted.skip, "never");
  assert.equal(api.hodlWorkspaceMsigToken(hd, "bip84"), "[deadbeef/84h/0h/0h]xpubABC");
});

test("WIF/hex skips HD consumers and a filled multisig slot is skipped", () => {
  const wifTargets = Object.fromEntries(api.hodlWorkspaceSyncTargets(wif, { msigEmpty: true }).map((row) => [row.id, row]));
  assert.equal(wifTargets.bip85.ok, false);
  assert.equal(wifTargets.sp.ok, false);
  assert.equal(wifTargets.psbt.ok, true);
  assert.equal(wifTargets.msig.ok, false);
  const filled = Object.fromEntries(api.hodlWorkspaceSyncTargets(hd, { accountId: "bip84", msigEmpty: false }).map((row) => [row.id, row]));
  assert.equal(filled.msig.ok, false);
  assert.equal(filled.msig.skip, "slot filled");
  assert.equal(api.hodlWorkspaceHasHdRoot(importedAccount), false);
  assert.equal(api.hodlWorkspaceHasPsbtKey(importedAccount), false);
});

test("sync reuses Use active key, does not run Derive/Inspect, and stays in RAM", () => {
  const apply = loadSlice("hodlApplyWorkspaceSync");
  assert.match(apply, /hodlUseActiveKeyForBip85\(\)/);
  assert.match(apply, /hodlSpUseActiveKey\(\)/);
  assert.match(apply, /hodlUseActiveKeyForPsbt\(\)/);
  assert.doesNotMatch(apply, /hodlRunBip85|hodlRunPsbt|hodlRunSp|hodlCalculateKey|hodlDeriveWithProgress/);
  assert.doesNotMatch(apply, /psbted|PSBT Editor|hodlPsbtEditor/);
  assert.match(apply, /hodlFillKeys\(msigValues\)/);
  const render = loadSlice("hodlRenderWorkspaceSync");
  assert.match(render, /Sync this key to other workspaces/);
  assert.match(render, /id="workspace-sync-toggle"/);
  assert.doesNotMatch(render, /workspace-sync-toggle" checked/);
  assert.match(app, /hodlWipeActiveKey[\s\S]*hodlWipeWorkspaceConsumers\(\)/);
  assert.match(loadSlice("hodlWipeWorkspaceConsumers"), /hodlBip85WipeMem\(\)/);
  assert.match(loadSlice("hodlWipeWorkspaceConsumers"), /hodlSpWipeMem\(\)/);
  assert.match(loadSlice("hodlWipeWorkspaceConsumers"), /hodlPsbtWipeMem\(\)/);
  assert.doesNotMatch(app, /BroadcastChannel/);
  assert.doesNotMatch(app, /indexedDB/i);
  assert.doesNotMatch(loadSlice("hodlApplyWorkspaceSync"), /localStorage/);
  assert.doesNotMatch(loadSlice("hodlRenderWorkspaceSync"), /localStorage/);
  assert.doesNotMatch(loadSlice("hodlWipeWorkspaceConsumers"), /localStorage/);
});

test("re-sync is idempotent and wipe clears every synced multisig slot", () => {
  const apply = loadSlice("hodlApplyWorkspaceSync");
  // The panel re-renders unchecked on reveal/key-tab switches; a second check
  // must reuse the slot already holding the token, not fill the next empty one.
  assert.match(apply, /indexOf\(token\)/);
  assert.match(apply, /if \(synced < 0\)/);
  assert.match(apply, /hodlWorkspaceSyncMsig\.push\(token\)/);
  const render = loadSlice("hodlRenderWorkspaceSync");
  // The checkbox reflects the session that was actually synced, so a re-render
  // cannot show "not synced" while the consumers still hold the key.
  assert.match(render, /toggle\.checked = hodlWorkspaceSyncResult === re/);
  const wipe = loadSlice("hodlWipeWorkspaceConsumers");
  // Every slot still holding a synced token is cleared — not only the most
  // recent one — while user-edited values no longer matching a token survive.
  assert.match(wipe, /hodlWorkspaceSyncMsig\.includes\(values\[index\]\)/);
  assert.match(wipe, /hodlWorkspaceSyncMsig = \[\]/);
  assert.match(wipe, /hodlWorkspaceSyncResult = null/);
});
