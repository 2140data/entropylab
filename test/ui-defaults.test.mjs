import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const template = read("src/index.html");
const appSource = read("src/js/app.js");
// These source invariants predate the readable application source and match
// its compact syntax. Normalize formatting without renaming identifiers.
const app = transformSync(appSource, {
  format: "esm",
  minifySyntax: true,
  minifyWhitespace: true,
  target: "es2022",
}).code;
// Keep a compact representation that preserves literal text and control flow
// for the handful of assertions where syntax minification is intentionally
// not part of the invariant.
const appWhitespace = transformSync(appSource, {
  format: "esm",
  minifyWhitespace: true,
  target: "es2022",
  charset: "utf8",
}).code;
const css = read("src/css/styles.css");
const online = read("src/js/online.js");

test("top status banner omits the entropy RNG message", () => {
  assert.doesNotMatch(`${template}\n${app}`, /No entropy RNG/);
  assert.match(template, /<div class="kicker">Run Offline · Bring your own entropy<\/div>/);
});

test("all wallet network selectors enable and default to mainnet", () => {
  for (const id of ["network", "msig-network", "psbt-network"]) {
    const selectedMainnet = new RegExp(
      `<select id="${id}"><option value="mainnet" selected(?:="selected")?>Bitcoin mainnet</option>`,
    );
    assert.match(template, selectedMainnet);
    assert.match(app, selectedMainnet);
  }
  assert.doesNotMatch(`${template}\n${app}`, /option value="mainnet"[^>]*disabled/);
  assert.doesNotMatch(app, /hodlForceTestnet|temporarily disabled/);
  assert.match(app, /network:"mainnet"/);
});

