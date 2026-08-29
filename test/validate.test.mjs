// Source validation and security invariants for the EntropyLab repository.
// Run with `npm run test:validate` or `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const pkg = JSON.parse(read("package.json"));
const appVersion = pkg.version;
const appFile = "entropylab.html";

const requiredFiles = [
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  appFile,
  "versions.json",
  "assets/favicon.png",
  "assets/entropylab_dark.png",
  "assets/entropylab_light.png",
  "assets/entropylab_banner.png",
  "scripts/build.mjs",
  "scripts/verify-site.mjs",
  "test/validate.test.mjs",
  "test/browser.test.mjs",
  "test/browser-instrumentation.html",
  "test/browser-suite.html",
  "src/index.html",
  "src/assets/logo-dark.png",
  "src/assets/logo-light.png",
  "src/css/styles.css",
  "src/js/app.js",
  "src/js/online.js",
  "src/js/network-check.js",
  "src/js/browser-check.js",
  "src/js/enhanced-inputs.js",
  "src/js/repeat-inputs.js",
  "src/js/sqlite-writer.js",
  "src/js/wallet-export.js",
  "test/sqlite-writer.test.mjs",
  "test/wallet-export.test.mjs",
  "test/wallet-export-reference.mjs",
  "test/browser-check.test.mjs",
  "test/psbt-metadata.test.mjs",
  "test/secret-clear.test.mjs",
  ".github/workflows/ci-cd.yml",
];

for (const file of requiredFiles) {
  test(`${file} exists`, () => {
    const path = join(root, file);
    assert.ok(existsSync(path) && statSync(path).isFile(), `${file} is missing or not a file`);
  });
}

test("package.json declares a valid version and the expected scripts", () => {
  assert.match(appVersion, /^\d+(\.\d+)*$/, `invalid version: ${appVersion}`);
  for (const script of ["build", "clean", "test", "verify", "ci"]) {
    assert.equal(typeof pkg.scripts?.[script], "string", `package.json is missing the "${script}" script`);
  }
});

test("dependencies and build tooling are exactly locked", () => {
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must use an exact version`);
  }
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.link) continue;
    assert.match(entry.integrity ?? "", /^sha512-/, `${path} has no SHA-512 package integrity`);
  }
  assert.equal(existsSync(join(root, "src/js/vendor.js")), false, "opaque vendor bundle must not return");
});

test("Node scripts and test files parse", () => {
  const nodeFiles = [
    "scripts/build.mjs",
    "scripts/verify-site.mjs",
    ...readdirSync(join(root, "test")).filter((name) => name.endsWith(".mjs")).map((name) => `test/${name}`),
  ];
  for (const file of nodeFiles) {
    execFileSync(process.execPath, ["--check", join(root, file)], { stdio: "pipe" });
  }
});

const readmeVersion = read("README.md").match(/^Current version: \*\*v([^*]*)\*\*$/m)?.[1] ?? "";

test("README version agrees with package.json", () => {
  assert.equal(readmeVersion, appVersion, `package.json: ${appVersion}; README: ${readmeVersion}`);
});

test("no versioned snapshots linger at the repository root", () => {
  const snapshots = readdirSync(root).filter((name) => /^entropylab-\d+(?:\.\d+)*\.html$/.test(name));
  assert.deepEqual(snapshots, [], `unexpected versioned snapshots: ${snapshots.join(", ")}`);
});

test("versions.json lists the current release", () => {
  assert.deepEqual(
    JSON.parse(read("versions.json")),
    { versions: [{ version: `v${appVersion}`, file: appFile }] },
  );
});

test("third-party actions are immutable and deployment is test-gated", () => {
  const workflow = read(".github/workflows/ci-cd.yml");
  assert.doesNotMatch(workflow, /^\s*uses:\s*[^\s]+@(?![0-9a-f]{40}(?:\s|$))/m);
  assert.match(workflow, /^\s{2}build:\n(?:.|\n)*?^\s{4}needs: \[test-ci, test-browser\]$/m);
  assert.match(workflow, /^\s{2}deploy:\n(?:.|\n)*?^\s{4}needs: \[build, verify\]$/m);
});

test("the intentional low-entropy recovery behavior is documented", () => {
  const security = read("SECURITY.md");
  assert.match(security, /low-entropy dice and card transcripts are accepted intentionally/i);
  assert.match(security, /does not claim that hashing a short input\s+makes it secure/i);
});

const htmlFiles = [appFile];

for (const file of htmlFiles) {
  test(`${file} declares HTML5`, () => {
    assert.match(read(file), /^<!DOCTYPE html>/);
  });
  test(`${file} has a closing html element`, () => {
    assert.match(read(file), /<\/html>\s*$/);
  });
  test(`${file} includes the offline content security policy`, () => {
    assert.ok(read(file).includes("default-src 'none'"), `${file} is missing the offline CSP`);
  });
  test(`${file} contains application JavaScript`, () => {
    assert.ok(read(file).includes("<script>"), `${file} has no inline script`);
  });
  test(`${file} has no remote executable subresources`, () => {
    const html = read(file);
    assert.doesNotMatch(html, /<(script|iframe)[^>]+src=["' ]*https?:\/\//i);
    assert.doesNotMatch(html, /<link[^>]+href=["' ]*https?:\/\//i);
  });
  test(`${file} inlines the favicon from the published asset`, () => {
    const inlined = read(file).match(/<link rel="icon" type="image\/png" sizes="64x64" href="data:image\/png;base64,([A-Za-z0-9+/=]+)">/);
    assert.ok(inlined, `${file} has no inlined favicon`);
    assert.ok(
      Buffer.from(inlined[1], "base64").equals(readFileSync(join(root, "assets/favicon.png"))),
      `${file} favicon does not match assets/favicon.png`,
    );
  });
  test(`${file} inlines the header logo for both themes`, () => {
    const html = read(file);
    // The downloaded file has no assets/ beside it, so the logo has to travel
    // inside the document or the fixed header renders empty when air-gapped.
    assert.match(html, /\.site-logo \{[^}]*background: url\("data:image\/png;base64,[A-Za-z0-9+/=]+"\) center \/ contain no-repeat;/);
    assert.match(html, /:root\[data-theme="light"\] \.site-logo \{ background-image: url\("data:image\/png;base64,[A-Za-z0-9+/=]+"\); \}/);
  });
}

test("repository source has no unresolved merge markers", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      const path = join(dir, name);
      if (name === ".git" || name === "node_modules" || name.endsWith(".png")) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(path);
      } else {
        const lines = readFileSync(path, "utf8").split("\n");
        if (lines.some((line) => /^(<<<<<<<|=======|>>>>>>>)/.test(line))) {
          offenders.push(relative(root, path));
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], `unresolved merge markers in: ${offenders.join(", ")}`);
});
