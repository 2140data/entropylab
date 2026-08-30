// Custom select activation ordering, including the iOS WebKit tap path.
// Run with: node --test test/enhanced-inputs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(rootDir, "..", "src/js/enhanced-inputs.js"), "utf8");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.isConnected = true;
  }
  append(...children) { this.children.push(...children); }
  after(node) { this.afterNode = node; }
  setAttribute(name, value = "") {
    this.attributes.set(name, String(value));
    if (name === "hidden") this.hidden = true;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "hidden") this.hidden = false;
  }
  replaceChildren(...children) { this.children = children; }
  matches(selector) { return selector === "select" && this.tagName === "SELECT"; }
  querySelectorAll(selector) {
    if (selector === "select") return [];
    if (selector === ".custom-select-option:not(:disabled)") return this.children.filter((child) => child.className === "custom-select-option" && !child.disabled);
    return [];
  }
  querySelector(selector) {
    if (selector === ".custom-select-button") return this.children.find((child) => child.className === "custom-select-button") || null;
    if (selector === ".custom-select-list") return this.children.find((child) => child.className === "custom-select-list") || null;
    if (selector === '[aria-selected="true"]:not(:disabled)') return this.children.find((child) => child.attributes.get("aria-selected") === "true" && !child.disabled) || null;
    if (selector === ".custom-select-option:not(:disabled)") return this.children.find((child) => child.className === "custom-select-option" && !child.disabled) || null;
    return null;
  }
  contains(target) { return target === this || this.children.includes(target); }
  focus(options) { this.focusOptions = options; }
}

class FakeSelect extends FakeElement {
  constructor(options, value) {
    super("select");
    this.options = options;
    this.value = value;
    this.listeners = new Map();
  }
  get selectedIndex() { return Math.max(0, this.options.findIndex((option) => option.value === this.value)); }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    return true;
  }
}

class FakeEvent {
  constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); }
}

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}

function makeHarness() {
  const options = [
    { value: "mainnet", textContent: "Bitcoin mainnet", disabled: false, dataset: {} },
    { value: "testnet", textContent: "Testnet (practice)", disabled: false, dataset: {} },
  ];
  const select = new FakeSelect(options, "mainnet");
  const body = new FakeElement("body");
  const document = {
    body,
    activeElement: null,
    createElement(tagName) { return new FakeElement(tagName); },
    querySelectorAll(selector) { return selector === "select" ? [select] : []; },
    addEventListener() {},
  };
  new Function("document", "Element", "MutationObserver", "Event", source)(document, FakeElement, FakeMutationObserver, FakeEvent);
  return { select, root: select.afterNode };
}

test("custom option finishes the tap before dispatching change", async () => {
  const { select, root } = makeHarness();
  const button = root.children[0];
  const list = root.children[1];
  const calls = [];
  select.addEventListener("change", (event) => calls.push(`change:${event.bubbles}`));
  const click = {
    preventDefault() { calls.push("preventDefault"); },
    stopPropagation() { calls.push("stopPropagation"); },
  };

  button.onclick();
  assert.equal(button.attributes.get("aria-expanded"), "true");
  assert.equal(list.hidden, false);
  list.children[1].onclick(click);

  assert.equal(select.value, "testnet");
  assert.equal(list.hidden, true);
  assert.equal(button.attributes.get("aria-expanded"), "false");
  assert.equal(button.children[0].textContent, "Testnet (practice)");
  assert.equal(list.children[0].attributes.get("aria-selected"), "false");
  assert.equal(list.children[1].attributes.get("aria-selected"), "true");
  assert.deepEqual(button.focusOptions, { preventScroll: true });
  assert.deepEqual(calls, ["preventDefault", "stopPropagation"]);

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(calls, ["preventDefault", "stopPropagation", "change:true"]);
});

test("deferred change is not sent to a select removed during activation", async () => {
  const { select, root } = makeHarness();
  const calls = [];
  select.addEventListener("change", () => calls.push("change"));

  root.children[1].children[1].onclick({ preventDefault() {}, stopPropagation() {} });
  select.isConnected = false;

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(calls, []);
});
