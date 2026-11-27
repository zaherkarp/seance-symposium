// Regression tests for the repoUrl command-injection fix in POST /api/evaluate.
//
// What these prove:
//   1. Malicious repoUrl values (shell metacharacters, a leading "-", non-https, other hosts)
//      are rejected with HTTP 400.
//   2. When they are rejected, no external command runs. We prove this two ways:
//      a. The original exploit payload tries to `touch` a marker file; the marker must not exist.
//      b. A fake `git` (and fake `sh`) is put first on PATH that records every invocation; it
//         must never be called for a rejected request.
//   3. For a valid URL, git is invoked directly (no shell) with "--" before the URL, and the URL
//      reaches git as one canonical argument.
//
// Runner: Node's built-in test runner (node:test), so no new dependency is needed.
// The fake-binary checks rely on POSIX shell scripts, so they are skipped on Windows.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const isWindows = process.platform === "win32";

// --- Test fixture: an isolated scratch dir plus fake binaries on PATH -----------------------
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "seance-sec-test-"));
const fakeBin = path.join(scratch, "bin");
const invocationLog = path.join(scratch, "invocations.log"); // every fake git/sh call lands here
const markerFile = path.join(scratch, "PWNED_MARKER"); // the exploit payload tries to create this

// A stand-in binary that appends its name and each argument (one per line) to the log, then
// exits 0. Used for `git` (so a real clone never happens) and `sh` (so any accidental shell use
// is caught even though execFileSync should never spawn one).
function writeFakeBinary(name) {
  const script = `#!/bin/sh\n{ echo "CALL ${name}"; for a in "$@"; do echo "ARG $a"; done; } >> "${invocationLog}"\nexit 0\n`;
  const p = path.join(fakeBin, name);
  fs.writeFileSync(p, script, { mode: 0o755 });
}

let server;
let baseUrl;
let mod;

before(async () => {
  fs.mkdirSync(fakeBin);
  if (!isWindows) {
    writeFakeBinary("git");
    // Note: the fake `sh` itself is run via the real /bin/sh through its shebang, so this only
    // catches lookups of "sh" via PATH; the marker-file check covers /bin/sh directly.
    writeFakeBinary("sh");
    process.env.PATH = `${fakeBin}${path.delimiter}${process.env.PATH}`;
  }
  // Mirror the audit's reproduction: the only precondition for the old exploit was that some
  // API key was set. Any value works because the shell ran before any API call.
  process.env.ANTHROPIC_API_KEY = "test-dummy-key";

  // Import after env is set; server.js reads env at module load. It does not auto-listen when
  // imported (isMain guard), so we listen on an ephemeral loopback port ourselves.
  mod = await import("../server.js");
  await new Promise((resolve) => {
    server = mod.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function readInvocations() {
  return fs.existsSync(invocationLog) ? fs.readFileSync(invocationLog, "utf-8") : "";
}

async function postEvaluate(body) {
  const res = await fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

// --- Endpoint tests: bad input is refused with 400 and nothing runs ------------------------

// Each entry is a payload that must be rejected. The first is the exact shape used in the
// Nov 2026 audit reproduction, pointed at our marker file.
const maliciousRepoUrls = [
  `https://example.invalid/x.git; touch ${markerFile} #`, // shell command separator
  `https://github.com/a/b.git; touch ${markerFile}`, // allowed host, still has ";"
  `https://github.com/a/b$(touch ${markerFile})`, // command substitution
  "https://github.com/a/b`id`", // backtick substitution
  "https://github.com/a/b|id", // pipe
  "https://github.com/a/b&&id", // AND list
  "https://github.com/a/b\nid", // newline as command separator
  "--upload-pack=touch /tmp/x", // leading "-": git option injection
  "-c core.sshCommand=id", // leading "-"
  "ext::sh -c id", // git's command-running transport
  "file:///etc", // local file transport
  "ssh://github.com/a/b", // non-https
  "http://github.com/a/b", // plain http
  "https://evil.example.com/a/b", // host not allowlisted
  "https://github.com.evil.example/a/b", // look-alike host
  "https://user:token@github.com/a/b", // embedded credentials
  "https://github.com:8443/a/b", // explicit port
  "https://github.com/a", // missing repo segment
  "https://github.com/a/b/c", // extra path segment
  "https://github.com/../b", // relative path component
];

for (const repoUrl of maliciousRepoUrls) {
  test(`POST /api/evaluate rejects ${JSON.stringify(repoUrl)} with 400 and runs nothing`, async () => {
    fs.rmSync(invocationLog, { force: true });
    // repoDepth "full" was the path that reached the shell in the original bug.
    const { status, json } = await postEvaluate({ repoUrl, repoDepth: "full" });
    assert.equal(status, 400);
    assert.match(json.error, /Invalid repoUrl/);
    assert.equal(fs.existsSync(markerFile), false, "exploit payload must not create the marker file");
    if (!isWindows) {
      assert.equal(readInvocations(), "", "no git or sh process may be started for a rejected URL");
    }
  });
}

test("POST /api/evaluate rejects a non-string repoUrl with 400", async () => {
  const { status } = await postEvaluate({ repoUrl: ["https://github.com/a/b"], repoDepth: "full" });
  assert.equal(status, 400);
});

// --- Validator unit tests: legitimate URLs still work ---------------------------------------

test("validateRepoUrl accepts normal GitHub URLs and canonicalises them", () => {
  const cases = {
    "https://github.com/zaherkarp/seance-symposium": "https://github.com/zaherkarp/seance-symposium.git",
    "https://github.com/zaherkarp/seance-symposium.git": "https://github.com/zaherkarp/seance-symposium.git",
    "https://github.com/zaherkarp/seance-symposium/": "https://github.com/zaherkarp/seance-symposium.git",
    "https://www.github.com/some-org/repo_name.v2": "https://github.com/some-org/repo_name.v2.git",
    "  https://github.com/a/b  ": "https://github.com/a/b.git", // surrounding whitespace trimmed
  };
  for (const [input, expected] of Object.entries(cases)) {
    const result = mod.validateRepoUrl(input);
    assert.equal(result.ok, true, `expected ${input} to be accepted`);
    assert.equal(result.url, expected);
  }
});

// --- cloneRepository: git is called directly with "--" -------------------------------------

test("cloneRepository runs git without a shell and puts -- before the URL", { skip: isWindows }, async () => {
  fs.rmSync(invocationLog, { force: true });
  // The fake git exits 0 without creating anything, so the analysis just finds no files.
  await mod.cloneRepository("https://github.com/zaherkarp/seance-symposium");
  const lines = readInvocations().trim().split("\n");
  // Exactly one process: git. If a shell had been used we would see "CALL sh" or nothing.
  assert.equal(lines[0], "CALL git");
  assert.deepEqual(lines.slice(1, 6), [
    "ARG clone",
    "ARG --depth",
    "ARG 1",
    "ARG --",
    "ARG https://github.com/zaherkarp/seance-symposium.git",
  ]);
  assert.match(lines[6], /^ARG .*repo-/, "last argument is the server-generated temp dir");
  assert.equal(lines.length, 7, "no other processes or arguments");
});

test("cloneRepository refuses an unvalidated malicious URL even if called directly", async () => {
  fs.rmSync(invocationLog, { force: true });
  await assert.rejects(
    mod.cloneRepository(`https://example.invalid/x.git; touch ${markerFile} #`),
    /Refusing to clone/
  );
  assert.equal(fs.existsSync(markerFile), false);
  if (!isWindows) assert.equal(readInvocations(), "");
});
