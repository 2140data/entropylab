// PSBT editor UI (BIP-174, v0) — the bip174.org-style full-fidelity editor.
// All parsing, typed decoding and re-serialization run in the rust-bitcoin
// WebAssembly module (src/js/psbt-wasm.js); this module only renders the
// inspection document, applies edits to it, and asks the WASM to rebuild.
//
// Editing model: the document returned by psbtInspectDoc is the editable
// state. Transaction-field and pair-value edits update the document in place
// and stay pending until "Re-serialize" validates them; structural edits
// (add/remove pair) round-trip through the WASM immediately so the table
// always shows rust-bitcoin's decode of a valid file. The unsigned
// transaction pair (global key 00) is regenerated from the transaction
// section on every build, so it is never edited directly.
import { Address as BtcAddress, NETWORK as BTC_MAINNET, TEST_NETWORK as BTC_TESTNET, OutScript } from "@scure/btc-signer";
import { psbtInspectDoc, psbtBuildBytes, psbtWasmReady } from "./psbt-wasm.js";
import { expandableHtml, EXPAND_LIMIT, initExpandable } from "./expandable.js";
import { psbtVizHtml } from "./psbt-viz.js";
import { parseOpReturn } from "./opreturn.js";

const hexToBytes = (hex) => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("Invalid hexadecimal input.");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const bytesToHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const isHex = (text) => /^(?:[0-9a-f]{2})*$/i.test(text);

const base64Encode = (bytes) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

// Accepts base64 or hex with the same rules and bounds as the PSBT / Nonce
// inspector (5 MB decoded, 7 MB of base64 text).
export const psbtBytesFromText = (raw) => {
  const value = String(raw ?? "").trim(), compact = value.replace(/\s/g, "");
  if (!value) throw new Error("Paste a PSBT v0.");
  if (compact.length > 7e6) throw new Error("This PSBT is too large to edit safely.");
  let bytes;
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0 && compact.length >= 10) bytes = hexToBytes(compact.toLowerCase());
  else {
    let binary;
    try {
      binary = atob(compact);
    } catch {
      throw new Error("That does not look like a PSBT in base64 or hex.");
    }
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.length > 5e6) throw new Error("This PSBT is too large to edit safely.");
  return bytes;
};

// Accepts the raw bytes of an uploaded file. Wallets (Sparrow, Coldcard, …)
// save a PSBT as a binary .psbt file, which starts with the "psbt\xff" magic;
// a text export ("Copy PSBT" or a hex dump saved to disk) decodes through
// the same rules and bounds as the paste box.
export const psbtBytesFromUpload = (bytes) => {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("Choose a PSBT file to upload.");
  if (bytes.length > 5e6) throw new Error("This PSBT is too large to edit safely.");
  const PSBT_MAGIC = [0x70, 0x73, 0x62, 0x74, 0xff]; // "psbt\xff"
  if (bytes.length >= PSBT_MAGIC.length && PSBT_MAGIC.every((byte, index) => bytes[index] === byte)) return bytes;
  return psbtBytesFromText(new TextDecoder().decode(bytes));
};

export const satsToBtc = (sats) => {
  let value = BigInt(sats), negative = value < 0n;
  if (negative) value = -value;
  const whole = value / 100000000n, fraction = value % 100000000n;
  return (negative ? "-" : "") + whole.toString() + "." + fraction.toString().padStart(8, "0");
};

const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const shorten = (hex, head = 10, tail = 6) => {
  const text = String(hex ?? "");
  return text.length > head + tail + 2 ? text.slice(0, head) + "…" + text.slice(-tail) : text;
};

const addressFor = (scriptHex, network) => {
  try {
    return BtcAddress(network === "testnet" ? BTC_TESTNET : BTC_MAINNET).encode(OutScript.decode(hexToBytes(scriptHex)));
  } catch {
    return null;
  }
};

// One-line decode of a data-carrier (OP_RETURN) output for its row in the
// transaction table: payload as UTF-8 text when it decodes, hex otherwise,
// plus the protocol hint the inspector also reports. Invalid hex (a field
// being typed) and non-OP_RETURN scripts return null, leaving the row's
// usual address/asm fallback untouched. A non-zero value on a data-carrier
// output burns those sats; the row says so and takes the warning tone.
export const opReturnSummary = (scriptHex, valueSats = 0) => {
  let parsed;
  try {
    parsed = parseOpReturn(hexToBytes(scriptHex));
  } catch {
    return null;
  }
  if (!parsed) return null;
  const burn = Number(valueSats) > 0;
  const parts = [
    parsed.error
      ? `OP_RETURN · malformed: ${parsed.error}`
      : `OP_RETURN · ${parsed.payloadBytes} byte${parsed.payloadBytes === 1 ? "" : "s"}`,
  ];
  if (parsed.hint) parts.push(parsed.hint);
  if (!parsed.error && parsed.payloadBytes) {
    let text = null;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(parsed.payload);
    } catch {
      // Not UTF-8: the hex branch below shows the payload.
    }
    parts.push(text !== null ? `“${text.length > 80 ? `${text.slice(0, 80)}…` : text}”` : `hex ${bytesToHex(parsed.payload.slice(0, 40))}${parsed.payloadBytes > 40 ? "…" : ""}`);
  }
  if (burn) parts.push(`burns ${valueSats} sats — unspendable`);
  return { text: parts.join(" · "), burn };
};

