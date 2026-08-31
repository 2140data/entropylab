// BIP39 mnemonic operations for EntropyLab, backed by the rust-bip39 crate
// compiled to WebAssembly (Rust crate in entropylab-wasm/, loaded by
// entropylab-wasm.js). English only.
//
// Drop-in replacement for the slice of @scure/bip39 the app uses:
// entropyToMnemonic, mnemonicToEntropy, validateMnemonic, mnemonicToSeedSync.
// NFKD normalization happens here in JS (String.normalize), exactly as the
// previous implementation did it; the crate parses already-normalized text.
// The English wordlist itself stays JS-side (bip39-english.js) because the UI
// reads it directly; a test proves it identical to the crate's list.
import { wasmExports as wasm, withInput, withOutput } from "./entropylab-wasm.js";
import { pbkdf2Sha512 } from "./hashes.js";
import { wordlist as bip39English } from "./bip39-english.js";

export { bip39English };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const PHRASE_CAP = 1024; // a 24-word phrase is at most ~250 bytes
const ENTROPY_CAP = 64; // BIP39 entropy is 16..32 bytes

const nfkd = (value) => {
  if (typeof value !== "string") throw new TypeError("invalid mnemonic type: " + typeof value);
  return value.normalize("NFKD");
};

const entropyToMnemonic = (entropy, wordlist = bip39English) => {
  if (!(entropy instanceof Uint8Array) || ![16, 20, 24, 28, 32].includes(entropy.length)) {
    throw new RangeError("invalid entropy length");
  }
  if (wordlist !== bip39English) throw new Error("Only the BIP39 English wordlist is supported.");
  const out = withInput(entropy, (p) => withOutput(PHRASE_CAP, (o) => wasm().el_bip39_entropy_to_mnemonic(p, entropy.length, o, PHRASE_CAP)));
  if (!out) throw new Error("BIP39 mnemonic encoding failed.");
  return textDecoder.decode(out);
};

const mnemonicToEntropy = (mnemonic, wordlist = bip39English) => {
  if (wordlist !== bip39English) throw new Error("Only the BIP39 English wordlist is supported.");
  const phrase = textEncoder.encode(nfkd(mnemonic));
  const out = withInput(phrase, (p) => withOutput(ENTROPY_CAP, (o) => wasm().el_bip39_mnemonic_to_entropy(p, phrase.length, o, ENTROPY_CAP)));
  if (!out) throw new Error("Invalid mnemonic");
  return out;
};

const validateMnemonic = (mnemonic, wordlist = bip39English) => {
  if (wordlist !== bip39English) return false;
  try {
    const phrase = textEncoder.encode(nfkd(mnemonic));
    return withInput(phrase, (p) => wasm().el_bip39_validate(p, phrase.length)) === 1;
  } catch {
    return false;
  }
};

// PBKDF2-HMAC-SHA512(NFKD(mnemonic), NFKD("mnemonic" + passphrase), 2048, 64).
const mnemonicToSeedSync = (mnemonic, passphrase = "") => {
  const phrase = textEncoder.encode(nfkd(mnemonic));
  const salt = textEncoder.encode(nfkd("mnemonic" + passphrase));
  return pbkdf2Sha512(phrase, salt, 2048, 64);
};

export { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic };
