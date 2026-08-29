# Contributing to EntropyLab

Thanks for your interest in EntropyLab. This project is small on purpose, and
its value comes from being auditable. Please read this before opening a pull
request — especially the first section.

## 1. The rule that decides everything: EntropyLab will NOT generate entropy

**EntropyLab does not generate entropy, and it will not start.** The tool
converts entropy that the *user* supplies — dice rolls, coin flips, hex, seed
phrases, private keys — into wallet recovery information. It is a calculator,
not a key generator.

The reason is trust, not technical limitation:

- A random number generator you cannot inspect is the weakest link in a wallet.
- Anyone can type `crypto.getRandomValues(32)` in a browser console. The whole
  point of this tool is that the user can *see, verify and reproduce* every
  step of a derivation made from randomness they produced themselves, offline.
- The moment the tool manufactures randomness, "I verified the output" stops
  being true, because the input is no longer verifiable.

### What this means in practice

Out of policy — will be closed, not merged:

- "Generate private key" / "Generate seed phrase" / "Generate entropy" buttons.
- Any use of `Math.random()` or `crypto.getRandomValues()` as a *source of
  secret material* — keys, seeds, entropy, passphrases, nonces shown to the
  user, salt values, or default values that end up in private material.
- Auto-filling, auto-suggesting, or pre-secreting secret material.
- Pre-generated or example keys presented as ready-to-use wallets.
- Wrapping an external "randomness" service, or collecting randomness from
  server-side code.

In policy:

- Deterministic transformations of user-supplied input. Same input → same
  output, always.
- Letting the user paste, type, or tap in their own randomness.
- Test fixtures with fixed, published test vectors (these are *inputs* whose
  randomness is irrelevant and explicitly not for use with real funds).

### The one narrow exception, already in the code

The BitBox Heads/Tails controls use `crypto.getRandomValues()` to pick which
*equivalent* die face to display: **1–3 all mean Heads and 4–6 all mean Tails**.
The chosen number is discarded as soon as it is rendered; only the Heads/Tails
meaning affects the derivation. The numeric choice therefore carries **zero
entropy** and never appears in any seed, key, or export. It exists so that a
user tapping "Heads" cannot infer a bias in the displayed face — nothing more.

If you believe you need a new exception, open an issue and argue it against the
section above. Please do not open a pull request that quietly adds one.

Note: some locked cryptographic dependencies expose random helpers of their
own. Availability is not permission — application code in `src/js/app.js` and
the other first-party modules stays deterministic.

## 2. Keep it Simple

- The smallest change that fixes the problem is the right change. Prefer it.
- **No unreviewed dependencies.** Cryptographic and build dependencies must be
  exact versions in `package.json`, resolved with integrity hashes in the
  committed `package-lock.json`, and installed with `npm ci`. Do not commit
  copied or prebundled third-party source.
- No frameworks, no transpilers, no bundler abstractions beyond
  `scripts/build.mjs`, no config files for things that can be code.
- One output: a single self-contained HTML file. Nothing in the design should
  add a runtime requirement (server, network, storage, extensions).
- Delete code rather than add it. Dead code is attack surface and review debt.
- Optimise for the reader who is auditing this for backdoors, not for elegance.
- If a change needs a paragraph of justification, it is too clever. Rewrite it
  boring and obvious.

## 3. Other guidelines, kept short

### Network egress is a hostile act

The tool is meant to run air-gapped. It must not phone home.

- No new outbound requests: no `fetch`/`XMLHttpRequest`/WebSocket/EventSource
  to other origins, no remote `<img>`, `<script>`, `<link>`, no fonts or CDNs,
  no analytics, no "update check", no version pings beyond the existing hosted
  version manifest.
- Everything the app loads must be same-origin or inlined at build time. The
  headless browser suite asserts that observed requests stay same-origin; keep
  that test green.
- If a change genuinely requires network access, it belongs in a separate tool,
  not here.

### Get set up

```sh
git clone https://github.com/w-s-bitcoin/entropylab.git
cd entropylab
node --version        # >= 20.19
npm ci
npm test
```

Useful commands (same ones CI runs):

```sh
npm run build         # compile src/ into the committed root files
npm run verify        # verify the site artifact, manifest and assets
npm run test:validate # source and security invariants
npm run test:browser  # headless-Firefox suite (needs a local Firefox)
npm run ci            # test subset + build + verify, in order
```

### Edit sources, never the build output

`entropylab.html` and `versions.json` are generated and
committed so the app can be downloaded directly. Change `src/` instead, then run
`npm run build` and commit the regenerated files in the same commit. Hand-edited
output will fail CI's reproducibility check.

### Versioning and docs move together

- The version is declared once, in `package.json`. Bump it only when a
  maintainer asks for it.
- `README.md` carries `Current version: **vX.Y.Z**` and must match
  `package.json`; a test enforces this.
- When you change user-facing behaviour or the security model, update
  `README.md` and `SECURITY.md` in the same pull request. Documentation is part
  of the security posture, not an afterthought.

### Tests

- New or changed behaviour needs a test. Published vectors (BIP39, BIP32,
  Bitcoin Core fixtures) are preferred over hand-rolled expectations.
- Add new suites as `test/<name>.test.mjs` and wire them into the `scripts` in
  `package.json`, including `test:ci` when they run without a browser.
- Do not weaken, skip, or delete an existing test to make CI pass. If a test is
  wrong, say why in the pull request.

### Pull requests

- Small and focused: one change per pull request. No drive-by reformatting,
  renames, or "while I was in there" cleanups — they make security review
  impossible.
- Describe **what** and **why** in the description, and list the commands you
  ran (e.g. `npm run ci`, `npm run test:browser`).
- Match the style of the file you are editing, including its density. New
  abstractions are not automatically an improvement.
- Comments should explain intent and security-relevant reasoning, not restate
  the code.
- It is fine to open an issue first, or a draft pull request. Silence is not a
  rejection; security-sensitive code is reviewed slowly on purpose.

### What we will not accept

- Anything from section 1 (entropy generation) or section 3 (network egress).
- Changes to the license or authorship notices. The software is public domain;
  keep it that way — no re-licensing, no added restrictions, no claims of
  copyright over the code.
- Changes that obscure what the compiled `entropylab.html` does.
- Pools of unrelated refactors, style-only commits, or dependency additions
  "for developer experience".

### Security issues

Do **not** open a public issue for anything that can lose funds or leak secret
material. Follow [SECURITY.md](SECURITY.md) and report privately through GitHub
Security Advisories.

### License

The software is public domain ([LICENSE](LICENSE)). Your contribution is public
domain too, and by opening a pull request you confirm you have the right to make
it so. If you cannot, open an issue instead and a maintainer will write the
change.

## A final sanity check

Before submitting, ask:

1. Does this keep EntropyLab a *calculator* that never invents entropy?
2. Does the app stay silent on the network?
3. Is it smaller, or at least no bigger, than it was?
4. Is the generated output rebuilt and committed, docs and version in sync?
5. Could an auditor follow the change in one pass?

If yes to all five, send it. Thanks.
