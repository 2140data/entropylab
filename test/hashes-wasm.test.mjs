// Tests for the bitcoin_hashes WASM facade (src/js/hashes.js, loaded by
// src/js/entropylab-wasm.js). Run with `npm test`.
//
// Three layers of assurance:
//  1. Fixed, independently published vectors (NIST for SHA-2, the RIPEMD-160
//     reference suite, RFC 4231 for HMAC, a widely published PBKDF2 vector).
//  2. Differential checks against node:crypto (OpenSSL) — the platform, not
//     one of the JS libraries this module replaced.
//  3. Differential checks against @noble/hashes (pinned, previously the
//     implementation): the migration must be byte-for-byte identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { sha256 as nobleSha256, sha512 as nobleSha512 } from "@noble/hashes/sha2.js";
import { ripemd160 as nobleRipemd160 } from "@noble/hashes/legacy.js";
import { hmac as nobleHmac } from "@noble/hashes/hmac.js";
import { pbkdf2 as noblePbkdf2 } from "@noble/hashes/pbkdf2.js";
import { hash160, hashesReady, hmacSha512, pbkdf2Sha512, ripemd160, sha256, sha512 } from "../src/js/hashes.js";

const hexToBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
const bytesToHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const utf8 = (text) => new TextEncoder().encode(text);

test("hashesReady resolves (WASM initialized synchronously under Node)", async () => {
  await hashesReady;
});

test("SHA-256 matches the NIST vectors", () => {
  assert.equal(bytesToHex(sha256(utf8(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(bytesToHex(sha256(utf8("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    bytesToHex(sha256(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
  );
});

test("SHA-512 matches the NIST vectors", () => {
  assert.equal(bytesToHex(sha512(utf8(""))), "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e");
  assert.equal(
    bytesToHex(sha512(utf8("abc"))),
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
  );
});

test("RIPEMD-160 matches the reference suite", () => {
  assert.equal(bytesToHex(ripemd160(utf8(""))), "9c1185a5c5e9fc54612808977ee8f548b2258d31");
  assert.equal(bytesToHex(ripemd160(utf8("abc"))), "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc");
  assert.equal(bytesToHex(ripemd160(utf8("message digest"))), "5d0689ef49d2fae572b881b123a85ffa21595f36");
});

test("hash160 is RIPEMD-160(SHA-256(x)), checked against node:crypto", () => {
  // Published Bitcoin constant: HASH160 of the generator point's compressed
  // encoding (used by any BIP32 pubkey fingerprint).
  const generator = hexToBytes("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
  assert.equal(bytesToHex(hash160(generator)), "751e76e8199196d454941c45d1b3a323f1433bd6");
  const input = utf8("EntropyLab hash160 differential input");
  assert.equal(bytesToHex(hash160(input)), createHash("ripemd160").update(createHash("sha256").update(input).digest()).digest("hex"));
});

test("HMAC-SHA-512 matches RFC 4231 test cases 1 and 2", () => {
  assert.equal(
    bytesToHex(hmacSha512(new Uint8Array(20).fill(0x0b), utf8("Hi There"))),
    "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854"
  );
  assert.equal(
    bytesToHex(hmacSha512(utf8("Jefe"), utf8("what do ya want for nothing?"))),
    "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737"
  );
});

test("PBKDF2-HMAC-SHA-512 matches the published vector and node:crypto", () => {
  // draft-josefsson-scrypt-style published vector, widely reproduced.
  assert.equal(
    bytesToHex(pbkdf2Sha512(utf8("password"), utf8("salt"), 1, 64)),
    "867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce"
  );
  // dkLen over 64 exercises the crate's multi-block loop (the app only ever
  // asks for one block, so nothing else covers the block counter).
  for (const [c, dkLen] of [[1, 64], [2, 64], [97, 32], [2048, 64], [3, 65], [3, 128], [5, 200]]) {
    assert.equal(
      bytesToHex(pbkdf2Sha512(utf8("password"), utf8("NaCl"), c, dkLen)),
      pbkdf2Sync(utf8("password"), utf8("NaCl"), c, dkLen, "sha512").toString("hex")
    );
  }
});

test("differential: hashes match noble and node:crypto on deterministic inputs", () => {
  for (let i = 0; i < 8; i++) {
    const input = new Uint8Array(i * 37 + 3).map((_, j) => (i * 131 + j * 17 + 5) & 0xff);
    assert.equal(bytesToHex(sha256(input)), bytesToHex(nobleSha256(input)), `sha256 len=${input.length}`);
    assert.equal(bytesToHex(sha256(input)), createHash("sha256").update(input).digest("hex"), `sha256/node len=${input.length}`);
    assert.equal(bytesToHex(sha512(input)), bytesToHex(nobleSha512(input)), `sha512 len=${input.length}`);
    assert.equal(bytesToHex(sha512(input)), createHash("sha512").update(input).digest("hex"), `sha512/node len=${input.length}`);
    assert.equal(bytesToHex(ripemd160(input)), bytesToHex(nobleRipemd160(input)), `ripemd160 len=${input.length}`);
    assert.equal(bytesToHex(ripemd160(input)), createHash("ripemd160").update(input).digest("hex"), `ripemd160/node len=${input.length}`);
    const key = new Uint8Array(i + 1).map((_, j) => (j * 31 + i) & 0xff);
    assert.equal(bytesToHex(hmacSha512(key, input)), bytesToHex(nobleHmac(nobleSha512, key, input)), `hmac len=${input.length}`);
    assert.equal(bytesToHex(hmacSha512(key, input)), createHmac("sha512", key).update(input).digest("hex"), `hmac/node len=${input.length}`);
    assert.equal(bytesToHex(pbkdf2Sha512(input, key, 3, 64)), bytesToHex(noblePbkdf2(nobleSha512, input, key, { c: 3, dkLen: 64 })), `pbkdf2 len=${input.length}`);
  }
});

test("multi-chunk HMAC concatenates like noble 1.x semantics", () => {
  const key = utf8("key");
  const a = utf8("Hello ");
  const b = utf8("world");
  const joined = new Uint8Array([...a, ...b]);
  assert.equal(bytesToHex(hmacSha512(key, a, b)), bytesToHex(nobleHmac(nobleSha512, key, joined)));
});

test("input validation rejects non-bytes and bad PBKDF2 parameters", () => {
  assert.throws(() => sha256("abc"), /Uint8Array/);
  assert.throws(() => hmacSha512("key", utf8("x")), /Uint8Array/);
  assert.throws(() => pbkdf2Sha512(utf8("p"), utf8("s"), 0, 64), /iterations/);
  assert.throws(() => pbkdf2Sha512(utf8("p"), utf8("s"), 1, 0), /dkLen/);
});
