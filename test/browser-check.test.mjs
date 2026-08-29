// Tests for src/js/browser-check.js using Node's built-in test runner.
// The module is a browser IIFE, so each test executes it inside a sandbox
// with stubbed window/document/crypto/BigInt/TextEncoder globals and asserts
// when it kills the page (replaces document.body with the failure report)
// and when it leaves a healthy page untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const src = read("src/js/browser-check.js");

const PAGE = '<div id="btc-calc">wallet app</div>';

// A deterministic but well-behaved CSPRNG stub: every call fills the buffer
// with a distinct nonzero pattern so the uniqueness check can pass.
const workingCrypto = () => {
  let salt = 0;
  return {
    getRandomValues(bytes) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + salt * 17 + 1) & 0xff;
      salt += 1;
      return bytes;
    },
  };
};

const loadModule = (overrides = {}) => {
  const options = {
    secure: true,
    cryptoImpl: workingCrypto(),
    bigIntImpl: BigInt,
    textEncoderImpl: TextEncoder,
    textDecoderImpl: TextDecoder,
    hasBody: true,
    normalizeImpl: undefined, // when present in overrides, replaces String.prototype.normalize
    ...overrides,
  };
  const body = { innerHTML: PAGE };
  const documentElement = { dataset: {} };
  const sandbox = {
    window: { isSecureContext: options.secure },
    document: {
      documentElement,
      ...(options.hasBody ? { body } : {}),
    },
    crypto: options.cryptoImpl,
    BigInt: options.bigIntImpl,
    TextEncoder: options.textEncoderImpl,
    TextDecoder: options.textDecoderImpl,
    Uint8Array,
  };
  const originalNormalize = String.prototype.normalize;
  if ("normalizeImpl" in overrides) String.prototype.normalize = overrides.normalizeImpl;
  try {
    new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
  } finally {
    String.prototype.normalize = originalNormalize;
  }
  return { body, documentElement };
};

const assertPageKilled = (body, failedNames) => {
  assert.ok(!body.innerHTML.includes("btc-calc"), "application markup survived the failure screen");
  assert.match(body.innerHTML, /<svg class="sanity-failure-icon"/);
  assert.match(body.innerHTML, /Host failed basic sanity checks/);
  assert.match(body.innerHTML, /This page should not be used until checks passed\./);
  assert.match(body.innerHTML, /<table class="sanity-failure-table">/);
  assert.match(body.innerHTML, /<thead><tr><th>Startup sanity check<\/th><th>Result<\/th><\/tr><\/thead>/);
  const rows = body.innerHTML.match(/<tr><td>[^<]+<\/td><td>Failed<\/td><\/tr>/g) ?? [];
  assert.deepEqual(
    rows.map((row) => row.match(/<td>([^<]+)<\/td>/)[1]),
    failedNames,
  );
};

test("never generates network traffic", () => {
  assert.doesNotMatch(src, /\bfetch\b|XMLHttpRequest|WebSocket|RTCPeerConnection|sendBeacon|WebTransport|EventSource/);
});

test("a sane browser keeps the page intact and records the barrage outcome", () => {
  const { body, documentElement } = loadModule();
  assert.equal(body.innerHTML, PAGE);
  assert.equal(documentElement.dataset.browserChecks, "5");
  assert.equal(documentElement.dataset.browserFailed, "0");
});

test("an insecure context kills the page and lists the failure", () => {
  const { body, documentElement } = loadModule({ secure: false });
  assert.equal(documentElement.dataset.browserFailed, "1");
  assertPageKilled(body, ["Secure browser context"]);
});

test("a missing WebCrypto API kills the page", () => {
  const { body } = loadModule({ cryptoImpl: undefined });
  assertPageKilled(body, ["crypto.getRandomValues (CSPRNG)"]);
});

test("a missing getRandomValues function kills the page", () => {
  const { body } = loadModule({ cryptoImpl: {} });
  assertPageKilled(body, ["crypto.getRandomValues (CSPRNG)"]);
});

test("a CSPRNG that does not return the buffer kills the page", () => {
  const cryptoImpl = workingCrypto();
  cryptoImpl.getRandomValues = (bytes) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 1) & 0xff;
    return undefined;
  };
  const { body } = loadModule({ cryptoImpl });
  assertPageKilled(body, ["crypto.getRandomValues (CSPRNG)"]);
});

test("a zero-filled CSPRNG kills the page", () => {
  const { body } = loadModule({ cryptoImpl: { getRandomValues: (bytes) => bytes.fill(0) } });
  assertPageKilled(body, ["crypto.getRandomValues (CSPRNG)"]);
});

