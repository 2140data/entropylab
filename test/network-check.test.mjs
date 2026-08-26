// Tests for src/js/network-check.js using Node's built-in test runner.
// The module is a browser IIFE, so each test executes it inside a sandbox
// with stubbed document/navigator/window globals and asserts how it treats
// the #network-warning element.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const src = read("src/js/network-check.js");

const loadModule = ({ onLine, withConnectionApi = false, hasElement = true }) => {
  const el = {
    shown: false,
    removed: false,
    removeAttribute(name) {
      if (name === "hidden") {
        this.shown = true;
        this.removed = false;
      }
    },
    remove() {
      this.removed = true;
      this.shown = false;
    },
  };
  const listeners = {};
  const connectionListeners = {};
  const nav = { onLine };
  if (withConnectionApi) {
    nav.connection = { addEventListener: (type, fn) => { connectionListeners[type] = fn; } };
  }
  const sandbox = {
    document: { getElementById: (id) => (hasElement && id === "network-warning" ? el : null) },
    navigator: nav,
    window: { addEventListener: (type, fn) => { listeners[type] = fn; } },
  };
  new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
  return { el, listeners, connectionListeners, nav };
};

test("never generates network traffic", () => {
  assert.doesNotMatch(src, /\bfetch\b|XMLHttpRequest|WebSocket|RTCPeerConnection|sendBeacon|WebTransport/);
});

test("shows the warning when a network adapter is available", () => {
  const { el } = loadModule({ onLine: true });
  assert.equal(el.shown, true);
  assert.equal(el.removed, false);
});

test("removes the warning when no network adapter is available", () => {
  const { el } = loadModule({ onLine: false });
  assert.equal(el.removed, true);
  assert.equal(el.shown, false);
});

test("shows the warning when the online event fires", () => {
  const { el, listeners, nav } = loadModule({ onLine: false });
  assert.equal(el.removed, true);
  nav.onLine = true;
  listeners.online();
  assert.equal(el.shown, true);
  assert.equal(el.removed, false);
});

test("removes the warning when the offline event fires", () => {
  const { el, listeners, nav } = loadModule({ onLine: true });
  assert.equal(el.shown, true);
  nav.onLine = false;
  listeners.offline();
  assert.equal(el.removed, true);
  assert.equal(el.shown, false);
});

test("re-checks when the Network Information API reports a change", () => {
  const { el, connectionListeners, nav } = loadModule({ onLine: true, withConnectionApi: true });
  assert.equal(el.shown, true);
  assert.equal(typeof connectionListeners.change, "function");
  nav.onLine = false;
  connectionListeners.change();
  assert.equal(el.removed, true);
});

test("works without the Network Information API (Firefox/Safari)", () => {
  const { el } = loadModule({ onLine: true, withConnectionApi: false });
  assert.equal(el.shown, true);
});

test("does not throw when the warning element is missing", () => {
  assert.doesNotThrow(() => loadModule({ onLine: true, hasElement: false }));
  assert.doesNotThrow(() => loadModule({ onLine: false, hasElement: false }));
});

test("template ships the warning aside hidden and wired to the build", () => {
  const template = read("src/index.html");
  const build = read("scripts/build.mjs");
  assert.match(template, /<aside[^>]*id="network-warning"[^>]*\shidden/);
  assert.match(template, /\/\*@@JS_NETWORK@@\*\//);
  assert.match(build, /network-check\.js/);
});

test("CSP keeps connect-src locked down to 'self'", () => {
  const csp = read("src/index.html").match(/connect-src[^;"]*/)?.[0] ?? "";
  assert.equal(csp.trim(), "connect-src 'self'");
});