// Per-map key types offered by the "add pair" control: [type byte, name,
// keydata hint]. "Custom" (empty type) is always appended and allows any type
// byte + keydata.
const PAIR_TYPES = {
  global: [
    ["01", "PSBT_GLOBAL_XPUB", "78-byte xpub (keydata)"],
    ["fb", "PSBT_GLOBAL_VERSION", "empty"],
    ["fc", "PSBT_GLOBAL_PROPRIETARY", "prefix len + prefix + subtype + keydata"],
  ],
  input: [
    ["00", "PSBT_IN_NON_WITNESS_UTXO", "empty"],
    ["01", "PSBT_IN_WITNESS_UTXO", "empty"],
    ["02", "PSBT_IN_PARTIAL_SIG", "33-byte pubkey"],
    ["03", "PSBT_IN_SIGHASH_TYPE", "empty"],
    ["04", "PSBT_IN_REDEEM_SCRIPT", "empty"],
    ["05", "PSBT_IN_WITNESS_SCRIPT", "empty"],
    ["06", "PSBT_IN_BIP32_DERIVATION", "33-byte pubkey"],
    ["07", "PSBT_IN_FINAL_SCRIPTSIG", "empty"],
    ["08", "PSBT_IN_FINAL_SCRIPTWITNESS", "empty"],
    ["0a", "PSBT_IN_RIPEMD160", "20-byte hash"],
    ["0b", "PSBT_IN_SHA256", "32-byte hash"],
    ["0c", "PSBT_IN_HASH160", "20-byte hash"],
    ["0d", "PSBT_IN_HASH256", "32-byte hash"],
    ["13", "PSBT_IN_TAP_KEY_SIG", "empty"],
    ["14", "PSBT_IN_TAP_SCRIPT_SIG", "32-byte xonly + 32-byte leaf hash"],
    ["15", "PSBT_IN_TAP_LEAF_SCRIPT", "control block"],
    ["16", "PSBT_IN_TAP_BIP32_DERIVATION", "32-byte xonly key"],
    ["17", "PSBT_IN_TAP_INTERNAL_KEY", "empty"],
    ["18", "PSBT_IN_TAP_MERKLE_ROOT", "empty"],
    ["fc", "PSBT_IN_PROPRIETARY", "prefix len + prefix + subtype + keydata"],
  ],
  output: [
    ["00", "PSBT_OUT_REDEEM_SCRIPT", "empty"],
    ["01", "PSBT_OUT_WITNESS_SCRIPT", "empty"],
    ["02", "PSBT_OUT_BIP32_DERIVATION", "33-byte pubkey"],
    ["05", "PSBT_OUT_TAP_INTERNAL_KEY", "empty"],
    ["06", "PSBT_OUT_TAP_TREE", "empty"],
    ["07", "PSBT_OUT_TAP_BIP32_DERIVATION", "32-byte xonly key"],
    ["fc", "PSBT_OUT_PROPRIETARY", "prefix len + prefix + subtype + keydata"],
  ],
};