test("single-key network selector is half width on wide screens and full width on narrow screens", () => {
  assert.match(template, /<label class="field network-field">Network\s*<select id="network">/);
  assert.match(app, /<label class="field network-field">Network\s*<select id="network">/);
  assert.match(css, /\.key-settings\.single-key-mode \.network-field \{ width: 100%; max-width: 50%; \}/);
  assert.match(
    css,
    /@media \(max-width: 520px\) \{[\s\S]*?\.key-settings\.single-key-mode \.network-field \{ max-width: none; \}/,
  );
});

test("entropy progress messages sit directly below their inputs and above keypads", () => {
  assert.match(app, /<textarea id="dice"[^>]*><\/textarea><\/div>\s*\$\{hodlSeedMetaRowMarkup\("dice-meta",!0\)\}\s*\$\{dicePad\}/);
  assert.match(app, /<textarea id="cards"[^>]*><\/textarea><\/div>\s*\$\{hodlSeedMetaRowMarkup\("cards-meta"\)\}\s*<div class="card-suit-pad"/);
  assert.match(app, /<textarea id="\$\{inputId\}"[\s\S]*?<\/textarea><\/div>\s*\$\{hodlSeedMetaRowMarkup\("entropy-meta",!0\)\}\s*\$\{base64Keyboard\}\s*\$\{entropyPad\}/);
  assert.match(app, /<textarea id="seed"[^>]*><\/textarea><\/div><p class="muted" id="seed-meta"[^>]*><\/p>\$\{hodlSeedKeyboardMarkup\(\)\}/);
  assert.match(app, /<textarea id="key"[^>]*><\/textarea><\/div><p class="muted" id="private-key-meta"[^>]*><\/p>/);
});

test("Number bases offers exact Base 2, 4, 8, 16, Crockford Base32, and Base64-alphabet input", () => {
  assert.match(template, />Number bases<\/button>/);
  assert.doesNotMatch(template, />Hex or binary<\/button>/);
  assert.ok(app.includes('formatChoices=["bin","base4","base8","hex","base32","base64"]'));
  assert.match(app, /name="entropy-format" value="\$\{id\}"/);
  for (const label of ["Binary (Base 2)", "Base 4", "Octal (Base 8)", "Hexadecimal (Base 16)", "Crockford Base32", "Base64 (RFC 4648 alphabet)"]) {
    assert.ok(app.includes(`label:"${label}"`), label);
  }
  assert.match(app, /alphabet:"0123456789ABCDEFGHJKMNPQRSTVWXYZ"/);
  assert.match(app, /alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\+\/"/);
  assert.match(app, /function hodlNumberBaseEntropy\(value,format,targetWords=Pt\)/);
  assert.match(app, /function hodlNumberBasePreviewWords\(value,format,targetWords=Pt\)/);
  assert.match(app, /function hodlNumberBaseValueFromBytes\(bytes,format,targetWords=Pt\)/);
  assert.match(app, /id="sync-number-bases"/);
  assert.match(app, /id="number-base-sync-status"[^>]*hidden>\$\{hodlCopiedIconMarkup\(\)\}<span>Synced<\/span>/);
  assert.match(app, /syncNumberBases:!1/);
  assert.match(app, /entropyFormat:"bin"/);
  assert.ok(app.includes('function hodlNormalizeEntropyFormat(format){return Object.hasOwn(hodlEntropyFormats,String(format??""))?String(format):"bin"}'));
  assert.match(css, /\.number-base-sync-status \{[\s\S]*?color: var\(--ok\)/);
  assert.match(app, /fields:\{[^}]*base4:"",base8:"",base32:"",base64:""/);
  assert.match(app, /function hodlBase64KeyboardMarkup\(\)\{return hodlKeyboardMarkup\(!0,"Base64 entropy","base64-keyboard"\)\}/);
  assert.match(app, /function hodlBindBase64Keyboard\(input\)/);
  assert.match(app, /coin flip \$\{Math\.min\(definition\.remainderBits,coinFlipsEntered\+1\)\} of \$\{definition\.remainderBits\}/);
  assert.match(app, /Heads \(0\) or Tails \(1\)/);
  assert.match(css, /\.dice-input-pad\.entropy-keypad \{ grid-template-columns: repeat\(8[^}]*grid-auto-flow: row;/);
  assert.match(css, /\.dice-input-pad\.entropy-keypad\.coin-phase \{ grid-template-columns: repeat\(2/);
  assert.match(css, /\.dice-input-pad\.entropy-keypad-bin \{ grid-template-columns: repeat\(2/);
  assert.match(css, /\.dice-input-pad\.entropy-keypad-base4 \{ grid-template-columns: repeat\(4/);
  assert.doesNotMatch(css, /\.entropy-keypad-(?:base8|hex|base32)[^}]*grid-template-columns/);
});

test("dealt playing cards use theme-appropriate surfaces", () => {
  assert.match(css, /:root \{[\s\S]*?--playing-card-bg: #292929;[\s\S]*?--playing-card-fg: #eeeeee;/);
  assert.match(css, /:root\[data-theme="light"\] \{[\s\S]*?--playing-card-bg: #ffffff;[\s\S]*?--playing-card-fg: #111111;/);
  assert.match(css, /\.dealt-card \{[\s\S]*?background: var\(--playing-card-bg\); color: var\(--playing-card-fg\);/);
  assert.match(css, /\.dealt-card\.is-red \{ color: var\(--playing-card-red\); \}/);
});

test("card undo uses the keyboard delete icon and one rank-grid column", () => {
  assert.match(app, /class="card-undo-button seed-keyboard-delete" id="card-undo"[^>]*aria-label="Undo last card"[^>]*><svg viewBox="0 0 24 18"/);
  assert.match(css, /\.card-controls-row \{[\s\S]*?grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 640px\) \{\s*\.card-controls-row \{ grid-template-columns: repeat\(13, minmax\(0, 1fr\)\); \}/);
});

test("seed phrase mode has a lowercase Jade-style on-screen keyboard", () => {
  assert.match(app, /function hodlSeedKeyboardToggleMarkup\(\)/);
  assert.match(app, /function hodlPassphraseKeyboardToggleMarkup\(\)/);
  assert.match(app, /function hodlPrivateKeyKeyboardToggleMarkup\(\)/);
  assert.match(app, /"passphrase-keyboard-toggle","on-screen passphrase keyboard"/);
  assert.match(app, /"private-keyboard-toggle","on-screen private key keyboard"/);
  assert.match(app, /function hodlSetOnScreenKeyboardOpen\(open\)/);
  assert.match(app, /querySelectorAll\("\[data-on-screen-keyboard-toggle\]"\)/);
  assert.match(app, /querySelectorAll\("\[data-on-screen-keyboard\]"\)/);
  assert.match(app, /<rect x="9" y="10"[^>]*>[\s\S]*<rect x="51" y="10" width="4"/);
  assert.match(app, /<rect x="12" y="18"[^>]*>[\s\S]*<rect x="48" y="18" width="4"/);
  assert.match(app, /function hodlSeedKeyboardMarkup\(\)/);
  assert.match(app, /data-seed-delete aria-label="Delete previous character"/);
  assert.match(app, /data-seed-keyboard-mode="lower"/);
  assert.match(app, /passphraseOnly\?`Change \$\{inputName\} character mode`:"Character mode switching is available for the passphrase"/);
  assert.match(app, />aA1<\/button><button[^>]*class="seed-keyboard-space"/);
  assert.match(app, /data-seed-key=" " aria-label="Enter space">space/);
  assert.ok(app.includes('number:["1234567890","!@#$%^&*()","-_+=/?\\\\"]'));
  assert.match(app, /Array\.from\(\{length:hodlSeedKeyboardLayouts\.number\[index\]\.length\}/);
  assert.match(app, /function hodlCycleSeedKeyboardLayout\(keyboard,button\)/);
  assert.match(app, /function hodlSetSeedKeyboardLayout\(keyboard,button,next\)/);
  assert.match(app, /order=\["lower","upper","number"\]/);
  assert.match(app, /function hodlSeedKeyboardCanEnterCharacter\(input,key,targetWords=Pt\)/);
  assert.match(app, /hodlBip39WordIndex=new Map\(Ae\.map\(\(word,index\)=>\[word,index\]\)\)/);
  assert.match(app, /hodlLastWordCache=new Map(?:\(\))?/);
  assert.match(app, /function hodlComputeTargetLastWords\(words,targetWords=Pt\)/);
  assert.match(app, /missingEntropyBits=config\.bits-prefixBits\.length/);
  assert.match(app, /for\(let suffix=0;suffix<2\*\*missingEntropyBits;suffix\+\+\)/);
  assert.match(app, /let finalContext=analysis\.finalContext,validation=/);
  assert.match(app, /options=context\.candidates/);
  assert.match(app, /function hodlSeedKeyboardCanEnterSpace\(input,targetWords=Pt\)/);
  assert.match(app, /words\.length<config\.words&&words\.every\(word=>hodlBip39WordSet\.has\(word\)\)/);
  assert.match(app, /function hodlUpdateSeedKeyboardKeys\(input,targetWords=Pt\)/);
  assert.match(app, /function hodlUpdatePassphraseKeyboardKeys\(input\)/);
  assert.match(app, /function hodlPrivateKeyboardCanEnterCharacter\(input,key\)/);
  assert.match(app, /function hodlUpdatePrivateKeyKeyboardKeys\(input\)/);
  assert.match(app, /function hodlPrivateKeyInitialCharacters\(kind,network\)/);
  assert.match(app, /network==="testnet"\?\["9","c"\]:\["5","K","L"\]/);
  assert.match(appWhitespace, /if\(kind==="minikey"\)return\["S"\]/);
  assert.match(app, /data-private-key-initial-row aria-label="Valid first characters" hidden/);
  assert.match(app, /keyboard\.classList\.toggle\("private-key-initial-options",show\)/);
  assert.match(app, /data-private-key-hex-keypad aria-label="Hexadecimal keypad" hidden/);
  assert.match(app, /\.\.\."0123456789"/);
  assert.match(app, /\.\.\."abcdef"/);
  assert.match(app, /keyboard\.classList\.toggle\("private-key-hex-options",hexOnly\)/);
  assert.match(css, /\.seed-keyboard\.private-key-initial-options \{ width: fit-content; \}/);
  assert.match(css, /\.private-key-hex-keypad \{ display: grid; gap: 4px; \}/);
  assert.match(app, /id="private-key-highlight" aria-hidden="true"/);
  assert.match(app, /id="private-key-meta" aria-live="polite"/);
  assert.match(app, /function hodlPrivateKeyInputAnalysis\(value,kind,network\)/);
  assert.match(app, /function hodlRenderPrivateKeyInputState\(input\)/);
  assert.match(app, /\$\{count2\} of 64 hexadecimal characters entered/);
  assert.match(app, /invalid character\$\{invalid\.length===1\?"":"s"\} highlighted/);
  assert.match(appWhitespace, /extra highlighted (?:·|\\xB7) remove to continue/);
  assert.match(app, /valid secp256k1 private key/);
  assert.match(app, /function hodlHexPrivateKeyPrefix\(value\)/);
  assert.match(app, /function hodlWifPrivateKeyPrefix\(value,network\)/);
  assert.match(app, /function hodlMiniPrivateKeyPrefix\(value\)/);
  assert.match(app, /name="kk" value="wif" checked/);
  assert.match(app, /name="kk" value="hex-key"/);
  assert.match(app, /<strong>WIF<\/strong>/);
  assert.match(app, /<strong>Private key hex<\/strong>/);
  assert.match(app, /function hodlDetectPrivateKeyKind\(value\)/);
  assert.match(app, /function hodlNormalizePrivateKeyKind\(kind,value=""\)/);
  assert.match(app, /var hodlPrivateKeyKinds=\["wif","hex-key","minikey","brain"\]/);
  assert.match(app, /function hodlPrivateKeyValues\(fields\)/);
  assert.match(app, /privateKeys:\{wif:"","hex-key":"",minikey:"",brain:""\}/);
  assert.match(app, /values\[previousKind\]=key\.value/);
  assert.match(app, /key\.value=values\[nextKind\]\|\|""/);
  assert.match(appWhitespace, /radio\.addEventListener\("input",change\);radio\.addEventListener\("change",change\)/);
  assert.match(app, /key\?\.dataset\.privateKeyKind\|\|checkedKeyKind/);
  assert.match(app, /function hodlPrivateKeyPlaceholder\(kind,network="mainnet"\)/);
  assert.match(appWhitespace, /if\(kind==="hex-key"\)return hodlHexPrivateKeyPrefix\(candidate\)/);
  assert.match(appWhitespace, /return hodlWifPrivateKeyPrefix\(candidate,hodlSelectedNetwork/);
  assert.match(app, /inputType==="insertFromPaste"/);
  assert.match(app, /function hodlAssertPrivateKeyKind\(value,network,kind\)/);
  assert.match(app, /keyKind:"wif"/);
  assert.match(app, /\^S\[1-9A-HJ-NP-Za-km-z\]\*\$/);
  assert.match(app, /prefixes=network==="testnet"\?\["9","c"\]:\["5","K","L"\]/);
  assert.match(app, /space\.disabled=kind!=="brain"/);
  assert.match(app, /function hodlDecodeMiniPrivateKey\(value\)/);
  assert.match(app, /\^S\(\?:\[1-9A-HJ-NP-Za-km-z\]\{21\}\|\[1-9A-HJ-NP-Za-km-z\]\{29\}\)\$/);
  assert.match(app, /function hodlPassphraseKeyboardMarkup\(\)/);
  assert.match(app, /function hodlPrivateKeyKeyboardMarkup\(\)/);
  assert.match(app, /function hodlBindPassphraseKeyboard\(inputId="pass",toggleId="passphrase-keyboard-toggle",inputName="passphrase"\)/);
  assert.match(app, /function hodlRenderPassphraseKeyboard\(\)/);
  assert.match(app, /passphrase=Ne==="dice"\|\|Ne==="hex",enabled=passphrase\|\|privateKey/);
  assert.match(app, /hodlPassphraseKeyboardToggleMarkup\(\)/);
  assert.match(app, /hodlPrivateKeyKeyboardToggleMarkup\(\)/);
  assert.match(app, /id="private-key-input-help"[\s\S]*hodlPrivateKeyKeyboardToggleMarkup\(\)[\s\S]*<textarea id="key"/);
  assert.match(app, /privateKey\?"key":"pass",privateKey\?"private-keyboard-toggle":"passphrase-keyboard-toggle"/);
  assert.match(app, /hodlRenderPassphraseKeyboard\(\);return/);
  assert.match(template, /class="passphrase-input-row"[\s\S]*id="passphrase-keyboard-toggle-host" hidden[\s\S]*<input id="pass"/);
  assert.match(template, /id="master-fingerprint-preview"[\s\S]*id="passphrase-keyboard-host" hidden[\s\S]*id="key-settings"/);
  assert.match(app, /keyboard\.querySelectorAll\("\[data-seed-character-key\]"\)\.forEach\(button=>\{button\.disabled=!1\}\)/);
  assert.match(app, /function hodlBindSeedKeyboardDelete\(getInput,button\)/);
  assert.match(appWhitespace, /setTimeout\(\(\)=>\{holdTimer=null;repeated=true;remove\(\);if\(!button\.disabled\)repeatTimer=setInterval\(remove,69\)\},420\)/);
  assert.match(app, /\["pointerup","pointercancel","pointerleave","lostpointercapture"\]/);
  assert.match(appWhitespace, /if\(repeated\)\{event\.preventDefault\(\);repeated=false;return\}/);
  assert.match(app, /function hodlAutocompleteSeedInput\(input,event,completeExisting=!1\)/);
  assert.match(app, /toggle\.checked&&hodlAutocompleteSeedInput\(input,null,!0\)/);
  assert.match(app, /inputType:"insertReplacementText"/);
  assert.match(appWhitespace, /toggle\.checked;input\.focus\(\{preventScroll:true\}\)/);
  assert.match(app, /event\.relatedTarget\?\.closest\?\.\("#seed-keyboard,\.seed-autocomplete-toggle"\)/);
  assert.match(app, /class="seed-entry-tools">\$\{hodlSeedKeyboardToggleMarkup\(\)\}<label class="seed-autocomplete-toggle"/);
  assert.match(app, /id="seed-meta"[^>]*><\/p>\$\{hodlSeedKeyboardMarkup\(\)\}<div id="last-words"/);
  assert.match(appWhitespace, /hodlBindSeedKeyboard\(input,config\.words\);hodlBindKeyFields\(\)/);
  assert.match(app, /keyboard\.querySelectorAll\("\[data-seed-delete\]"\)\.forEach\(button=>hodlBindSeedKeyboardDelete\(\(\)=>activeInput,button\)\)/);
  assert.match(app, /modeButton\.disabled=!pass/);
  assert.match(app, /hodlSetSeedKeyboardLayout\(keyboard,modeButton,"lower"\)/);
  assert.match(app, /hodlApplySeedKeyboardKey\(activeInput,button\.dataset\.seedKey\|\|""\)/);
  assert.match(appWhitespace, /addEventListener\("pointerdown",event=>\{event\.preventDefault\(\);activeInput\.focus/);
  assert.match(app, /function hodlFilterSeed\(e\)\{[^}]*hodlLooksExtendedKey\(value\)\?value:value\.toLowerCase\(\)/);
  assert.match(css, /\.seed-entry-tools\s*\{[^}]*align-items: stretch[^}]*margin-top: var\(--space-component\)/s);
  assert.match(css, /\.passphrase-keyboard-tools \{[^}]*display: flex[^}]*margin-top: var\(--space-component\)/s);
  assert.match(css, /\.passphrase-input-row \{[^}]*display: flex[^}]*align-items: stretch[^}]*gap: var\(--space-control\)/s);
  assert.match(css, /#passphrase-field \.passphrase-input-row input \{[^}]*flex: 1 1 auto[^}]*margin-top: 0/s);
  assert.match(css, /\.passphrase-keyboard-toggle-host \.seed-keyboard-toggle \{ align-self: stretch; min-height: 0; height: auto; \}/);
  assert.match(css, /\.passphrase-keyboard-host \.seed-keyboard \{ margin-top: var\(--space-control\); margin-right: auto; margin-left: 0; \}/);
  assert.match(css, /\.seed-keyboard-toggle\s*\{[^}]*width: 44px[^}]*min-height: 44px[^}]*height: auto/s);
  assert.match(css, /\.seed-keyboard-toggle svg \{[^}]*width: 30px[^}]*height: 22px/s);
  assert.match(css, /\.seed-keyboard-icon-case \{[^}]*fill: none[^}]*stroke: currentColor/s);
  assert.match(css, /\.seed-keyboard\s*\{[^}]*gap: 4px[^}]*max-width: 640px[^}]*margin: var\(--space-control\) auto 0 0[^}]*padding: 7px 8px/s);
  assert.match(css, /--seed-key-size: calc\(10% - 2\.7px\)/);
  assert.match(css, /\.seed-keyboard-key\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.seed-keyboard-row \{ display: flex; justify-content: center;/);
  assert.match(css, /\.seed-keyboard-space-row \{ display: flex; justify-content: center; gap: 4px; \}/);
  assert.match(css, /\.seed-keyboard-mode:disabled \{[^}]*cursor: not-allowed[^}]*opacity: \.42/s);
  assert.match(css, /\.seed-keyboard-key:disabled,[\s\S]*?\.seed-keyboard-space:disabled \{[^}]*cursor: not-allowed[^}]*opacity: \.3/s);
});

test("multisig derivation settings follow the key inputs", () => {
  const fieldOrder = /id="msig-keys"[\s\S]*id="msig-key-order-status"[\s\S]*id="msig-hint"[\s\S]*id="msig-script-type"[\s\S]*id="msig-network"[\s\S]*id="msig-account"[\s\S]*id="msig-count"[\s\S]*id="msig-key-order"[\s\S]*id="msig-go"/;
  assert.match(template, fieldOrder);
  assert.match(app, fieldOrder);
});

test("key derivation and multisig use the accurate Script type label", () => {
  for (const markup of [template, appWhitespace]) {
    assert.match(markup, /id="script-type-field">Script type\s*<select/);
    assert.match(markup, /<label class="field">Script type\s*<select id="msig-script-type"[^>]*>/);
    assert.match(markup, /<option value="p2wsh" selected(?:="selected")?>Native SegWit (?:·|\\xB7) BIP48<\/option>/);
    assert.match(markup, /<option value="p2tr">Taproot (?:·|\\xB7) BIP86<\/option>/);
    assert.doesNotMatch(markup, /name="msig-script"|Matches BIP48 script type|Bare P2SH/);
    assert.doesNotMatch(markup, />Address type</);
  }
});

test("multisig script type and placeholders follow detected co-signer exports", () => {
  for (const markup of [template, appWhitespace]) {
    assert.match(markup, /option value="mixed" disabled data-custom-select-placeholder="true">Mixed · incompatible keys/);
    assert.match(markup, /id="msig-script-warning" role="status" hidden/);
    assert.match(markup, /id="msig-go"[^>]*aria-describedby="msig-script-warning"/);
  }
  assert.match(template, /placeholder="\[fingerprint\/48h\/0h\/0h\/2h\]Zpub…"/);
  assert.match(app, /function hodlMultisigKeyPlaceholder\(kind,network,legacyStandard="bip45"\)/);
  assert.match(appWhitespace, /kind==="p2sh"\)return`\[fingerprint\/45h\]\$\{testnet\?"tpub":"xpub"\}(?:…|\\u2026)`/);
  assert.match(appWhitespace, /kind==="p2sh"&&legacyStandard==="bip87"\)return`\[fingerprint\/87h\/\$\{coin\}\/0h\]\$\{testnet\?"tpub":"xpub"\}(?:…|\\u2026)`/);
  assert.match(app, /testnet\?"Upub":"Ypub"/);
  assert.match(app, /testnet\?"Vpub":"Zpub"/);
  assert.match(appWhitespace, /kind==="p2tr"\)return`\[fingerprint\/86h\/\$\{coin\}\/0h\]\$\{testnet\?"tpub":"xpub"\}(?:…|\\u2026)`/);
  assert.match(app, /if\(steps\[0\]!=="86h"\)return"BIP86 origin must start at 86h."/);
  assert.match(app, /Taproot BIP86 requires a depth-3 account key at m\/86h\/coinh\/accounth/);
  assert.doesNotMatch(app, /or BIP48 script 3h/);
  assert.doesNotMatch(app, /if\(steps\[3\]==="3h"\)return"p2tr"/);
  assert.match(app, /summary\.legacyMixed\?"Legacy co-signer exports mix BIP45 and BIP87/);
  assert.match(app, /summary\.legacyScriptConflict\?"BIP87 account keys are script-agnostic/);
  assert.match(app, /BIP87 keys do not encode a script type\. Select Legacy P2SH/);
  assert.match(app, /button\.disabled=!ready/);
  assert.match(app, /if\(kind==="mixed"\)throw new Error\("Co-signer keys indicate different script types/);
});

test("key derivation shows the relevant paste-ready multisig co-signer exports", () => {
  assert.match(app, /function hodlBuildMultisigCosignerExports\(root,network,accountIndex,masterFingerprint\)/);
  assert.match(appWhitespace, /accountId:"bip44",kind:"p2sh",standard:"bip45",label:"Legacy (?:·|\\xB7) BIP45 (?:·|\\xB7) No account",family:"x",accountPath:"m\/45'",originPath:"45h"/);
  assert.match(appWhitespace, /accountId:"bip44",kind:"p2sh",standard:"bip87",label:`Legacy (?:·|\\xB7) BIP87 (?:·|\\xB7) Account \$\{accountIndex\}`,family:"x",accountPath:`m\/87'\/\$\{coinType\}'\/\$\{accountIndex\}'`,originPath:`87h\/\$\{coinType\}h\/\$\{accountIndex\}h`/);
  assert.match(appWhitespace, /accountId:"bip49",kind:"p2sh-p2wsh",label:"Nested SegWit (?:·|\\xB7) BIP48",family:"y",scriptIndex:1/);
  assert.match(appWhitespace, /accountId:"bip84",kind:"p2wsh",label:"Native SegWit (?:·|\\xB7) BIP48",family:"z",scriptIndex:2/);
  assert.match(appWhitespace, /accountId:"bip86",kind:"p2tr",label:"Taproot (?:·|\\xB7) BIP86",family:"x"/);
  assert.match(app, /accountPath=definition\.accountPath\|\|`m\/48'\/\$\{coinType\}'\/\$\{accountIndex\}'\/\$\{definition\.scriptIndex\}'`/);
  assert.match(app, /value:`\[\$\{masterFingerprint\}\/\$\{originPath\}\]\$\{publicKey\}`/);
  assert.match(app, /multisigCosignerExports:root\.privateKey\?hodlBuildMultisigCosignerExports\(root,network,accountIndex,masterFingerprint\):\[\]/);
  assert.match(app, /function hodlRenderMultisigCosignerExport\(exports,accountId\)/);
  assert.match(app, /exports\.filter\(candidate=>candidate\.accountId===accountId\)/);
  assert.match(appWhitespace, /items\.map\(item=>ye\(`Multisig co-signer \$\{item\.prefix\} · \$\{item\.label\}`,item\.value\)\)\.join\(""\)/);
  assert.match(app, /\$\{ye\(`Account \$\{account\.primaryPublicLabel\}`,account\.primaryPublic\)\}\s*\$\{hodlRenderMultisigCosignerExport\(re\.multisigCosignerExports,account\.def\.id\)\}/);
  assert.doesNotMatch(`${app}\n${css}`, /account-multisig-exports/);
  assert.match(app, /Legacy P2SH requires the depth-1 BIP45 purpose key at m\/45h/);
  assert.match(app, /receiveSuffix=bip45\?"\/0\/0\/\*":"\/0\/\*"/);
  assert.match(app, /Legacy BIP45 addresses use co-signer branch 0/);
  assert.match(app, /Legacy P2SH uses the selected BIP87 account paths/);
  assert.match(app, /function hodlMsigInnerDescriptor\(kind,m,inner,sorted\)/);
  assert.match(app, /function hodlMsigPolicyOp\(kind,sorted\)/);
  assert.match(app, /kind==="p2tr"\?sorted\?"sortedmulti_a":"multi_a":sorted\?"sortedmulti":"multi"/);
  assert.match(app, /hodlMsigAddr\(receivePublicKeys,m,network,kind,sorted\)/);
  assert.match(app, /function hodlTaprootNumsKey\(\)/);
  assert.match(app, /function hodlXOnlyPubkey\(pubkey\)/);
});

test("derived wallets offer an address match check", () => {
  assert.match(app, /function hodlAddressMatchMarkup\(\)/);
  assert.match(app, /id="address-match"/);
  assert.match(app, /id="address-match-status"/);
  assert.match(app, /address-match-field">Check an address/);
  assert.match(app, /Paste a receive or change address shown by another wallet/);
  assert.match(app, /even if the index is beyond the table above/);
  assert.doesNotMatch(app, /Address from Sparrow/);
  // esbuild's output normalizes numeric literals (1000 -> 1e3) in every
  // transform, so check this literal against the untransformed source.
  assert.match(appSource, /var hodlAddressSearchLimit\s*=\s*1000/);
  assert.match(app, /function hodlMatchHdAddressBeyond\(address,account,start\)/);
  assert.match(app, /function hodlMatchMsigAddressBeyond\(address,start\)/);
  assert.match(app, /hodlAddressTable\(account\.change,"Change addresses",hasPrivate\)\}\s*\$\{hodlAddressMatchMarkup\(\)/);
  assert.match(app, /hodlAddressTable\(re\.change,"Multisig change addresses"\)\}\s*\$\{hodlAddressMatchMarkup\(\)/);
  assert.match(css, /\.address-match-field/);
});

test("multisig key order is sorted by default and listed order is advanced", () => {
  for (const markup of [template, app]) {
    assert.match(markup, /id="msig-advanced"/);
    assert.match(markup, /id="msig-key-order"/);
    assert.match(markup, /<option value="sorted" selected(?:="selected")?>Sorted (?:·|\\xB7) sortedmulti<\/option>/);
    assert.match(markup, /<option value="listed">As listed (?:·|\\xB7) multi<\/option>/);
    assert.match(markup, /id="msig-key-order-status" hidden/);
  }
  assert.match(css, /\.msig-advanced summary/);
  assert.match(css, /\.msig-key-move-btn/);
  assert.match(app, /function hodlMsigKeysSorted\(\)/);
  assert.match(app, /function hodlBindMsigKeyReorder\(box\)/);
  assert.match(app, /function hodlMoveMsigKeyRow\(row,offset\)/);
  assert.match(app, /textContent="Move up"/);
  assert.match(app, /textContent="Move down"/);
  assert.match(app, /function hodlMsigScriptOrder\(keyTokens\)/);
  assert.match(app, /id="multisig-order-heading">Script key order/);
  assert.match(app, /keyOrder:"sorted"/);
  assert.match(app, /notes\.push\("This wallet uses "/);
});

test("Legacy multisig defaults to BIP45 and offers BIP87 accounts only for Legacy", () => {
  for (const markup of [template, app]) {
    assert.match(markup, /id="msig-legacy-account-toggle" hidden/);
    assert.match(markup, /id="msig-legacy-bip87" type="checkbox"/);
    assert.match(markup, />Use standardized BIP87 accounts</);
    assert.match(markup, /m\/87h\/coinh\/accounth/);
  }
  assert.match(css, /\.msig-legacy-account-toggle\[hidden\] \{ display: none !important; \}/);
  assert.match(app, /legacy=hodlScriptKind\(\)==="p2sh"/);
  assert.match(appSource, /if \(toggle\) toggle\.hidden = !legacy/);
  assert.match(appWhitespace, /checkbox\?\.checked\?"Legacy · BIP87":"Legacy · BIP45"/);
  assert.match(app, /legacyBip87:!1/);
  assert.match(app, /scriptStandard:kind==="p2tr"\?"bip86":kind==="p2sh"\?legacyStandard:"bip48"/);
  assert.match(app, /legacyScriptConflict=standards\.includes\("bip87"\)&&summary\.kinds\.some\(kind=>kind!=="p2sh"\)/);
});

test("account results do not repeat derivation settings shown above", () => {
  assert.doesNotMatch(app, /account-summary-grid|function hodlAccountSummaryItem/);
  assert.doesNotMatch(css, /\.account-summary-grid/);
});

test("multisig account is displayed as a disabled value derived from key origins", () => {
  for (const markup of [template, app]) {
    assert.match(markup, /<input id="msig-account" type="text" value="" placeholder="Derived from keys" disabled/);
    assert.match(markup, /id="msig-account-warning" role="status" hidden/);
  }
  assert.match(app, /function hodlUpdateMsigAccount\(\)/);
  assert.match(app, /field\.value=summary\.mixed\?"Mixed"/);
  assert.match(app, /account:accountSummary\.account/);
  assert.match(app, /accountMixed:accountSummary\.mixed/);
});

test("multisig threshold labels describe signatures and keys", () => {
  for (const markup of [template, app]) {
    assert.match(markup, />Signatures needed to spend \(m\)/);
    assert.match(markup, />Total signing keys \(n\)/);
    assert.doesNotMatch(markup, /People \/ devices \(n\)/);
    assert.match(markup, /id="msig-m-number" type="number" min="1" max="15"[^>]*value="2"/);
    assert.match(markup, /id="msig-n-number" type="number" min="1" max="15"[^>]*value="3"/);
    assert.match(markup, /id="msig-m" type="range" min="1" max="15"[^>]*value="2"/);
    assert.match(markup, /id="msig-n" type="range" min="1" max="15"[^>]*value="3"/);
    assert.doesNotMatch(markup, /msig-threshold-ratio|msig-[mn]-output/);
    assert.doesNotMatch(markup, /<select id="msig-[mn]"/);
    assert.ok(markup.indexOf('class="msig-threshold-labels"') < markup.indexOf('<fieldset class="msig-threshold-control"'));
  }
  assert.match(css, /\.msig-threshold-number\s*\{[^}]*appearance: textfield[^}]*text-align: center/s);
  assert.match(css, /\.msig-threshold-labels label\s*\{[^}]*flex-direction: column[^}]*justify-content: flex-end;/s);
  assert.match(css, /\.msig-threshold-track span\s*\{[^}]*background: var\(--selection-accent\)/s);
  assert.match(css, /\.msig-threshold-thumb\s*\{[^}]*background: linear-gradient\(#858585, #5f5f5f\)/s);
  assert.match(css, /--msig-slider-inset: 14px/);
  assert.match(css, /\.msig-threshold-control\s*\{[^}]*margin: var\(--space-control\) 0 0/s);
  assert.match(css, /\.msig-threshold-labels\s*\{[^}]*margin: var\(--space-section\) 18px 0/s);
  assert.match(css, /\.msig-threshold-slider\s*\{[^}]*margin: 0 var\(--msig-slider-inset\)/s);
  assert.match(css, /\.msig-threshold-ticks\s*\{[^}]*margin: 0 var\(--msig-slider-inset\)/s);
  assert.match(css, /\.msig-threshold-ticks span\s*\{[^}]*left: var\(--msig-tick-position\)[^}]*transform: translateX\(-50%\)/s);
  assert.match(app, /hodlMsigSliderBaseMax=9,hodlMsigSliderLimit=15/);
  assert.match(app, /drag\.handle=delta<0\?"m":"n"/);
  assert.match(app, /visibleMax=Math\.max\(hodlMsigSliderBaseMax,n\)/);
  assert.match(app, /mNumber\.max=String\(hodlMsigSliderLimit\)/);
  assert.match(app, /nNumber\.min="1"/);
  assert.match(app, /n=hodlClampMsigThreshold\(nValue,1,hodlMsigSliderLimit\)/);
  assert.match(app, /m>=1&&n>=1&&m<=n&&n<=15/);
  assert.match(appWhitespace, /if\(moveOther\)\{if\(changed==="m"\)n=Math\.max\(n,m\);else if\(changed==="n"\)m=Math\.min\(m,n\)\}/);
  assert.match(app, /setActive=\(handle,value\)=>\{.*hodlChangeMsigThreshold\(handle,value,!0\)\}/);
  assert.match(app, /mInput\.addEventListener\("input",\(\)=>hodlChangeMsigThreshold\("m",mInput\.value,!0\)\)/);
  assert.match(app, /nInput\.addEventListener\("input",\(\)=>hodlChangeMsigThreshold\("n",nInput\.value,!0\)\)/);
  assert.match(app, /hodlChangeMsigThreshold\(handle,raw,!0\)/);
  assert.match(appWhitespace, /bindNumber\(mNumber,"m"\);bindNumber\(nNumber,"n"\)/);
  assert.match(app, /tick\.style\.setProperty\("--msig-tick-position",\(value-1\)\/span\*100\+"%"\)/);
});

test("multisig consistently uses derive for its heading and action", () => {
  for (const markup of [template, app]) {
    assert.match(markup, /<h2>Derive a multisig wallet<\/h2>/);
    assert.match(markup, /id="msig-go"[^>]*>Derive Multisig<\/button>/);
    assert.match(markup, /id="msig-go"[^>]*disabled[^>]*aria-disabled="true"/);
    assert.doesNotMatch(markup, /Create a multisig wallet|Build Multisig/);
  }
  assert.match(app, /function hodlValidatedMsigInputs\(\)/);
  assert.match(appSource, /hodlValidatedMsigInputs\(\);\s*ready = true/);
  assert.match(app, /button\.disabled=!ready/);
  assert.match(app, /let\{network,count,n,m,kind,legacyStandard,nodes,xpubs,keyTokens,accountSummary,accountWarning\}=hodlValidatedMsigInputs\(\)/);
});

test("seed-entry tools keep a square keyboard toggle and a block note on narrow screens", () => {
  assert.match(
    css,
    /@media \(max-width: 520px\)[\s\S]*\.seed-entry-tools \{ align-items: flex-start; \}[\s\S]*\.seed-autocomplete-note \{ display: block; margin-top: 2px; \}/,
  );
});

test("multisig heading spans beneath the delete action on narrow screens", () => {
  assert.match(
    css,
    /@media \(max-width: 520px\)[\s\S]*\.key-panel-head \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto; \}[\s\S]*\.key-panel-head > div:first-child \{ grid-column: 1 \/ -1; grid-row: 2; width: 100%; \}[\s\S]*\.key-panel-head > \.delete-key \{ grid-column: 2; grid-row: 1; justify-self: end; \}/,
  );
});

test("private alternate account exports are visible without an accordion", () => {
  assert.match(appWhitespace, /if\(includePrivate\)return`<div class="wallet-advanced">\$\{privateExport\}<\/div>`/);
  assert.doesNotMatch(app, /Advanced private export/);
});

test("top banners share one consistent gap", () => {
  assert.match(
    css,
    /\.beta-warning, \.online-warning, \.network-warning\s*\{[^}]*margin: 0 0 12px;/s,
  );
  // The title block that used to follow them is gone, so the banners' 12px now
  // collapses into the leading card's own 16px.
  assert.match(css, /\.card \{[^}]*margin: 16px 0; \}/);
});

test("header theme toggle cycles dark, light, and OS themes without a flash", () => {
  for (const markup of [template, app]) {
    assert.match(markup, /class="seed-keyboard-toggle theme-toggle header-button" id="theme-toggle" data-theme-mode="dark" aria-label="Theme: dark\. Switch to light"/);
  }
  assert.match(template, /<script>\(function\(\)\{try\{var m=localStorage\.getItem\("entropylab-theme"\)/);
  assert.match(app, /var hodlThemeModes=\["dark","light","system"\],hodlThemeStorageKey="entropylab-theme"/);
  assert.match(app, /function hodlApplyTheme\(mode\)/);
  assert.match(appSource, /hodlInitSecretFieldAutoClear\(\);\s*hodlInitTheme\(\);/);
  assert.match(css, /:root\[data-theme="light"\] \{\s*color-scheme: light;/);
  assert.match(css, /@media print \{\s*:root, :root\[data-theme\] \{/);
  assert.match(css, /\.download-controls \.theme-toggle \{ flex: 0 0 40px; width: 40px; align-self: center; \}/);
});

test("the site header is fixed, carries the logo, and holds the version, download, and theme controls", () => {
  for (const markup of [template, app]) {
    // The header precedes the page wrapper, so the banners scroll beneath it.
    const header = markup.indexOf('<div class="site-header no-print">');
    const wrapper = markup.indexOf('<div class="wrap">');
    assert.ok(header >= 0, "the fixed site header is missing");
    assert.ok(header < wrapper, "the site header must come before the page wrapper");
    assert.match(markup, /<span class="site-logo" aria-hidden="true"><\/span>\s*<span class="site-title">EntropyLab<\/span>\s*<span class="site-version">/);
    for (const control of [/class="site-version-number">v\{\{VERSION\}\}</, /class="btn secondary download-html header-button"/, /class="btn secondary github-repo-link header-button"/, /id="theme-toggle"/]) {
      assert.match(markup.slice(header, wrapper), control, `the fixed header is missing ${control}`);
    }
    // The in-flow title block folded into the marketing card, so the wrapper
    // opens on that card and carries no second header of its own.
    const live = markup.slice(wrapper).replace(/<!--[\s\S]*?-->/g, "");
    // The static template opens with a no-JS notice; the runtime one has no
    // need of it. Either way the card is the first thing the page renders.
    assert.match(live, /<div class="wrap">\s*(?:<noscript>[\s\S]*?<\/noscript>\s*)?<section class="card">/);
    assert.doesNotMatch(markup.slice(wrapper), /<header>|download-controls/);
  }
  assert.doesNotMatch(css, /^header (\{|h1)/m);
  assert.match(css, /\.site-header \{\s*position: fixed; top: 0; left: 0; right: 0;/);
  assert.match(css, /\.site-header-inner \{[^}]*height: var\(--site-header-height\)/s);
  // The wordmark shares the h1's display face rather than the control sans.
  // The wordmark runs to both ends of the ramp rather than tracking --fg, so
  // each theme has to name its own end.
  assert.match(css, /\.site-title \{[^}]*font-family: var\(--display\);[^}]*color: #ffffff;/);
  assert.match(css, /:root\[data-theme="light"\] \.site-title \{ color: #000000; \}/);
  assert.match(css, /@media \(max-width: 719px\) \{[\s\S]*?\.site-title \{ font-size: 19px; \}/);
  assert.match(css, /\.site-version \{[^}]*flex: 0 0 auto; display: inline-flex; align-items: baseline; gap: 6px;/s);
  // The version echoes the kicker's accent and weight, but stays far below its
  // display tracking, which reads as spread-out in a row of controls.
  assert.match(css, /\.site-version \{[^}]*text-transform: uppercase; color: var\(--accent\); font-weight: 600;/s);
  const tracking = (rule) => Number(css.match(new RegExp(`${rule} \\{[^}]*letter-spacing: ([\\d.]+)em`, "s"))?.[1]);
  assert.ok(tracking("\\.site-version") < tracking("\\.kicker") / 2, "the header version kept the kicker's display tracking");
  // The uppercase stops at the version string, so its "v" prefix stays lower
  // case in the label the build stamps.
  assert.match(css, /\.site-version-number \{[^}]*text-transform: none;/);
  // online.js never fetches or rewrites the version label: the build-stamped
  // markup is the only source, and the app makes no runtime requests.
  assert.doesNotMatch(online, /fetch\s*\(|site-version|innerHTML/);
  // Content clears the fixed header on screen, and reclaims the space in print.
  assert.match(css, /\.wrap \{ max-width: 1000px; margin: 0 auto; padding: calc\(var\(--site-header-height\) \+ 20px\) 16px 64px; \}/);
  assert.match(css, /@media print \{[\s\S]*?\.wrap \{ padding-top: 20px; \}/);
  assert.match(css, /html \{[^}]*scroll-padding-top: calc\(var\(--site-header-height\) \+ 12px\)/);
  // Every header control is one height, and the bar is sized to match it.
  assert.match(css, /\.header-button \{ min-height: 40px; font-size: 14px; \}/);
  assert.match(css, /--site-header-height: 52px;/);
});

test("the header logo is inlined for both themes and never fetched from assets", () => {
  assert.match(css, /\.site-logo \{[^}]*background: url\("data:image\/png;base64,\/\*@@LOGO_DARK@@\*\/"\) center \/ contain no-repeat;/s);
  assert.match(css, /:root\[data-theme="light"\] \.site-logo \{ background-image: url\("data:image\/png;base64,\/\*@@LOGO_LIGHT@@\*\/"\); \}/);
  // No markup copy may point the logo at the hosted assets directory.
  for (const markup of [template, app]) {
    assert.doesNotMatch(markup, /online-brand-mark/);
    assert.doesNotMatch(markup, /assets\/entropylab_(dark|light)\.png/);
  }
});

test("the seam into the tool is wider than the page's other major seams", () => {
  assert.match(css, /--space-major: 32px;/);
  assert.match(css, /--space-lede: 48px;/);
  // The pitch-to-tool seam is the page's widest; the closing Sources card keeps
  // the ordinary major one. Both collapse with a neighbouring card's 16px, so
  // the larger value wins rather than the two adding up.
  assert.match(css, /#workspace \{ margin: var\(--space-lede\) 0 4px; \}/);
  assert.match(css, /\.sources \{ margin-top: var\(--space-major\); \}/);
  for (const markup of [template, app]) {
    assert.match(markup, /<section class="card muted sources">/);
  }
});

test("the marketing card states its pitch as a list rather than a paragraph", () => {
  for (const markup of [template, app]) {
    const list = markup.match(/<ul class="pitch-list muted">[\s\S]*?<\/ul>/)?.[0];
    assert.ok(list, "the pitch list is missing");
    assert.equal((list.match(/<li>/g) || []).length, 4);
    assert.match(list, /<li>Save this air-gapped bitcoin calculator to a removable drive/);
    assert.match(list, /<li>Keep your private keys offline\.<\/li>/);
    // The prose it replaced is gone, not merely hidden.
    assert.doesNotMatch(markup, /A signing device is only required when you spend/);
  }
  // The list stands in for a paragraph, so it carries the space a paragraph
  // would have above it and leaves the card's padding to close it out.
  assert.match(css, /\.pitch-list \{ display: grid; gap: 7px; margin: var\(--space-component\) 0 0; padding-left: 20px; \}/);
});

test("the favicon ships inside the document instead of the assets directory", () => {
  assert.match(
    template,
    /<title>EntropyLab<\/title><link rel="icon" type="image\/png" sizes="64x64" href="data:image\/png;base64,\/\*@@FAVICON@@\*\/">/,
  );
  // The inlined icon covers hosted and offline alike, so online.js no longer
  // layers a same-origin link over it.
  assert.doesNotMatch(online, /online-favicon|assets\/favicon\.png/);
});

test("narrow screens keep the fixed header on one row by hiding control labels", () => {
  assert.match(css, /@media \(max-width: 719px\) \{[\s\S]*?\.control-label \{ display: none; \}/);
  // Icon-only buttons match the theme toggle's 40px square.
  assert.match(css, /@media \(max-width: 719px\) \{[\s\S]*?\.download-controls \.btn:is\(\.download-html, \.github-repo-link\) \{ flex: 0 0 40px; width: 40px; padding: 0; justify-content: center; \}/);
  for (const markup of [template, app]) {
    // The version reads as plain text beside the logo; "v0.1.3" already says
    // what it is, so it never carries a control label.
    assert.doesNotMatch(markup, /version-picker|version-select|<span class="control-label">Version<\/span>/);
    // The glyph precedes the label at every width and stands alone once the
    // labels collapse, so it is never hidden.
    assert.match(markup, /<svg class="download-mark"[^>]*><path d="M12 3v12M7 11l5 5 5-5M5 21h14"\/><\/svg><span class="control-label">Download<\/span><\/a>/);
    assert.match(css, /\.download-mark \{ display: block; flex: 0 0 auto; \}/);
    assert.doesNotMatch(css, /@media \(max-width: 719px\) \{[\s\S]*?\.download-mark \{/);
    // One rule owns the icon-to-label gap for both buttons, so they cannot drift.
    assert.match(css, /\.download-controls > a \{ display: inline-flex; align-items: center; gap: 6px;/);
    assert.doesNotMatch(css, /\.download-controls \.github-repo-link \{ display: inline-flex/);
    // Centring the label's em box leaves its caps a pixel below the icon's
    // centre line, so the label carries an optical nudge back up.
    assert.match(css, /\.control-label \{ position: relative; top: -1px; \}/);
    assert.match(markup, /<span class="control-label">GitHub<\/span><\/a>/);
    // Each accessible name still contains its visible label (WCAG 2.5.3).
    assert.match(markup, /class="btn secondary download-html header-button"[^>]*aria-label="Download EntropyLab"/);
    // The "(Latest)" half of the version is the one thing narrow bars drop.
    assert.match(css, /@media \(max-width: 719px\) \{[\s\S]*?\.site-version-tag \{ display: none; \}/);
    assert.match(markup, /class="btn secondary github-repo-link header-button"[^>]*aria-label="View the EntropyLab GitHub repository in a new tab"/);
  }
});

test("PSBT amounts and fees are labeled as unverified claims", () => {
  assert.match(app, /BTC claimed/);
  assert.match(app, /Unverified fee \(PSBT witness UTXO claims\)/);
  assert.match(app, /Input amounts and any fee are unverified PSBT claims/);
  assert.doesNotMatch(app, /Fee \(from PSBT fields\)/);
});
