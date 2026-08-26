# EntropyLab

EntropyLab is a self-contained Bitcoin key and wallet calculator designed for
offline, air-gapped use. It converts user-supplied entropy, seed phrases, and
private keys into wallet recovery information without intentionally sending
sensitive data to a server.

Current version: **v0.1.2**

The project is created, owned, and maintained by **Mr.Hodl and Wicked**.

Official website: [entropylab.online](https://entropylab.online)

## Features

- Accepts dice rolls, coin flips, hexadecimal entropy, BIP39 seed phrases,
  extended keys, WIF keys, raw private keys, and Casascius mini private keys.
- Derives BIP39 seeds, BIP32 extended keys, wallet fingerprints, addresses,
  and Bitcoin Core-compatible descriptors.
- Supports legacy, nested SegWit, native SegWit, and Taproot single-signature
  address types.
- Supports Bitcoin mainnet and testnet.
- Builds watch-only multisignature wallets from extended public keys without
  requiring private keys.
- Inspects PSBT v0 transactions, reports PSBT-provided amounts and fees, checks
  for repeated ECDSA nonces from the same public key, and can compare supported
  SegWit v0 SIGHASH_ALL signatures with plain RFC 6979 in a temporary session.
- Produces recovery information that can be saved or printed for offline use.

## Usage

Download the repository to a trusted computer, disconnect that computer from
all networks, and open `entropylab.html` in a modern browser. For sensitive
wallet material, use a dedicated air-gapped machine and verify important
addresses and descriptors with an independent wallet or signing device before
receiving funds.

An online version is available at [entropylab.online](https://entropylab.online)
for convenient access. Do not enter seed phrases, private keys, or other secret
wallet material into an internet-connected device; use the downloaded HTML on
a trusted air-gapped computer for sensitive operations.

EntropyLab does not generate wallet entropy. The optional BitBox Heads/Tails
controls use browser randomness only to choose an equivalent displayed die
face: 1–3 all mean Heads and 4–6 all mean Tails, so that numeric choice does not
change the resulting BitBox entropy. Wallet security still depends on the
quality and secrecy of the entropy, seed phrase, passphrase, or private key
supplied by the user.

## Version snapshots

The root `entropylab.html` file is the current working version. Distinct
releases are preserved in the `versions/` directory using names such as
`entropylab-0.1.2.html`, with the version number incremented for each release.

## Security notice

Bitcoin private keys and seed phrases control funds. Review the code, test the
tool with known vectors, keep secret material offline, and maintain verified
backups. This software is provided without warranty; use it at your own risk.

## Authors and ownership

EntropyLab belongs to **Mr.Hodl and Wicked**, who are its creators and
maintainers.

## License

EntropyLab is released under the [MIT License](LICENSE). Copyright (c) 2026
Mr.Hodl and Wicked.
