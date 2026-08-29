// Runs the assembled application in headless Firefox against a local Node.js
// HTTP server and validates the BIP39/BIP32 vectors, input sanitization,
// same-origin network behavior, hosted presentation, and recovery-sheet
// exports. The in-page instrumentation and suite live alongside this harness.
// Run with `npm run test:browser` or `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const firefoxBin = process.env.FIREFOX_BINARY ?? "firefox";

const appVersion = JSON.parse(read("package.json")).version;
const appFile = "entropylab.html";
const appSource = join(root, appFile);

// Stage the site exactly the way scripts/build.mjs publishes it (the compiled
// entropylab.html), and add the instrumented test document and the hostile
// version manifest.
const stageSite = () => {
  const workDir = mkdtempSync(join(tmpdir(), "entropylab-browser-"));
  const siteDir = join(workDir, "site");
  const downloadDir = join(workDir, "downloads");
  const onlineProfile = join(workDir, "profile-online");
  const offlineProfile = join(workDir, "profile-offline");
  mkdirSync(join(siteDir, "assets"), { recursive: true });
  mkdirSync(downloadDir, { recursive: true });
  mkdirSync(onlineProfile, { recursive: true });
  mkdirSync(offlineProfile, { recursive: true });
  cpSync(appSource, join(siteDir, appFile));
  cpSync(join(root, "assets"), join(siteDir, "assets"), { recursive: true });

  const appHtml = read(appFile);
  const instrumentation = read("test/browser-instrumentation.html");
  const suite = read("test/browser-suite.html");

  // Inject the test instrumentation before the application stylesheet.
  const marker = '<style id="btc-calc-style">';
  const markerIndex = appHtml.indexOf(marker);
  if (markerIndex === -1) throw new Error("could not find the application stylesheet marker");
  const stageOne = `${appHtml.slice(0, markerIndex)}${instrumentation}${appHtml.slice(markerIndex)}`;

  // Append the browser suite before the document end.
  const testHtml = `${stageOne.replace(/<\/body>\s*<\/html>\s*$/, "")}${suite}</body></html>\n`;
  const testHtmlPath = join(siteDir, "browser-tests.html");
  writeFileSync(testHtmlPath, testHtml, "utf8");

  writeFileSync(
    join(siteDir, "versions.json"),
    `${JSON.stringify({
      versions: [
        { version: `v${appVersion}`, file: appFile },
        { version: "<img src=x onerror=window.__browserTestInjected=true>", file: "javascript:window.__browserTestInjected=true" },
        { version: "v9.9.9", file: "../../outside.html" },
        { version: "v1.0.0", file: "entropylab-1.0.0.html" },
      ],
    })}\n`,
    "utf8",
  );

  writeFileSync(join(workDir, "not-found.txt"), "Not found\n", "utf8");

  const userJs = [
    'user_pref("browser.download.folderList", 2);',
    `user_pref("browser.download.dir", "${downloadDir}");`,
    'user_pref("browser.download.useDownloadDir", true);',
    'user_pref("browser.download.alwaysOpenPanel", false);',
    'user_pref("browser.helperApps.neverAsk.saveToDisk", "text/plain,application/octet-stream");',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    "",
  ].join("\n");
  writeFileSync(join(onlineProfile, "user.js"), userJs, "utf8");
  writeFileSync(join(offlineProfile, "user.js"), userJs, "utf8");

  return { workDir, siteDir, downloadDir, onlineProfile, offlineProfile, testHtmlPath };
};

// A real HTTP server: concurrent connections, correct framing, 404s.
const createTestServer = ({ siteDir, testHtmlPath }) => {
  const notFound = { file: join(dirname(testHtmlPath), "..", "not-found.txt"), type: "text/plain; charset=utf-8" };
  const routes = {
    "/": { file: testHtmlPath, type: "text/html; charset=utf-8" },
    "/browser-tests.html": { file: testHtmlPath, type: "text/html; charset=utf-8" },
    "/versions.json": { file: join(siteDir, "versions.json"), type: "application/json" },
    [`/${appFile}`]: { file: join(siteDir, appFile), type: "text/html; charset=utf-8" },
  };
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const route = routes[path] ?? { ...notFound, status: 404, reason: "Not Found" };
    response.writeHead(route.status ?? 200, {
      "Content-Type": route.type,
      "Content-Length": statSync(route.file).size,
      "Cache-Control": "no-store",
    });
    response.end(readFileSync(route.file));
  });
  const listen = () => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  return { server, listen };
};