test("a CSPRNG repeating identical fills kills the page", () => {
  const { body } = loadModule({ cryptoImpl: { getRandomValues: (bytes) => bytes.fill(7) } });
  assertPageKilled(body, ["crypto.getRandomValues (CSPRNG)"]);
});

test("missing BigInt kills the page without a parse error", () => {
  const { body } = loadModule({ bigIntImpl: undefined });
  assertPageKilled(body, ["BigInt arithmetic"]);
});

test("wrong BigInt arithmetic kills the page", () => {
  const { body } = loadModule({ bigIntImpl: (value) => Number(value) });
  assertPageKilled(body, ["BigInt arithmetic"]);
});

test("missing TextEncoder kills the page", () => {
  const { body } = loadModule({ textEncoderImpl: undefined });
  assertPageKilled(body, ["TextEncoder/TextDecoder (UTF-8)"]);
});

test("missing TextDecoder kills the page", () => {
  const { body } = loadModule({ textDecoderImpl: undefined });
  assertPageKilled(body, ["TextEncoder/TextDecoder (UTF-8)"]);
});

test("a wrong UTF-8 encoding kills the page", () => {
  const textEncoderImpl = class { encode() { return new Uint8Array([0x3f]); } };
  const { body } = loadModule({ textEncoderImpl });
  assertPageKilled(body, ["TextEncoder/TextDecoder (UTF-8)"]);
});

test("a wrong UTF-8 decoding kills the page", () => {
  const textDecoderImpl = class { decode() { return "?"; } };
  const { body } = loadModule({ textDecoderImpl });
  assertPageKilled(body, ["TextEncoder/TextDecoder (UTF-8)"]);
});

test("missing String.normalize kills the page", () => {
  const { body } = loadModule({ normalizeImpl: undefined });
  assertPageKilled(body, ["String.normalize (NFKD)"]);
});

test("a wrong NFKD normalization kills the page", () => {
  const { body } = loadModule({ normalizeImpl: function () { return this.toString(); } });
  assertPageKilled(body, ["String.normalize (NFKD)"]);
});

test("multiple failures are all listed in one table", () => {
  const { body, documentElement } = loadModule({ secure: false, bigIntImpl: undefined });
  assert.equal(documentElement.dataset.browserChecks, "5");
  assert.equal(documentElement.dataset.browserFailed, "2");
  assertPageKilled(body, ["Secure browser context", "BigInt arithmetic"]);
});

test("a check that throws is reported as a failure, not a crash", () => {
  const cryptoImpl = {
    getRandomValues() {
      throw new Error("CSPRNG exploded");
    },
  };
  const { body } = loadModule({ cryptoImpl });
  assertPageKilled(body, ["crypto.getRandomValues (CSPRNG)"]);
});

test("a missing document.body still records the outcome without throwing", () => {
  const { documentElement } = loadModule({ secure: false, hasBody: false });
  assert.equal(documentElement.dataset.browserChecks, "5");
  assert.equal(documentElement.dataset.browserFailed, "1");
});

test("the barrage runs before the application scripts in the template", () => {
  const template = read("src/index.html");
  const checkToken = template.indexOf("/*@@JS_BROWSER_CHECK@@*/");
  const mainToken = template.indexOf('<script id="btc-calc-script">');
  assert.ok(checkToken !== -1, "template is missing the browser-check script token");
  assert.ok(mainToken !== -1, "template is missing the application script tag");
  assert.ok(checkToken < mainToken, "browser-check must run before the application scripts");
});

test("the build inlines the module and the failure screen is styled", () => {
  const build = read("scripts/build.mjs");
  const css = read("src/css/styles.css");
  assert.match(build, /browser-check\.js/);
  assert.match(build, /\/\*@@JS_BROWSER_CHECK@@\*\//);
  for (const selector of [
    ".sanity-failure {",
    ".sanity-failure-card {",
    ".sanity-failure-icon {",
    ".sanity-failure-title {",
    ".sanity-failure-message {",
    ".sanity-failure-table {",
    ".sanity-failure-table th, .sanity-failure-table td {",
    ".sanity-failure-advice {",
  ]) {
    assert.ok(css.includes(selector), `styles.css is missing ${selector}`);
  }
});

test("the compiled application ships the inlined barrage", () => {
  const compiled = read("entropylab.html");
  assert.match(compiled, /Host failed basic sanity checks/);
  assert.match(compiled, /data-browser-checks|dataset\.browserChecks/);
  assert.doesNotMatch(compiled, /\/\*@@JS_BROWSER_CHECK@@\*\//);
});
