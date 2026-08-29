
(() => {
  const isHostedOnline = /^(www\.)?entropylab\.online$/i.test(location.hostname);
  const isLocalPreview = (
    location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)
  ) && new URLSearchParams(location.search).get("online-preview") === "1";
  if (!isHostedOnline && !isLocalPreview) return;

  document.getElementById("online-warning")?.removeAttribute("hidden");
})();

function hodlFormatRecoverySheet(text) {
  const lines = text.split("\n");
  if (lines[1] !== "ENTROPYLAB V{{VERSION}}") lines.splice(1, 0, "ENTROPYLAB V{{VERSION}}");
  return lines.join("\n");
}

(() => {
  const current = document.querySelector('meta[name="application-version"]')?.content || "v{{VERSION}}";
  const currentFile = "entropylab-" + current.replace(/^v/, "") + ".html";
  const labels = [...document.querySelectorAll(".site-version")];
  const downloads = [...document.querySelectorAll('[download^="entropylab-"]')];
  let availableVersions = [{ version: current, file: currentFile }];

  downloads.forEach((link) => {
    link.href = currentFile;
    link.download = currentFile;
  });

  const render = (versions) => {
    const safe = versions.filter((item) =>
      /^v\d+(?:\.\d+)*$/.test(item.version) &&
      /^entropylab-\d+(?:\.\d+)*\.html$/.test(item.file)
    );

    if (!safe.some((item) => item.version === current)) {
      safe.unshift({ version: current, file: currentFile });
    }
    const latest = safe.reduce((best, item) => {
      const parts = item.version.slice(1).split(".").map(Number);
      const bestParts = best.version.slice(1).split(".").map(Number);
      const length = Math.max(parts.length, bestParts.length);
      for (let index = 0; index < length; index++) {
        const difference = (parts[index] || 0) - (bestParts[index] || 0);
        if (difference > 0) return item;
        if (difference < 0) return best;
      }
      return best;
    }, safe[0]);
    availableVersions = safe.map((item) => ({ ...item }));

    // Every value below comes from the allowlist above, so the label is built
    // from text nodes and a same-directory href only.
    labels.forEach((label) => {
      const number = document.createElement("span");
      number.className = "site-version-number";
      number.textContent = current;

      let tag;
      if (latest.version === current) {
        tag = document.createElement("span");
        tag.className = "site-version-tag";
        tag.textContent = "(Latest)";
      } else {
        tag = document.createElement("a");
        tag.className = "site-version-tag site-version-update";
        tag.href = latest.file;
        const newer = document.createElement("span");
        newer.className = "site-version-number";
        newer.textContent = latest.version;
        tag.append(newer, " available");
        tag.setAttribute("aria-label", "Open EntropyLab " + latest.version + ", newer than this " + current + " build");
      }
      label.replaceChildren(number, document.createTextNode(" "), tag);
    });
  };

  render(availableVersions);
  window.addEventListener("pageshow", () => render(availableVersions));
  if (/^https?:$/.test(location.protocol)) {
    fetch("versions.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Version list unavailable");
        return response.json();
      })
      .then((data) => render(Array.isArray(data.versions) ? data.versions : []))
      .catch(() => {});
  }
})();