const spawnFirefox = (profile, url, logPath) => {
  const logFd = openSync(logPath, "w");
  const process = spawn(firefoxBin, ["--headless", "--new-instance", "--profile", profile, url], {
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  process.on("error", () => {});
  return process;
};

const waitForFile = async (file, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file) && statSync(file).size > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

const parseReport = (file) => {
  const lines = readFileSync(file, "utf8").trim().split("\n");
  const results = lines.map((line) => {
    const [status, name, error] = line.split("\t");
    return { ok: status === "ok", name: name ?? "", error: error ?? "" };
  });
  return {
    checks: results.length,
    results,
    failures: results.filter((result) => !result.ok),
  };
};

const tail = (file, maxLines = 120) => {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").split("\n").slice(-maxLines).join("\n");
};

test("headless Firefox runs the hosted and offline suites", async () => {
  const versionCheck = spawnSync(firefoxBin, ["--version"], { stdio: "pipe" });
  assert.equal(versionCheck.status, 0, `Firefox is required for the browser tests (tried "${firefoxBin}").`);
  assert.match(appVersion, /^\d+(\.\d+)*$/, `invalid application version in package.json: ${appVersion}`);
  assert.ok(existsSync(appSource), `compiled ${appFile} is missing (run 'npm run build')`);

  const { workDir, siteDir, downloadDir, onlineProfile, offlineProfile, testHtmlPath } = stageSite();
  const { server, listen } = createTestServer({ siteDir, testHtmlPath });
  const browsers = [];
  let port = 0;
  try {
    port = await listen();
    const onlineUrl = `http://127.0.0.1:${port}/browser-tests.html?online-preview=1`;
    const offlineUrl = `file://${testHtmlPath}?offline-test=1`;
    const onlineLog = join(workDir, "firefox-online.log");
    const offlineLog = join(workDir, "firefox-offline.log");
    browsers.push(spawnFirefox(onlineProfile, onlineUrl, onlineLog));
    browsers.push(spawnFirefox(offlineProfile, offlineUrl, offlineLog));

    const onlineReport = join(downloadDir, "online-results.txt");
    const offlineReport = join(downloadDir, "offline-results.txt");
    const [onlineDone, offlineDone] = await Promise.all([
      waitForFile(onlineReport, 60000),
      waitForFile(offlineReport, 60000),
    ]);
    assert.ok(
      onlineDone && offlineDone,
      `Timed out waiting for Firefox test reports.\n--- firefox-online.log ---\n${tail(onlineLog)}\n--- firefox-offline.log ---\n${tail(offlineLog)}`,
    );

    const online = parseReport(onlineReport);
    const offline = parseReport(offlineReport);
    // Guard against a report that exists because the suite bailed out early:
    // the hosted suite must genuinely run its full battery of checks.
    assert.ok(online.checks >= 20, `online suite report is incomplete: only ${online.checks} checks`);
    assert.ok(offline.checks >= 2, `offline suite report is incomplete: only ${offline.checks} checks`);

    const all = [...offline.results, ...online.results];
    let counter = 0;
    for (const result of all) {
      counter += 1;
      if (result.ok) {
        console.log(`ok ${counter} - ${result.name}`);
      } else {
        console.error(`not ok ${counter} - ${result.name}`);
        console.error(`  ${result.error}`);
      }
    }
    console.log(`1..${counter}`);
    const failures = [...offline.failures, ...online.failures];
    assert.equal(failures.length, 0, `${failures.length} Firefox integration test(s) failed: ${failures.map((f) => `${f.name}: ${f.error}`).join("; ")}`);
    console.log(`All ${counter} cryptographic and browser integration tests passed.`);
  } finally {
    for (const browser of browsers) {
      browser.kill("SIGKILL");
    }
    await new Promise((resolve) => server.close(resolve));
    rmSync(workDir, { recursive: true, force: true });
  }
});
