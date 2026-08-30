
(() => {
  const isHostedOnline = /^(www\.)?entropylab\.online$/i.test(location.hostname);
  const isLocalPreview = (
    location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)
  ) && new URLSearchParams(location.search).get("online-preview") === "1";
  if (!isHostedOnline && !isLocalPreview) return;

  const banner = document.getElementById("online-warning");
  if (!banner) return;
  // This unit owns the banner's visibility, so a dismissal is checked here
  // rather than hidden again afterwards: the row is never revealed at all.
  // Keyed to the build version, the same store the beta banner and the
  // disclaimer use, so a new release warns again. Without storage the
  // warning simply returns, which is the safe direction for this one.
  const KEY = "entropylab-online-warning-dismissed";
  const VERSION = "{{VERSION}}";
  try {
    if (localStorage.getItem(KEY) === VERSION) return;
  } catch (e) {}
  banner.removeAttribute("hidden");
  const dismiss = document.getElementById("online-warning-dismiss");
  if (dismiss) dismiss.onclick = () => {
    try {
      localStorage.setItem(KEY, VERSION);
    } catch (e) {}
    banner.hidden = true;
  };
})();

function hodlFormatRecoverySheet(text) {
  const lines = text.split("\n");
  if (lines[1] !== "ENTROPYLAB V{{VERSION}}") lines.splice(1, 0, "ENTROPYLAB V{{VERSION}}");
  return lines.join("\n");
}
