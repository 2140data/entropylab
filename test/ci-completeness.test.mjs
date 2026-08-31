// CI completeness guard: every test suite in test/ must actually run in CI.
//
// `npm test` globs test/*.test.mjs, but CI runs the explicit file list in the
// test:ci script (plus the Firefox suite via test:browser). A suite that is
// added to the repo but never listed there passes locally and silently never
// gates a pull request. This check is the non-WASM analogue of the WASM gate
// in validate.test.mjs: it diffs the directory against the wiring and fails
// on any orphan or stale entry.
// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const pkg = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/ci-cd.yml");

// The headless-Firefox suite has its own CI job and script; every other suite
// must ride the test:ci gate.
const BROWSER_SUITE = "test/browser.test.mjs";

const suitesIn = (script) => [...String(script ?? "").matchAll(/test\/[\w.-]+\.test\.mjs/g)].map((match) => match[0]);

// Returns every way the CI wiring is incomplete, so the same check can be
// exercised against doctored inputs below. A guard that cannot fail is not a
// guard.
function ciCoverageProblems(testCiScript, testBrowserScript, workflowText, filesOnDisk) {
  const problems = [];
  const wired = suitesIn(testCiScript);
  const wiredSet = new Set(wired);
  for (const file of filesOnDisk) {
    if (file === BROWSER_SUITE) continue;
    if (!wiredSet.has(file)) problems.push(`${file} is on disk but never runs in CI (missing from the test:ci script)`);
  }
  for (const name of wiredSet) {
    if (!filesOnDisk.includes(name)) problems.push(`the test:ci script references ${name}, which does not exist`);
  }
  for (const name of wired) {
    if (wired.indexOf(name) !== wired.lastIndexOf(name)) problems.push(`the test:ci script runs ${name} twice`);
  }
  if (filesOnDisk.includes(BROWSER_SUITE)) {
    if (!suitesIn(testBrowserScript).includes(BROWSER_SUITE)) problems.push(`the test:browser script must run ${BROWSER_SUITE}`);
    const job = workflowText.match(/^  test-browser:\n(?:.|\n)*?(?=^  [a-z-]+:|\Z)/m)?.[0] ?? "";
    if (!job) problems.push("the test-browser CI job is missing");
    else if (!/npm run test:browser/.test(job)) problems.push("the test-browser CI job does not run the Firefox suite");
  }
  const gate = workflowText.match(/^  test-ci:\n(?:.|\n)*?(?=^  [a-z-]+:|\Z)/m)?.[0] ?? "";
  if (!gate) problems.push("the test-ci CI job is missing");
  else if (!/npm run test:ci/.test(gate)) problems.push("the test-ci CI job does not run npm run test:ci");
  return problems;
}

const filesOnDisk = readdirSync(join(root, "test"))
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => `test/${name}`)
  .sort();

test("every test suite is wired into CI", () => {
  assert.ok(filesOnDisk.length > 30, `expected the test suite barrage, found ${filesOnDisk.length} suites`);
  assert.deepEqual(ciCoverageProblems(pkg.scripts["test:ci"], pkg.scripts["test:browser"], workflow, filesOnDisk), []);
});

test("npm test runs the full directory so local runs match CI", () => {
  assert.equal(pkg.scripts.test, "node --test test/*.test.mjs", "the test script must glob every suite in test/");
});

test("the CI completeness guard detects its own failure modes", () => {
  const script = pkg.scripts["test:ci"];
  const victim = suitesIn(script).find((name) => name !== BROWSER_SUITE);
  assert.ok(victim, "fixture: test:ci lists at least one suite");
  const dropped = script.replace(` ${victim}`, "");
  assert.notEqual(dropped, script, "fixture: the suite name must appear in the script");
  assert.ok(
    ciCoverageProblems(dropped, pkg.scripts["test:browser"], workflow, filesOnDisk).some((problem) => problem.includes(victim)),
    "dropping a suite from test:ci must be detected",
  );
  const stale = `${script} test/no-such-suite.test.mjs`;
  assert.ok(
    ciCoverageProblems(stale, pkg.scripts["test:browser"], workflow, filesOnDisk).some((problem) => problem.includes("no-such-suite")),
    "a stale test:ci entry must be detected",
  );
  const doubled = `${script} ${victim}`;
  assert.ok(
    ciCoverageProblems(doubled, pkg.scripts["test:browser"], workflow, filesOnDisk).some((problem) => problem.includes("twice")),
    "a duplicate test:ci entry must be detected",
  );
  const noBrowser = workflow.replace("npm run test:browser", "npm run test:network");
  assert.notEqual(noBrowser, workflow, "fixture: the test-browser job must run the Firefox suite");
  assert.ok(
    ciCoverageProblems(script, pkg.scripts["test:browser"], noBrowser, filesOnDisk).some((problem) => problem.includes("test-browser")),
    "a test-browser job that stops running the Firefox suite must be detected",
  );
  const noGate = workflow.replace("npm run test:ci", "npm run test:network");
  assert.notEqual(noGate, workflow, "fixture: the test-ci job must run test:ci");
  assert.ok(
    ciCoverageProblems(script, pkg.scripts["test:browser"], noGate, filesOnDisk).some((problem) => problem.includes("test-ci")),
    "a test-ci job that stops running test:ci must be detected",
  );
});
