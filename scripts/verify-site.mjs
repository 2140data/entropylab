// Verifies the committed site artifact: the compiled index.html, the
// versioned snapshot, the versions.json manifest, and the published assets.
// Zero dependencies. Run with `npm run verify`.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8"));
const version = pkg.version;

if (!/^\d+(?:\.\d+)*$/.test(version)) {
  fail(`Invalid version in package.json: ${version}`);
}
const versionedFile = `entropylab-${version}.html`;

for (const name of ["index.html", versionedFile, "versions.json", "assets/favicon.png", "assets/entropylab_dark.png"]) {
  const path = join(repoDir, name);
  if (!existsSync(path) || statSync(path).size === 0) {
    fail(`Site artifact is missing or empty: ${name}`);
  }
}

// The compiled application and its versioned snapshot must be identical.
if (!readFileSync(join(repoDir, "index.html")).equals(readFileSync(join(repoDir, versionedFile)))) {
  fail(`index.html does not match ${versionedFile}. Run 'npm run build' and commit the result.`);
}

// The manifest must be deterministic and complete for the current release.
const expectedJson = `${JSON.stringify({ versions: [{ version: `v${version}`, file: versionedFile }] })}\n`;
if (readFileSync(join(repoDir, "versions.json"), "utf8") !== expectedJson) {
  fail(`versions.json does not match the current release.\nExpected: ${expectedJson}`);
}

// No stale generated snapshots at the repository root.
const rootSnapshots = readdirSync(repoDir).filter((name) => /^entropylab-\d+(?:\.\d+)*\.html$/.test(name));
if (JSON.stringify(rootSnapshots) !== JSON.stringify([versionedFile])) {
  fail(`Unexpected versioned snapshots at the root: ${rootSnapshots.join(", ")}`);
}

// Published assets must be intact and free of symbolic links.
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const label = join(prefix, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) fail(`Symbolic link in published assets: ${label}`);
    if (stats.isDirectory()) {
      walk(path, label);
    } else if (stats.size === 0) {
      fail(`Empty published asset: ${label}`);
    }
  }
};
walk(join(repoDir, "assets"), "assets");

console.log(`Verified site artifact for v${version} (index.html, ${versionedFile}, versions.json, assets/).`);
