// Regression tests for the markdown render path in public/index.html.
//
// Background: synthesized presentation sections are model output, and the model reads
// untrusted text (the reviewed repo's README). They are rendered with marked.parse into
// dangerouslySetInnerHTML. marked does not strip raw HTML, so without a sanitizer an
// echoed <img onerror=...> runs script in the page. These tests pin the fix in place.
//
// The static tests need no dependencies (node:test only). The behavioral test runs only
// when jsdom can be imported, because jsdom is not a project dependency and node_modules
// is committed; install it temporarily (npm i --no-save jsdom) to run it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(path.join(root, "public/index.html"), "utf8");

// Expected hashes of the vendored files. Must match public/vendor/README.md.
const VENDORED = {
  "public/vendor/marked-13.0.3.min.js": "5adea7d8ee41a700fccc14bb9d503104f0470cc17a84ad3e167d3f5251eae0da",
  "public/vendor/purify-3.5.0.min.js": "f69a46022ab1f53e969c8ebbca98172c8995785a9b3be72ea4a12d25b1a1bf67",
};

// Pull the renderMarkdown and escapeHtml function sources out of the inline Babel script,
// so the behavioral test exercises the real code rather than a copy.
function extractFunction(name) {
  const start = indexHtml.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found in index.html`);
  // Walk braces from the first "{" to its match. The functions contain no braces inside
  // strings that would unbalance this simple scan.
  let i = indexHtml.indexOf("{", start);
  let depth = 0;
  for (; i < indexHtml.length; i += 1) {
    if (indexHtml[i] === "{") depth += 1;
    if (indexHtml[i] === "}") { depth -= 1; if (depth === 0) break; }
  }
  return indexHtml.slice(start, i + 1);
}

test("marked is not loaded from a floating CDN URL", () => {
  assert.doesNotMatch(indexHtml, /unpkg\.com\/marked/);
  assert.doesNotMatch(indexHtml, /<script[^>]+marked[^>]+https?:/);
});

test("vendored marked and DOMPurify load before the app script", () => {
  const marked = indexHtml.indexOf('src="/vendor/marked-13.0.3.min.js"');
  const purify = indexHtml.indexOf('src="/vendor/purify-3.5.0.min.js"');
  const app = indexHtml.indexOf('<script type="text/babel">');
  assert.ok(marked > 0 && purify > 0 && app > 0);
  assert.ok(marked < app && purify < app);
});

test("vendored files match their pinned SHA-256", () => {
  for (const [file, expected] of Object.entries(VENDORED)) {
    const actual = createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex");
    assert.equal(actual, expected, `${file} changed; update the hash only after reviewing it`);
  }
});

test("renderMarkdown sanitizes marked output", () => {
  assert.match(extractFunction("renderMarkdown"), /DOMPurify\.sanitize\(\s*marked\.parse\(/);
});

let JSDOM = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* optional; see header */ }

test("event handlers and javascript: links in model output are stripped",
  { skip: JSDOM ? false : "jsdom not installed (npm i --no-save jsdom to run)" }, () => {
    const dom = new JSDOM('<div id="root"></div>', { runScripts: "outside-only" });
    const { window } = dom;
    // Load the vendored UMD builds into the page window, as the <script> tags do.
    for (const file of Object.keys(VENDORED)) window.eval(readFileSync(path.join(root, file), "utf8"));
    window.eval(`${extractFunction("escapeHtml")}\n${extractFunction("renderMarkdown")}\nwindow.renderMarkdown = renderMarkdown;`);

    const payload = 'Text <img src="x" onerror="window.__xss = 1"> [link](javascript:alert(1)) <script>window.__xss = 2</script>';
    const container = window.document.getElementById("root");
    container.innerHTML = window.renderMarkdown(payload).__html;

    assert.equal(container.querySelector("[onerror]"), null, "onerror attribute survived");
    assert.equal(container.querySelector("script"), null, "<script> survived");
    for (const a of container.querySelectorAll("a")) assert.doesNotMatch(a.getAttribute("href") || "", /^javascript:/i);
    // Ordinary markdown still renders.
    container.innerHTML = window.renderMarkdown("**bold** and `code`").__html;
    assert.ok(container.querySelector("strong") && container.querySelector("code"));
  });

test("renderMarkdown fails closed when DOMPurify is missing",
  { skip: JSDOM ? false : "jsdom not installed (npm i --no-save jsdom to run)" }, () => {
    const dom = new JSDOM("", { runScripts: "outside-only" });
    const { window } = dom;
    window.eval(readFileSync(path.join(root, "public/vendor/marked-13.0.3.min.js"), "utf8"));
    window.eval(`${extractFunction("escapeHtml")}\n${extractFunction("renderMarkdown")}\nwindow.renderMarkdown = renderMarkdown;`);
    const html = window.renderMarkdown('<img src=x onerror="alert(1)">').__html;
    assert.equal(html, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
