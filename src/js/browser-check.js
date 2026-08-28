
// Browser sanity check: runs a quick barrage of smoke tests at startup to
// confirm this host can run EntropyLab's wallet math correctly. Every check
// covers a platform feature the application depends on: a secure context,
// the CSPRNG (vendor.js), BigInt arithmetic (key derivation and the SQLite
// writer), UTF-8 TextEncoder/TextDecoder (hashing entropy input and writing
// wallet.dat), and NFKD string normalization (BIP39 passphrases). The
// checks are synchronous, read-only, and generate no network traffic. When
// every check passes the page is left untouched; when any check fails the
// entire page is killed and replaced with a centered failure report listing
// the failed checks, because wallet output from a broken host cannot be
// trusted. This script runs before the application scripts so a host broken
// enough to crash them still gets the failure screen.
(() => {
  // Each check returns true when the browser behaves and throws or returns
  // false when it does not. Keep every check free of BigInt literal syntax
  // so a browser too old for BigInt still parses this file and reports the
  // failure instead of dying silently.
  const checks = [
    {
      name: "Secure browser context",
      run: () => window.isSecureContext === true,
    },
    {
      name: "crypto.getRandomValues (CSPRNG)",
      run: () => {
        if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") return false;
        const first = new Uint8Array(32);
        const second = new Uint8Array(32);
        if (crypto.getRandomValues(first) !== first) return false;
        crypto.getRandomValues(second);
        const allZero = (bytes) => bytes.every((byte) => byte === 0);
        if (allZero(first) || allZero(second)) return false;
        // Two independent CSPRNG fills must not match; a broken generator
        // that repeats the same bytes would silently reuse key material.
        return !first.every((byte, index) => byte === second[index]);
      },
    },
    {
      name: "BigInt arithmetic",
      run: () => {
        if (typeof BigInt !== "function") return false;
        // 2**255 + 1 exercises wide arithmetic across the full secp256k1
        // range without relying on BigInt literal syntax.
        const value = (BigInt(1) << BigInt(255)) + BigInt(1);
        return value.toString(16) === "8" + "0".repeat(62) + "1";
      },
    },
    {
      name: "TextEncoder/TextDecoder (UTF-8)",
      run: () => {
        if (typeof TextEncoder !== "function" || typeof TextDecoder !== "function") return false;
        // U+00E9 (composed e-acute) must encode as UTF-8 C3 A9 and decode back.
        const bytes = new TextEncoder().encode("\u00e9");
        if (bytes.length !== 2 || bytes[0] !== 0xc3 || bytes[1] !== 0xa9) return false;
        return new TextDecoder().decode(bytes) === "\u00e9";
      },
    },
    {
      name: "String.normalize (NFKD)",
      run: () => {
        if (typeof "".normalize !== "function") return false;
        // BIP39 passphrases are NFKD-normalized: U+00E9 must decompose
        // into e + U+0301. Escapes keep file re-encoding from breaking this.
        // escapes so file re-encoding cannot silently break the comparison.
        return "\u00e9".normalize("NFKD") === "e\u0301";
      },
    },
  ];

  const failed = [];
  for (const { name, run } of checks) {
    let ok = false;
    try {
      ok = run() === true;
    } catch {
      ok = false;
    }
    if (!ok) failed.push(name);
  }

  // Record the outcome on <html> so tests and support can confirm the
  // barrage actually ran, even when everything passed and the page lives.
  const root = document.documentElement;
  if (root) {
    root.dataset.browserChecks = String(checks.length);
    root.dataset.browserFailed = String(failed.length);
  }
  if (failed.length === 0 || !document.body) return;

  // Kill the page: replace everything with the centered failure report.
  // Check names are trusted literals defined above, never user input.
  const rows = failed.map((name) => `<tr><td>${name}</td><td>Failed</td></tr>`).join("");
  document.body.innerHTML = `
<main class="sanity-failure">
  <div class="sanity-failure-card" role="alert">
    <svg class="sanity-failure-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"></path></svg>
    <h1 class="sanity-failure-title">Host failed basic sanity checks</h1>
    <p class="sanity-failure-message">This page should not be used until checks passed.</p>
    <table class="sanity-failure-table">
      <thead><tr><th>Startup sanity check</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="sanity-failure-advice">Open this file in a current, mainstream browser such as Firefox on a trusted, air-gapped computer.</p>
  </div>
</main>`;
})();
