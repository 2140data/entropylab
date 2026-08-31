import { test } from "node:test";
import assert from "node:assert/strict";
import { hodlPsbtGlobalCount, hodlPsbtGlobalU32, hodlPsbtVersion, hodlTxFromPsbtV2 } from "../src/js/psbt-v2.js";

const u32 = (n) => Uint8Array.of(n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255);
const r32 = (b) => new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
const r64 = (b) => {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[i]) << BigInt(8 * i);
  return v;
};
const find = (entries, type) => entries.filter((e) => e.type === type);
const varint = (b) => [b[0], 1];

test("missing version field is v0", () => {
  assert.equal(hodlPsbtVersion([], r32), 0);
  assert.equal(hodlPsbtVersion([{ type: 251, keydata: new Uint8Array(), val: u32(2) }], r32), 2);
});

test("v2 tx is built from input 0x0e/0x0f and output 0x03/0x04", () => {
  const txid = new Uint8Array(32).fill(9);
  const amount = Uint8Array.of(0xe8, 0x03, 0, 0, 0, 0, 0, 0);
  const script = Uint8Array.of(0x00, 0x14, ...new Uint8Array(20));
  const tx = hodlTxFromPsbtV2(
    [{ type: 2, keydata: new Uint8Array(), val: u32(2) }],
    [[{ type: 14, keydata: new Uint8Array(), val: txid }, { type: 15, keydata: new Uint8Array(), val: u32(1) }]],
    [[{ type: 3, keydata: new Uint8Array(), val: amount }, { type: 4, keydata: new Uint8Array(), val: script }]],
    { hodlFind: find, hodlR32: r32, hodlR64: r64, hodlVarInt: varint },
  );
  assert.equal(tx.version, 2);
  assert.equal(tx.inputs[0].vout, 1);
  assert.equal(tx.outputs[0].amount, 1000n);
});

test("version field: malformed lengths throw and keydata-bearing entries are ignored", () => {
  assert.throws(() => hodlPsbtVersion([{ type: 251, keydata: new Uint8Array(), val: Uint8Array.of(2, 0, 0) }], r32), /PSBT version field is malformed\./);
  assert.equal(hodlPsbtVersion([{ type: 251, keydata: Uint8Array.of(1), val: u32(9) }], r32), 0, "a version field with keydata is not the version field");
});

test("global u32 reader: absent is null, malformed throws, only empty keydata counts", () => {
  assert.equal(hodlPsbtGlobalU32([], 3, "PSBT v2 fallback locktime", r32), null);
  assert.equal(hodlPsbtGlobalU32([{ type: 3, keydata: new Uint8Array(), val: u32(500) }], 3, "PSBT v2 fallback locktime", r32), 500);
  assert.throws(
    () => hodlPsbtGlobalU32([{ type: 3, keydata: new Uint8Array(), val: Uint8Array.of(1, 2) }], 3, "PSBT v2 fallback locktime", r32),
    /PSBT v2 fallback locktime is malformed\./,
  );
  assert.equal(hodlPsbtGlobalU32([{ type: 3, keydata: Uint8Array.of(7), val: u32(500) }], 3, "PSBT v2 fallback locktime", r32), null);
});

test("global count reader parses the declared compact size", () => {
  assert.equal(hodlPsbtGlobalCount([], 4, varint), null);
  assert.equal(hodlPsbtGlobalCount([{ type: 4, keydata: new Uint8Array(), val: Uint8Array.of(3) }], 4, varint), 3);
});

const validGlobal = [{ type: 2, keydata: new Uint8Array(), val: u32(2) }];
const validInput = [{ type: 14, keydata: new Uint8Array(), val: new Uint8Array(32).fill(9) }, { type: 15, keydata: new Uint8Array(), val: u32(1) }];
const validOutput = [
  { type: 3, keydata: new Uint8Array(), val: Uint8Array.of(0xe8, 0x03, 0, 0, 0, 0, 0, 0) },
  { type: 4, keydata: new Uint8Array(), val: Uint8Array.of(0x00, 0x14, ...new Uint8Array(20)) },
];
const helpers = { hodlFind: find, hodlR32: r32, hodlR64: r64, hodlVarInt: varint };

test("a v2 transaction without a version field is rejected", () => {
  assert.throws(() => hodlTxFromPsbtV2([], [validInput], [validOutput], helpers), /missing the transaction version/);
});

test("declared input/output counts must match the maps when present", () => {
  const withCounts = (inputs, outputs) => [
    ...validGlobal,
    { type: 4, keydata: new Uint8Array(), val: Uint8Array.of(inputs) },
    { type: 5, keydata: new Uint8Array(), val: Uint8Array.of(outputs) },
  ];
  assert.doesNotThrow(() => hodlTxFromPsbtV2(withCounts(1, 1), [validInput], [validOutput], helpers));
  assert.throws(() => hodlTxFromPsbtV2(withCounts(2, 1), [validInput], [validOutput], helpers), /input count does not match/);
  assert.throws(() => hodlTxFromPsbtV2(withCounts(1, 2), [validInput], [validOutput], helpers), /output count does not match/);
});

test("locktime defaults to 0 and an explicit value is honored", () => {
  assert.equal(hodlTxFromPsbtV2(validGlobal, [validInput], [validOutput], helpers).locktime, 0);
  const withLocktime = [...validGlobal, { type: 3, keydata: new Uint8Array(), val: u32(850000) }];
  assert.equal(hodlTxFromPsbtV2(withLocktime, [validInput], [validOutput], helpers).locktime, 850000);
});

test("inputs require a 32-byte txid and a 4-byte vout; sequence defaults to final", () => {
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [validInput.slice(1)], [validOutput], helpers), /input 0 is missing a previous txid/);
  const shortTxid = [{ type: 14, keydata: new Uint8Array(), val: new Uint8Array(31) }, validInput[1]];
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [shortTxid], [validOutput], helpers), /input 0 is missing a previous txid/);
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [validInput.slice(0, 1)], [validOutput], helpers), /input 0 is missing an output index/);
  assert.equal(hodlTxFromPsbtV2(validGlobal, [validInput], [validOutput], helpers).inputs[0].sequence, 0xffffffff, "default sequence");
  const withSequence = [...validInput, { type: 16, keydata: new Uint8Array(), val: u32(0xfffffffd) }];
  assert.equal(hodlTxFromPsbtV2(validGlobal, [withSequence], [validOutput], helpers).inputs[0].sequence, 0xfffffffd, "explicit sequence wins");
  const badSequence = [...validInput, { type: 16, keydata: new Uint8Array(), val: Uint8Array.of(1, 2) }];
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [badSequence], [validOutput], helpers), /input 0 sequence is malformed/);
});

test("outputs require an 8-byte amount and a script", () => {
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [validInput], [validOutput.slice(1)], helpers), /output 0 is missing an amount/);
  const shortAmount = [{ type: 3, keydata: new Uint8Array(), val: Uint8Array.of(1, 2, 3) }, validOutput[1]];
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [validInput], [shortAmount], helpers), /output 0 is missing an amount/);
  assert.throws(() => hodlTxFromPsbtV2(validGlobal, [validInput], [validOutput.slice(0, 1)], helpers), /output 0 is missing a script/);
});