// One-line plain-text summary of a decoded pair, shown next to the raw value.
const describePair = (pair, network) => {
  if (pair.decodeError) return { text: `Not decodable: ${pair.decodeError}`, tone: "bad" };
  const d = pair.decoded;
  if (!d) return { text: "Unknown key — raw bytes shown.", tone: "muted" };
  const addr = d.scriptPubKey ? addressFor(d.scriptPubKey, network) : null;
  switch (pair.name) {
    case "PSBT_GLOBAL_UNSIGNED_TX":
      return { text: d.note || "Edited in the transaction section.", tone: "muted" };
    case "PSBT_GLOBAL_XPUB":
      return { text: `${d.xpub} · fingerprint ${d.fingerprint} · path ${d.path}`, tone: "" };
    case "PSBT_GLOBAL_VERSION":
      return { text: `PSBT version ${d.version}`, tone: d.version === 0 ? "" : "warn" };
    case "PSBT_GLOBAL_PROPRIETARY":
    case "PSBT_IN_PROPRIETARY":
    case "PSBT_OUT_PROPRIETARY":
      return { text: `prefix ${d.prefixText ? JSON.stringify(d.prefixText) : d.prefix} · subtype ${d.subtype}${d.keydata ? ` · keydata ${shorten(d.keydata)}` : ""}`, tone: "" };
    case "PSBT_IN_NON_WITNESS_UTXO": {
      const prev = d.prevout ? ` · prevout ${d.prevout.vout}: ${d.prevout.value} sats ${addressFor(d.prevout.scriptPubKey, network) || shorten(d.prevout.scriptPubKey)}` : "";
      return { text: `txid ${d.txid} · ${d.outputCount} outputs${prev}`, tone: "" };
    }
    case "PSBT_IN_WITNESS_UTXO":
      return { text: `${d.value} sats${addr ? ` · ${addr}` : ""} · ${d.asm}`, tone: "" };
    case "PSBT_IN_PARTIAL_SIG":
      return { text: `pubkey ${shorten(d.pubkey)} · sig ${shorten(d.signature)} · ${d.sighash}`, tone: "" };
    case "PSBT_IN_SIGHASH_TYPE":
      return { text: `${d.sighash} (0x${Number(d.sighashType).toString(16)})`, tone: d.sighashType === 1 ? "" : "warn" };
    case "PSBT_IN_REDEEM_SCRIPT":
    case "PSBT_IN_WITNESS_SCRIPT":
    case "PSBT_OUT_REDEEM_SCRIPT":
    case "PSBT_OUT_WITNESS_SCRIPT":
    case "PSBT_IN_FINAL_SCRIPTSIG":
      return { text: d.asm || "(empty script)", tone: "" };
    case "PSBT_IN_FINAL_SCRIPTWITNESS":
      return { text: `${d.items.length} witness item(s): ${d.items.map((item) => shorten(item)).join(", ")}`, tone: "" };
    case "PSBT_IN_BIP32_DERIVATION":
    case "PSBT_OUT_BIP32_DERIVATION":
      return { text: `pubkey ${shorten(d.pubkey)} · fingerprint ${d.fingerprint} · path ${d.path}`, tone: "" };
    case "PSBT_IN_RIPEMD160":
    case "PSBT_IN_SHA256":
    case "PSBT_IN_HASH160":
    case "PSBT_IN_HASH256":
      return { text: `hash ${shorten(d.hash)} · preimage ${shorten(d.preimage)}`, tone: "" };
    case "PSBT_IN_TAP_KEY_SIG":
      return { text: `sig ${shorten(d.signature)} · ${d.sighash}`, tone: "" };
    case "PSBT_IN_TAP_SCRIPT_SIG":
      return { text: `xonly ${shorten(d.xonly)} · leaf ${shorten(d.leafHash)} · sig ${shorten(d.signature)} · ${d.sighash}`, tone: "" };
    case "PSBT_IN_TAP_LEAF_SCRIPT":
      return { text: `version ${d.leafVersion} · ${d.asm} · control block ${shorten(d.controlBlock)}`, tone: "" };
    case "PSBT_IN_TAP_BIP32_DERIVATION":
    case "PSBT_OUT_TAP_BIP32_DERIVATION":
      return { text: `xonly ${shorten(d.xonly)} · fingerprint ${d.fingerprint} · path ${d.path} · ${d.leafHashes.length} leaf hash(es)`, tone: "" };
    case "PSBT_IN_TAP_INTERNAL_KEY":
    case "PSBT_OUT_TAP_INTERNAL_KEY":
      return { text: `xonly ${d.xonly}`, tone: "" };
    case "PSBT_IN_TAP_MERKLE_ROOT":
      return { text: `root ${d.merkleRoot}`, tone: "" };
    case "PSBT_OUT_TAP_TREE":
      return { text: `${d.leaves.length} leaf/leaves: ${d.leaves.map((leaf) => `depth ${leaf.depth} ${leaf.asm}`).join(" · ")}`, tone: "" };
    default:
      return { text: "", tone: "muted" };
  }
};

// The editable document is the inspect document; the WASM ignores the
// decorative fields (name/decoded) on build and reads key/value hex only.
export const psbtEditorBuildDoc = (doc) => ({
  tx: {
    version: doc.tx.version,
    locktime: doc.tx.locktime,
    inputs: doc.tx.inputs.map((input) => ({ txid: input.txid, vout: input.vout, scriptSig: input.scriptSig, sequence: input.sequence })),
    outputs: doc.tx.outputs.map((output) => ({ value: output.value, scriptPubKey: output.scriptPubKey })),
  },
  globals: doc.globals.map((pair) => ({ key: pair.key, value: pair.value })),
  inputs: doc.inputs.map((map) => map.map((pair) => ({ key: pair.key, value: pair.value }))),
  outputs: doc.outputs.map((map) => map.map((pair) => ({ key: pair.key, value: pair.value }))),
});

