// Every multisig script kind the UI offers must render an address.
//
// Regression guard for #183: hodlMsigAddr called p2trLeafScript, but the
// import from ./addresses.js did not list it, so the Taproot branch threw
// "ReferenceError: p2trLeafScript is not defined" for every Taproot multisig
// address. The facade suites tested p2trLeafScript directly and passed; only
// running the app's own function through the app's own import line catches
// it. So the slice below keeps app.js's real import statements and never
// injects the helpers.
// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { secp256k1 } from "../src/js/secp256k1.js";

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

// app.js's own import statements, with the module specifiers pointed at src/.
function importLine(module) {
  const match = app.match(new RegExp(`^import \\{[^}]*\\} from "\\./${module}\\.js";$`, "m"));
  assert.ok(match, `import from ./${module}.js`);
  return match[0].replace(`"./${module}.js"`, `"../src/js/${module}.js"`);
}

const source = [
  importLine("addresses"),
  importLine("coders"),
  ...["hodlCmpBytes", "hodlTaprootNumsKey", "hodlXOnlyPubkey", "hodlMsigAddr"].map(slice),
  "export { hodlMsigAddr };",
].join("\n");

const modulePath = join(root, "test", `.msig-address-kinds-${process.pid}.mjs`);
writeFileSync(modulePath, source);
let hodlMsigAddr;
try {
  ({ hodlMsigAddr } = await import(pathToFileURL(modulePath).href));
} finally {
  unlinkSync(modulePath);
}

// Fixed, public keys: secret keys 1..3. Nothing here is secret.
const pubkeys = [1, 2, 3].map((n) => {
  const key = new Uint8Array(32);
  key[31] = n;
  return secp256k1.getPublicKey(key, true);
});

const KINDS = ["p2sh", "p2wsh", "p2sh-p2wsh", "p2tr"];

test("every multisig kind renders an address on both networks", () => {
  for (const network of ["mainnet", "testnet"]) {
    for (const kind of KINDS) {
      const result = hodlMsigAddr(pubkeys, 2, network, kind);
      assert.equal(result.kind, kind);
      assert.equal(typeof result.address, "string");
      assert.ok(result.address.length > 0, `${kind} on ${network} produced no address`);
      assert.match(result.scriptHex, /^[0-9a-f]+$/);
    }
  }
});

test("multisig addresses match their published prefixes", () => {
  const address = (kind, network = "mainnet") => hodlMsigAddr(pubkeys, 2, network, kind).address;
  assert.match(address("p2sh"), /^3/);
  assert.match(address("p2sh-p2wsh"), /^3/);
  assert.match(address("p2wsh"), /^bc1q/);
  assert.match(address("p2tr"), /^bc1p/);
  assert.match(address("p2sh", "testnet"), /^2/);
  assert.match(address("p2wsh", "testnet"), /^tb1q/);
  assert.match(address("p2tr", "testnet"), /^tb1p/);
});

test("sorted and unsorted key orders both derive, and sorting is what BIP67 says", () => {
  const reversed = [...pubkeys].reverse();
  for (const kind of KINDS) {
    assert.equal(
      hodlMsigAddr(pubkeys, 2, "mainnet", kind).address,
      hodlMsigAddr(reversed, 2, "mainnet", kind).address,
      `${kind} sorted derivation depends on input order`,
    );
    assert.notEqual(
      hodlMsigAddr(reversed, 2, "mainnet", kind, false).scriptHex,
      hodlMsigAddr(pubkeys, 2, "mainnet", kind, false).scriptHex,
      `${kind} unsorted derivation ignored input order`,
    );
  }
});