export const initPsbtEditor = () => {
  const load = document.getElementById("psbted-load");
  if (!load) return;
  const $ = (id) => document.getElementById(id);
  const out = $("psbted-out"), error = $("psbted-error"), text = $("psbted-text"), network = $("psbted-network");

  let doc = null; // inspect document being edited; null when nothing is loaded
  let resultBytes = null; // last successfully built PSBT
  // Which flow-diagram part is open ({ kind: "input"|"output", index } for a
  // box or { kind: "tx" } for the middle transaction box); its fields render
  // in the panel under the diagram instead of inline.
  let selected = null;

  initExpandable();
  // Edits saved in the expandable editor window are pending field edits,
  // exactly like typing in the plain value inputs (validated on Re-serialize).
  out.addEventListener("expandable:apply", (event) => {
    if (!doc) return;
    const { kind, map, pair } = event.target.dataset;
    if (kind === undefined || pair === undefined) return;
    (kind === "global" ? doc.globals : kind === "input" ? doc.inputs[map] : doc.outputs[map])[Number(pair)].value = event.detail.text.trim();
  });

  const setError = (message) => {
    error.textContent = message || "";
  };

  const pairRows = (kind, map, mapIndex) => {
    const rows = map
      .map((pair, pairIndex) => {
        const locked = kind === "global" && pair.key === "00";
        const note = describePair(pair, network.value);
        const tone = note.tone ? ` class="psbted-note-${note.tone}"` : "";
        const name = pair.name || "pair";
        // Long fields collapse to the standard truncated cell; activating it
        // opens the full text in the expandable editor window. A long value
        // stays editable there, so the write path matches the plain input's.
        const valueCell = pair.value.length > EXPAND_LIMIT
          ? expandableHtml(pair.value, { label: `Value bytes for ${name} (hex)`, editAttrs: `data-kind="${kind}" data-map="${mapIndex}" data-pair="${pairIndex}"` })
          : `<input class="psbted-value" data-kind="${kind}" data-map="${mapIndex}" data-pair="${pairIndex}" value="${escapeHtml(pair.value)}" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Value bytes for ${escapeHtml(name)} (hex)">`;
        return `<tr>
          <td class="psbted-name">${escapeHtml(pair.name || "Unvalidated pair")}<br><span class="muted">type 0x${escapeHtml(pair.key.slice(0, 2) ?? "??")}</span></td>
          <td class="psbted-hex">${expandableHtml(pair.key, { label: `Key bytes for ${name} (hex)` })}</td>
          <td>${locked ? `<span class="muted">managed by the transaction section</span>` : valueCell}</td>
          <td${tone}>${expandableHtml(note.text, { label: `${name} — decoded` })}</td>
          <td>${locked ? "" : `<button type="button" class="psbted-del" data-kind="${kind}" data-map="${mapIndex}" data-pair="${pairIndex}" aria-label="Delete ${escapeHtml(pair.name || "pair")}">×</button>`}</td>
        </tr>`;
      })
      .join("");
    const options = PAIR_TYPES[kind]
      .map(([type, name, hint]) => `<option value="${type}" title="keydata: ${escapeHtml(hint)}">${name}</option>`)
      .join("");
    return `<table class="psbted-pairs">
      <thead><tr><th>Field</th><th>Key (hex)</th><th>Value (hex)</th><th>Decoded</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="muted">No pairs in this map.</td></tr>`}</tbody>
    </table>
    <div class="psbted-add">
      <select data-add-type="${kind}:${mapIndex}" aria-label="New pair type">${options}<option value="" title="keydata field takes the full key: one type byte, then keydata">Custom type…</option></select>
      <input data-add-key="${kind}:${mapIndex}" placeholder="keydata (hex)" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="New pair keydata (hex)">
      <input data-add-val="${kind}:${mapIndex}" placeholder="value (hex)" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="New pair value (hex)">
      <button type="button" class="btn secondary" data-add="${kind}:${mapIndex}">Add pair</button>
    </div>`;
  };

  const render = () => {
    if (!doc) {
      out.innerHTML = "";
      return;
    }
    const tx = doc.tx;
    const fee = doc.fee?.known
      ? doc.fee.sats === null
        ? `<span class="psbted-note-bad">outputs exceed claimed inputs</span>`
        : `${escapeHtml(String(doc.fee.sats))} sats (${satsToBtc(doc.fee.sats)} BTC, from PSBT-claimed input amounts)`
      : "unknown — some inputs carry no claimed previous-output amount";
    const verdict = doc.rustBitcoinError
      ? `<span class="psbted-note-warn">rust-bitcoin reports: ${escapeHtml(doc.rustBitcoinError)}</span>`
      : `<span class="psbted-note-ok">parses under rust-bitcoin</span>`;

    // The last remaining input carries no delete control: a zero-input
    // unsigned transaction cannot round-trip through BIP-174 serialization,
    // so rust-bitcoin would reject the rebuild.
    const inputRows = tx.inputs
      .map(
        (input, index) => `<tr>
          <td>${index}</td>
          <td><input class="psbted-txid" data-txin="${index}" value="${escapeHtml(input.txid)}" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Input ${index} previous txid (hex)"></td>
          <td><input class="psbted-num" data-txin-vout="${index}" value="${escapeHtml(String(input.vout))}" inputmode="numeric" aria-label="Input ${index} prevout index"></td>
          <td><input class="psbted-num" data-txin-seq="${index}" value="${escapeHtml(String(input.sequence))}" inputmode="numeric" aria-label="Input ${index} sequence"></td>
          <td>${tx.inputs.length > 1 ? `<button type="button" class="psbted-del" data-txin-del="${index}" aria-label="Delete input ${index}">×</button>` : ""}</td>
        </tr>`
      )
      .join("");
    const outputRows = tx.outputs
      .map((output, index) => {
        const addr = addressFor(output.scriptPubKey, network.value);
        const opret = addr ? null : opReturnSummary(output.scriptPubKey, output.value);
        return `<tr>
          <td>${index}</td>
          <td><input class="psbted-num" data-txout-val="${index}" value="${escapeHtml(String(output.value))}" inputmode="numeric" aria-label="Output ${index} value in sats"> sats</td>
          <td><input class="psbted-txid" data-txout-script="${index}" value="${escapeHtml(output.scriptPubKey)}" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Output ${index} scriptPubKey (hex)">
            <span class="${opret?.burn ? "psbted-note-warn" : "muted"} psbted-addr">${escapeHtml(addr || opret?.text || output.asm || "")}</span></td>
          <td><button type="button" class="psbted-del" data-txout-del="${index}" aria-label="Delete output ${index}">×</button></td>
        </tr>`;
      })
      .join("");

    // One map section, rendered either inline (the default) or inside the
    // flow diagram's detail panel when its box is selected there.
    const mapSection = (kind, index) => {
      const map = kind === "input" ? doc.inputs[index] : doc.outputs[index];
      const sub =
        kind === "input"
          ? `Spends ${escapeHtml(tx.inputs[index].txid)}:${escapeHtml(String(tx.inputs[index].vout))}`
          : `Pays ${escapeHtml(String(tx.outputs[index].value))} sats${addressFor(tx.outputs[index].scriptPubKey, network.value) ? ` to ${escapeHtml(addressFor(tx.outputs[index].scriptPubKey, network.value))}` : ""}`;
      return `<section class="psbted-map"><h3>${kind === "input" ? "Input" : "Output"} ${index} key-value map</h3><p class="muted">${sub}</p>${pairRows(kind, map, index)}</section>`;
    };
    // The unsigned-transaction section, rendered either inline (the default)
    // or inside the detail panel when the diagram's transaction box is open.
    const txSection = () => `<section class="psbted-map"><h3>Unsigned transaction</h3>
        <div class="psbted-txhead">
          <label>Version <input class="psbted-num" id="psbted-tx-version" value="${escapeHtml(String(tx.version))}" inputmode="numeric"></label>
          <label>Locktime <input class="psbted-num" id="psbted-tx-locktime" value="${escapeHtml(String(tx.locktime))}" inputmode="numeric"></label>
        </div>
        <table class="psbted-pairs"><thead><tr><th class="psbted-idx">Input</th><th>Previous txid</th><th>vout</th><th>sequence</th><th></th></tr></thead><tbody>${inputRows}</tbody></table>
        <div class="psbted-add"><button type="button" class="btn secondary" data-tx-add="input">Add input</button></div>
        <table class="psbted-pairs"><thead><tr><th class="psbted-idx">Output</th><th>Value</th><th>scriptPubKey</th><th></th></tr></thead><tbody>${outputRows}</tbody></table>
        <div class="psbted-add"><button type="button" class="btn secondary" data-tx-add="output">Add output</button></div>
      </section>`;
    const isSelected = (kind, index) => selected && selected.kind === kind && (kind === "tx" || selected.index === index);
    const inputSections = doc.inputs.map((_, index) => (isSelected("input", index) ? "" : mapSection("input", index))).join("");
    const outputSections = doc.outputs.map((_, index) => (isSelected("output", index) ? "" : mapSection("output", index))).join("");
    const detail = selected
      ? `<div class="psbted-viz-detail" id="psbted-viz-detail">
          <div class="psbted-viz-detail-bar">
            <p class="muted">Fields of ${selected.kind === "tx" ? "the unsigned transaction" : `${selected.kind} ${selected.index}`}, moved here from below. Activate its box again (or ×) to put them back.</p>
            <button type="button" class="psbted-del" data-viz-close aria-label="Close the ${selected.kind === "tx" ? "unsigned transaction" : `${selected.kind} ${selected.index}`} fields">×</button>
          </div>
          ${selected.kind === "tx" ? txSection() : mapSection(selected.kind, selected.index)}
        </div>`
      : "";

    out.innerHTML = `
      <p class="psbt-kv"><strong>PSBT v${escapeHtml(String(doc.psbtVersion))}</strong> · ${tx.inputs.length} input(s) · ${tx.outputs.length} output(s) · fee ${fee} · ${verdict}</p>
      <p class="muted" id="psbted-status" aria-live="polite">${resultBytes ? "The fields below show rust-bitcoin's decode of the current PSBT." : "Field edits are validated when you re-serialize."}</p>

      ${psbtVizHtml(doc, network.value, selected)}
      ${detail}

      ${isSelected("tx") ? "" : txSection()}

      <section class="psbted-map"><h3>Global key-value map</h3>${pairRows("global", doc.globals, 0)}</section>
      ${inputSections}
      ${outputSections}

      <div class="row psbt-actions">
        <button class="btn primary" id="psbted-build" type="button">Re-serialize PSBT</button>
      </div>
      <div id="psbted-result"></div>`;

    bind();
  };

  const renderResult = () => {
    const box = document.getElementById("psbted-result");
    if (!box) return;
    if (!resultBytes) {
      box.innerHTML = "";
      return;
    }
    const b64 = base64Encode(resultBytes);
    const hex = bytesToHex(resultBytes);
    box.innerHTML = `
      <p class="psbt-ok">Rebuilt PSBT is accepted by rust-bitcoin (${resultBytes.length} bytes).</p>
      <label class="field">Edited PSBT (base64)<textarea id="psbted-result-b64" readonly spellcheck="false">${escapeHtml(b64)}</textarea></label>
      <div class="row psbt-actions">
        <button class="btn secondary" id="psbted-copy-b64" type="button">Copy base64</button>
        <button class="btn secondary" id="psbted-copy-hex" type="button">Copy hex</button>
        <button class="btn secondary" id="psbted-download" type="button">Download .psbt</button>
        <button class="btn secondary" id="psbted-reload" type="button">Load edited PSBT into the editor</button>
      </div>
      <label class="field">Edited PSBT (hex)<textarea id="psbted-result-hex" readonly spellcheck="false">${escapeHtml(hex)}</textarea></label>`;
    $("psbted-copy-b64").onclick = () => navigator.clipboard?.writeText(b64).catch(() => {});
    $("psbted-copy-hex").onclick = () => navigator.clipboard?.writeText(hex).catch(() => {});
    $("psbted-reload").onclick = () => {
      text.value = b64;
      loadFromText();
    };
    // The binary download round-trips with wallet software: Sparrow and
    // Coldcard read the .psbt file this produces.
    $("psbted-download").onclick = () => {
      const url = URL.createObjectURL(new Blob([resultBytes], { type: "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "edited.psbt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  };

  // The mempool.space-style connectors: a bezier from every input box into
  // the transaction box and from there out to every output box, drawn into
  // the diagram's (initially empty) SVG layer once the boxes have layout.
  // The selected box's line comes to the front, like its accent border.
  const drawViz = () => {
    const viz = out.querySelector(".psbted-viz");
    const svg = viz?.querySelector(".psbted-viz-svg");
    if (!viz || !svg || !svg.clientWidth) return; // no diagram, or the stacked layout hides the layer
    const boxRect = viz.getBoundingClientRect();
    const txRect = viz.querySelector(".psbted-viz-tx").getBoundingClientRect();
    const origin = { x: boxRect.left, y: boxRect.top };
    const edge = (rect, side) => ({
      x: (side === "right" ? rect.right : rect.left) - origin.x,
      y: rect.top - origin.y + rect.height / 2,
    });
    const paths = [];
    const link = (from, to, cls, open) => {
      // Horizontal S-curve (the mempool.space flow look); the bend spans
      // half the gap so the line leaves and arrives level.
      const bend = Math.max(24, Math.abs(to.x - from.x) / 2);
      const d = `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
      paths.push(`<path class="psbted-viz-line ${cls}${open ? " is-open" : ""}" d="${d}"/>`);
    };
    const boxFor = (kind, index) => viz.querySelector(`[data-viz="${kind}:${index}"]`)?.closest(".psbted-viz-box");
    const txIn = edge(txRect, "left");
    doc.tx.inputs.forEach((_, index) => {
      const rect = boxFor("input", index)?.getBoundingClientRect();
      if (rect) link(edge(rect, "right"), txIn, "psbted-viz-line-in", selected?.kind === "input" && selected.index === index);
    });
    const txOut = edge(txRect, "right");
    doc.tx.outputs.forEach((_, index) => {
      const rect = boxFor("output", index)?.getBoundingClientRect();
      if (rect) link(txOut, edge(rect, "left"), "psbted-viz-line-out", selected?.kind === "output" && selected.index === index);
    });
    svg.setAttribute("viewBox", `0 0 ${boxRect.width} ${boxRect.height}`);
    svg.innerHTML = paths.join("");
  };
  window.addEventListener("resize", () => {
    if (doc) drawViz();
  });

  // Builds + re-inspects the working document. On success the editor is
  // re-rendered from rust-bitcoin's fresh decode; on failure the working
  // document is kept as-is and the error is shown.
  const rebuild = () => {
    const fresh = psbtBuildBytes(psbtEditorBuildDoc(doc));
    const decoded = psbtInspectDoc(fresh);
    doc = decoded;
    resultBytes = fresh;
    setError("");
    render();
    renderResult();
  };

  const showBuildError = (exception) => {
    setError(exception.message || String(exception));
    const box = document.getElementById("psbted-result");
    if (box) box.innerHTML = "";
  };

  const loadFromText = () => {
    setError("");
    selected = null;
    try {
      doc = psbtInspectDoc(psbtBytesFromText(text.value));
      resultBytes = null;
      render();
    } catch (exception) {
      doc = null;
      resultBytes = null;
      render();
      setError(exception.message || String(exception));
    }
  };

  // Structural edits (add/remove pair) validate immediately: apply to a copy,
  // rebuild, and only keep the change when rust-bitcoin accepts the result.
  const mutate = (fn) => {
    const backup = doc;
    const draft = structuredClone(doc);
    try {
      fn(draft);
      doc = draft;
      rebuild();
    } catch (exception) {
      doc = backup;
      render();
      showBuildError(exception);
    }
  };

  const bind = () => {
    $("psbted-build").onclick = () => {
      setError("");
      try {
        rebuild();
      } catch (exception) {
        showBuildError(exception);
      }
    };

    // Transaction fields update the working document only; they stay pending
    // until Re-serialize (so partial hex never loses focus mid-edit).
    $("psbted-tx-version").addEventListener("input", (event) => (doc.tx.version = event.target.value.trim()));
    $("psbted-tx-locktime").addEventListener("input", (event) => (doc.tx.locktime = event.target.value.trim()));
    out.querySelectorAll("[data-txin]").forEach((input) =>
      input.addEventListener("input", () => (doc.tx.inputs[Number(input.dataset.txin)].txid = input.value.trim()))
    );
    out.querySelectorAll("[data-txin-vout]").forEach((input) =>
      input.addEventListener("input", () => (doc.tx.inputs[Number(input.dataset.txinVout)].vout = input.value.trim()))
    );
    out.querySelectorAll("[data-txin-seq]").forEach((input) =>
      input.addEventListener("input", () => (doc.tx.inputs[Number(input.dataset.txinSeq)].sequence = input.value.trim()))
    );
    out.querySelectorAll("[data-txout-val]").forEach((input) =>
      input.addEventListener("input", () => (doc.tx.outputs[Number(input.dataset.txoutVal)].value = input.value.trim()))
    );
    out.querySelectorAll("[data-txout-script]").forEach((input) =>
      input.addEventListener("input", () => (doc.tx.outputs[Number(input.dataset.txoutScript)].scriptPubKey = input.value.trim()))
    );

    // Structural edits to the transaction itself: an added input/output gets
    // its (empty) key-value map at the same index, so the document the WASM
    // checks always has one map per tx element. Like pair add/remove, the
    // change round-trips through rust-bitcoin immediately; on rejection the
    // working document is kept. The detail panel closes because box indices
    // may shift.
    out.querySelectorAll("[data-tx-add]").forEach((button) =>
      button.addEventListener("click", () => {
        setError("");
        selected = null;
        mutate((draft) => {
          if (button.dataset.txAdd === "input") {
            draft.tx.inputs.push({ txid: "0".repeat(64), vout: 0, scriptSig: "", sequence: 4294967295 });
            draft.inputs.push([]);
          } else {
            draft.tx.outputs.push({ value: 0, scriptPubKey: "" });
            draft.outputs.push([]);
          }
        });
      })
    );
    out.querySelectorAll("[data-txin-del]").forEach((button) =>
      button.addEventListener("click", () => {
        const index = Number(button.dataset.txinDel);
        selected = null;
        mutate((draft) => {
          draft.tx.inputs.splice(index, 1);
          draft.inputs.splice(index, 1);
        });
      })
    );
    out.querySelectorAll("[data-txout-del]").forEach((button) =>
      button.addEventListener("click", () => {
        const index = Number(button.dataset.txoutDel);
        selected = null;
        mutate((draft) => {
          draft.tx.outputs.splice(index, 1);
          draft.outputs.splice(index, 1);
        });
      })
    );

    // Flow-diagram boxes (and the middle transaction box) toggle the detail
    // panel under the diagram; the part's fields render there (and out of
    // the sections list) while open.
    const vizTarget = (part) => (part.kind === "tx" ? "tx" : `${part.kind}:${part.index}`);
    out.querySelectorAll("[data-viz]").forEach((button) =>
      button.addEventListener("click", () => {
        const [kind, indexText] = button.dataset.viz.split(":");
        const part = kind === "tx" ? { kind } : { kind, index: Number(indexText) };
        const closing = selected && selected.kind === part.kind && (part.kind === "tx" || selected.index === part.index);
        selected = closing ? null : part;
        render();
        renderResult();
        // Keep focus on the control that reflects the new state.
        (closing ? out.querySelector(`[data-viz="${vizTarget(part)}"]`) : out.querySelector("[data-viz-close]"))?.focus();
      })
    );
    out.querySelector("[data-viz-close]")?.addEventListener("click", () => {
      const focusBack = selected ? `[data-viz="${vizTarget(selected)}"]` : null;
      selected = null;
      render();
      renderResult();
      if (focusBack) out.querySelector(focusBack)?.focus();
    });

    out.querySelectorAll(".psbted-value").forEach((input) =>
      input.addEventListener("input", () => {
        const { kind, map, pair } = input.dataset;
        (kind === "global" ? doc.globals : kind === "input" ? doc.inputs[map] : doc.outputs[map])[Number(pair)].value = input.value.trim();
      })
    );
    out.querySelectorAll(".psbted-del").forEach((button) =>
      button.addEventListener("click", () => {
        const { kind, map, pair } = button.dataset;
        mutate((draft) => {
          const target = kind === "global" ? draft.globals : kind === "input" ? draft.inputs[map] : draft.outputs[map];
          target.splice(Number(pair), 1);
        });
      })
    );
    out.querySelectorAll("[data-add]").forEach((button) =>
      button.addEventListener("click", () => {
        const [kind, map] = button.dataset.add.split(":");
        const type = out.querySelector(`[data-add-type="${kind}:${map}"]`).value.trim().toLowerCase();
        const keydata = out.querySelector(`[data-add-key="${kind}:${map}"]`).value.trim().toLowerCase();
        const value = out.querySelector(`[data-add-val="${kind}:${map}"]`).value.trim().toLowerCase();
        setError("");
        // For a known type the key is type byte + keydata; for "Custom
        // type…" the keydata field carries the full key (type byte first).
        const key = type === "" ? keydata : type + keydata;
        if (!isHex(key) || key.length < 2) {
          setError(type === ""
            ? "Enter the full key (one type byte plus keydata) as hex."
            : "Keydata must be hex (an even number of 0-9/a-f digits).");
          return;
        }
        if (!isHex(value)) {
          setError("Value must be hex (an even number of 0-9/a-f digits).");
          return;
        }
        mutate((draft) => {
          const target = kind === "global" ? draft.globals : kind === "input" ? draft.inputs[map] : draft.outputs[map];
          target.push({ key, value });
        });
      })
    );

    drawViz(); // the boxes exist now; draw the connectors over the layout
  };

  load.onclick = () => {
    psbtWasmReady.then(loadFromText).catch((exception) => setError(exception.message || String(exception)));
  };
  // File upload is a second load path for the same loader: Sparrow & co. save
  // the PSBT as raw binary; a text export decodes through the paste rules.
  // The textarea mirrors the upload (as base64) so the loaded bytes and the
  // "edited PSBT" reload path stay visible.
  const file = $("psbted-file");
  $("psbted-upload").onclick = () => file.click();
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = ""; // picking the same file again must fire change again
    if (!chosen) return;
    psbtWasmReady
      .then(async () => {
        text.value = base64Encode(psbtBytesFromUpload(new Uint8Array(await chosen.arrayBuffer())));
        loadFromText();
      })
      .catch((exception) => setError(exception.message || String(exception)));
  });
  $("psbted-wipe").onclick = () => {
    doc = null;
    resultBytes = null;
    selected = null;
    text.value = "";
    setError("");
    render();
  };
  network.addEventListener("change", () => {
    if (doc) {
      render();
      renderResult();
    }
  });
};
