# Improvement Plan: Local Engine, Expanded Roster, Offline Resilience

This document is the implementation plan for the next iteration of Seance Symposium. It covers three goals:

1. **More thinkers** — grow the critic roster from 22 to 39 personas, organized into antagonistic panels, without making runs more expensive by default.
2. **Decouple from the metered API** — replace the hardwired Anthropic SDK calls with a provider seam whose default engine is the **locally installed `claude` CLI**, so generation runs on the Claude subscription limits you already have instead of pay-per-token billing. No `ANTHROPIC_API_KEY` required.
3. **Local-first operation** — saved-run replay that works fully offline (including synthesis), vendored frontend libraries, local-directory design analysis, and graceful degradation instead of HTTP 500s.

CLI behavior referenced below was verified against `claude` CLI **v2.1.211**. File/line references are against the current `main`.

---

## 1. Motivation & current state

Today the app cannot start a review without a metered API key, and a single click can fire ~44 uncapped concurrent API calls. The coupling is concentrated in a handful of places:

| Coupling point | Location |
|---|---|
| Anthropic SDK client singleton, built at module load | `server.js:22-24` |
| Critic generation call (`max_tokens: 1500`) | `server.js:1025-1029` in `runReviewAgents` |
| Synthesis generation call (`max_tokens: 2500`) | `server.js:968-972` in `runGradStudent` |
| Unbounded `Promise.all` fan-outs (22 critics + 22 grad groups) | `server.js:1020`, `server.js:1002` |
| Hard-fail 500 guards when `ANTHROPIC_API_KEY` is unset | `server.js:1080-1084`, `server.js:1119-1121` |
| Fixture replay covers critics only — synthesis still hits the live API | `server.js:1117-1146` |
| SPA libraries loaded from unpkg CDN (no-internet = blank page) | `public/index.html:7-11` |
| Repo analysis requires GitHub API or `git clone` (network) | `server.js:443-529` |

There is also roster drift left over from the original 6-agent system: `package.json:4` still says "6 antagonistic design philosophies", `buildGradStudentPrompt` hardcodes six critic names (`server.js:914`), and a comment at `server.js:1061` refers to "the 6 review agents" — while the code registers 22.

The sections below are ordered by architecture, then content, then hardening. A phased rollout with verification steps is in §7.

---

## 2. The engine seam — new `engine.js`

Every model generation flows through one new module, `engine.js`. The two call sites keep receiving raw assistant text, so `parseAgentResponse` and `parsePresentationSections` are untouched.

### 2.1 Public API

```js
// engine.js
export function getEngine()            // memoized singleton, selected from env
export function createEngine(opts)     // { name?, spawnImpl?, env? } — injection point for tests
export class EngineUnavailableError extends Error {}   // .code = "ENGINE_UNAVAILABLE"

// Engine object shape:
// {
//   name: "claude-cli" | "api" | "fixture",
//   mode: "live" | "replay",
//   generate({ prompt, maxTokensHint, label, timeoutMs? }) -> Promise<string>,
//   healthCheck() -> Promise<{ ok, engine, detail, model }>
// }
```

### 2.2 Configuration

| Env var | Default | Meaning |
|---|---|---|
| `SEANCE_ENGINE` | `claude-cli` | Backend: `claude-cli` \| `api` \| `fixture` |
| `SEANCE_MODEL` | `sonnet` | Passed to `--model`. Set empty to use the CLI's own default; `opus` is a good choice for small panels |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` | Used only by the legacy `api` engine (back-compat) |
| `SEANCE_MAX_CONCURRENCY` | `4` | Global cap on in-flight generations (§3) |
| `SEANCE_GENERATE_TIMEOUT_MS` | `180000` | Per-generation kill timer |
| `SEANCE_GENERATE_RETRIES` | `1` | Extra attempts after a failure |
| `SEANCE_CLI_BIN` | `claude` | Override CLI path |
| `SEANCE_RUNS_DIR` | `<repo>/runs` | Saved-runs library location (§5) |

### 2.3 `claude-cli` backend (default)

Spawns the CLI in headless print mode, one process per generation, prompt via stdin (avoids argv length limits):

```js
import { spawn } from "child_process";
import os from "os";

const args = [
  "-p",
  "--output-format", "json",
  "--tools", "",                    // no tools => single-turn, no permission prompts
  "--no-session-persistence",       // no ~/.claude session files per persona call
  "--safe-mode",                    // no CLAUDE.md/skills/plugins/hooks/MCP; normal auth intact
  "--setting-sources", "",          // ignore user/project/local settings
  "--disable-slash-commands",
  "--system-prompt",
  "You are given a complete persona brief and task in the user message. Follow it exactly. Respond in plain text only. You have no tools.",
];
if (model) args.push("--model", model);   // SEANCE_MODEL, default "sonnet"

const child = spawn(cliBin, args, {
  cwd: os.tmpdir(),                 // neutral cwd: never ingest this repo's own context
  env: { ...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokensHint) },
  stdio: ["pipe", "pipe", "pipe"],
});
child.stdin.end(prompt);
```

**Result handling.** Collect stdout, `JSON.parse`, require `parsed.type === "result"` and `parsed.is_error === false`, return `parsed.result` (read defensively: `parsed.result ?? parsed.text`). When present, record `parsed.usage`, `parsed.total_cost_usd`, and the model into run metadata (§5a).

**Failure handling.** Nonzero exit, timeout (SIGKILL after `SEANCE_GENERATE_TIMEOUT_MS`), unparseable stdout, or `is_error: true` → one retry after 2 s + jitter, then throw an error carrying the stderr tail and the `label` (e.g. `critic:tufte`). The existing per-agent try/catch blocks already convert throws into `{ error }` entries, so one failed persona never kills a run. Failures matching usage/rate-limit wording skip the retry and fail fast with "Claude plan limit reached — try a smaller panel or wait for the window to reset."

**Deliberate flag omissions** (verified against v2.1.211):
- **No `--bare`** — it restricts auth to `ANTHROPIC_API_KEY` only and never reads OAuth/keychain, which defeats the entire point (subscription auth). `--safe-mode` + `--setting-sources ""` give the isolation we want without touching auth.
- No `--dangerously-skip-permissions` — pointless with `--tools ""`.
- No `--max-turns` — the flag doesn't exist in v2.1.211, and with no tools there is no loop: one prompt yields exactly one assistant turn.

**max_tokens mapping.** The CLI has no `max_tokens` flag. Keep 1500/2500 as `maxTokensHint` with two layers: (1) `CLAUDE_CODE_MAX_OUTPUT_TOKENS` on the spawned process — best-effort, harmless if ignored; (2) a line appended to the prompt: `Keep your complete response under roughly ${Math.round(maxTokensHint * 0.75)} words.` — the guaranteed layer. Parsers are length-agnostic either way.

**healthCheck().** `claude --version` then `claude auth status --json` (5 s timeout); `ok` when exit 0 and the status JSON shows an authenticated account. Cached at startup, re-checkable via `GET /api/health` (§5d).

### 2.4 `api` backend (legacy, opt-in)

Selected only by `SEANCE_ENGINE=api`. Lazy-loads the SDK on first `generate()` — the app no longer constructs a client at module load:

```js
const { default: Anthropic } = await import("@anthropic-ai/sdk");
```

The client singleton (`server.js:22-24`) and both request bodies move here; `maxTokensHint` maps directly to `max_tokens`; the model-not-found help text (`server.js:1035-1038`) moves with it. `healthCheck()` = key presence. `@anthropic-ai/sdk` stays in `dependencies` but is never imported unless selected.

### 2.5 `fixture` backend (replay-only)

`mode: "replay"`. `generate()` throws `EngineUnavailableError`; live endpoints check `engine.mode` up front and answer with a structured error steering the UI to the saved-runs picker (§5d). This replaces any idea of faking per-call generations, which would be fragile.

### 2.6 Call-site changes

- `server.js:1025-1030` → `const responseText = await engine.generate({ prompt, maxTokensHint: 1500, label: \`critic:${agentId}\` });`
- `server.js:968-973` → `const responseText = await engine.generate({ prompt, maxTokensHint: 2500, label: \`synthesis:${disciplineId}\` });`
- Delete the top-level SDK import and client (`server.js:1`, `server.js:22-24`).
- Replace both `ANTHROPIC_API_KEY` guards (`server.js:1080-1084`, `server.js:1119-1121`) with the engine-aware check in §5d.
- Startup log (`server.js:1171`) reports engine name, model, and concurrency instead of "API Key: set/NOT SET".

---

## 3. Concurrency & panel selection — respecting the limits you already have

### 3.1 One semaphore at the chokepoint

A ~15-line semaphore lives **inside `engine.js`**, wrapping `generate()`, so critics, synthesis, and any future caller share a single budget (`SEANCE_MAX_CONCURRENCY`, default **4**):

```js
function createSemaphore(limit) {
  let active = 0; const queue = [];
  const release = () => { active -= 1; if (queue.length) { active += 1; queue.shift()(); } };
  const acquire = () => new Promise((res) => (active < limit ? (active += 1, res()) : queue.push(res)));
  return async (fn) => { await acquire(); try { return await fn(); } finally { release(); } };
}
```

The two `Promise.all` fan-outs (`server.js:1002`, `server.js:1020`) stay as they are — all promises are created immediately, but only 4 CLI processes run at once. Do **not** add a second pool at the call sites; one control point is the design.

### 3.2 Panels: run a subset, not the whole séance

With 39 personas, "run everything" becomes the exception, not the default:

- **API.** `POST /api/evaluate` accepts optional `agents: string[]` (ids). Validate against the roster (400 listing unknown ids), dedupe; empty/omitted → default panel. `runReviewAgents(finalContext, agentIds)` maps over the subset instead of `Object.keys(AGENTS)`.
- **Synthesis coupling.** `runSynthesis` gains a `disciplineIds` param, defaulting to the run's selected agent ids (they are 1:1), capped at 8 by report-average ordering when the panel is larger. `POST /api/synthesize` accepts optional `disciplines: string[]`.
- **Default = the "Symposium Ten"**, a curated 10-critic panel exported as `DEFAULT_PANEL` from `personas.js`: `tufte, rosling, norman, krug, munzner, cairo, cleveland, knaflic, elavsky, lupi` — minimalism, narrative, usability, web pragmatism, theory/validation, ethics, perception, business storytelling, accessibility, data humanism. A default run costs ≤ 20 generations instead of 61 (39 critics + 22 groups).
- **Presets:** `default` (Symposium Ten), `classics` (the six séance classics + tufte/bertin), `full` (all 39), plus free checkbox selection.
- **UI.** On mount, fetch `/api/disciplines` (the endpoint at `server.js:1053` exists but is currently unused by the frontend; extend its payload with `weight`, `group`, `defaultPanel`). Add a collapsible "Panel" section on the input step with preset buttons + grouped checkboxes, send `agents` in the POST body (around `public/index.html:546`), persist the selection in `localStorage`.

---

## 4. Roster expansion — 17 new thinkers (22 → 39)

### 4.1 Extract `personas.js` first

A new `personas.js` owns `buildAgentPrompt`, `AGENTS` (39), `GRAD_STUDENTS` (39), `buildGradStudentPrompt`, `PRESENTATION_SECTIONS`, `PANELS`, `DEFAULT_PANEL`, and `PERSONA_GROUPS` (`classic-22`, `seance-classics`, `modern-practitioners`, `adjacent-disciplines`). `server.js` imports these and keeps re-exporting `AGENTS`/`GRAD_STUDENTS` at its existing export line (`server.js:1163`), so the current export contract survives. This moves ~820 lines of data out of an 1175-line server file *before* adding 17 more entries.

Two roster-wide fixes ride along:

- **Dynamic critic names.** `buildGradStudentPrompt(student, evaluationsBundle, designContext, criticNames)`, where `runSynthesis` computes `criticNames = evaluations.map(e => e.name)`. The prompt then names only the critics actually in the run — fixing the hardcoded six at `server.js:914` and staying correct for any panel subset.
- **Weight backfill.** The 14 currently weight-less legacy agents get explicit weights (1.0–1.1) so the scale is uniform; `getAgentWeight`'s default-1 (`server.js:702`) stays as a safety net.

### 4.2 The new roster

Ids and icons verified unique against the existing 22. Weights use the existing 0.95–1.2 scale (method-defining rigor highest, craft/process lowest). Dimension keys follow the existing lowercase-phrase style; full labels/questions get written at implementation following the worked example in §4.3.

| id | Name | Icon | Wt | Philosophy | 5 dimension keys | Grad discipline |
|---|---|---|---|---|---|---|
| **Séance classics** |||||||
| `playfair` | William Playfair | 📈 | 1.05 | Invention and persuasion in commercial charts | chart-form fitness, temporal storytelling, persuasive framing, annotation economy, inventive form | chart invention and rhetorical economy |
| `nightingale` | Florence Nightingale | 🌹 | 1.1 | Statistics as moral argument for reform | moral urgency, evidence-to-action, comparative clarity, institutional legibility, honest dramatization | statistical advocacy and reform |
| `dubois` | W.E.B. Du Bois | 🖤 | 1.1 | Data portraits with dignity and counter-narrative | human dignity, counter-narrative force, bold visual economy, structural context, exhibit readiness | sociological data portraiture |
| `neurath` | Otto Neurath | 🧱 | 1.05 | Isotype: pictorial statistics anyone can read | pictorial countability, universal legibility, transformation rules, didactic sequence, standardized vocabulary | pictorial statistics and public education |
| `tukey` | John Tukey | 🔭 | 1.15 | Exploratory analysis: let the data surprise you | exploratory affordance, outlier honesty, fit and residual, re-expression, skeptical annotation | exploratory data analysis |
| `minard` | Charles Joseph Minard | 🗺️ | 1.05 | Many variables, one flowing, legible image | multivariate integration, flow legibility, geographic grounding, visceral magnitude, single-image completeness | flow mapping and multivariate narrative |
| **Modern practitioners** |||||||
| `cairo` | Alberto Cairo | 🧭 | 1.1 | Truthful, functional, beautiful, insightful | truthfulness, functional fit, insight depth, uncertainty communication, graphicacy respect | visualization journalism and ethics |
| `munzner` | Tamara Munzner | 🪜 | 1.15 | Nested-model rigor: task before encoding | task abstraction, encoding effectiveness, scalability, validation evidence, idiom appropriateness | visualization theory and evaluation |
| `knaflic` | Cole Nussbaumer Knaflic | 🎯 | 1.0 | Declutter, focus attention, tell the story | audience focus, decluttering, preattentive emphasis, narrative arc, actionable takeaway | business data storytelling |
| `elavsky` | Frank Elavsky | 🦾 | 1.1 | Data accessibility beyond checkbox compliance | screen-reader experience, interaction parity, color independence, cognitive accessibility, a11y-first architecture | accessible data experiences |
| `muth` | Lisa Charlotte Muth | 🌈 | 1.0 | Practical color wisdom and chart craft | color purpose, palette accessibility, chart-type choice, direct labeling, practical polish | chart craft and color practice |
| `kirk` | Andy Kirk | 🧰 | 0.95 | Disciplined process: purpose before pixels | purpose definition, editorial angle, composition and layout, process traceability, chart-choice justification | visualization process and literacy |
| **Adjacent disciplines** |||||||
| `cleveland` | William Cleveland | 📏 | 1.15 | Graphical perception, measured and ranked | perceptual accuracy ranking, banking to 45, superposition vs juxtaposition, comparison distance, measurement honesty | statistical graphics and graphical perception |
| `wilkinson` | Leland Wilkinson | 🧮 | 1.1 | Grammar of graphics: specify, don't draw | grammatical decomposition, scale correctness, layering coherence, facet logic, specification reproducibility | graphics grammars and statistical computing |
| `ware` | Colin Ware | 👁️ | 1.1 | Design for the eye and the visual brain | preattentive channels, gestalt grouping, working-memory load, motion and change perception, ensemble perception | perceptual psychology of visualization |
| `tversky` | Barbara Tversky | 💭 | 1.05 | Diagrams are thought made spatial | spatial metaphor congruence, diagrammatic segmentation, congruity principle, apprehension principle, embodied comprehension | spatial cognition and diagrammatic reasoning |
| `healy` | Kieran Healy | 🎓 | 0.95 | Plain, honest, replicable social-science graphics | honest defaults, model transparency, replication readiness, comparative design, sociological context | quantitative social science communication |

Persona prompts are second-person present ("You are Florence Nightingale…") like the existing entries. For the séance classics, the app's name licenses the conceit of summoning the dead: keep them period-voiced but explicitly able to judge modern work ("you have been shown the modern web").

### 4.3 Worked example — the pattern for all 17

`AGENTS` entry:

```js
nightingale: {
  name: "Florence Nightingale",
  icon: "🌹",
  philosophy: "Statistics as moral argument for reform",
  weight: 1.1,
  prompt: buildAgentPrompt(
    "You are Florence Nightingale, statistician and reformer, summoned to judge modern design. Your philosophy: data exists to compel institutions to act. A chart that informs but does not move a decision-maker has failed. You invented the polar-area diagram to make preventable deaths impossible to ignore.",
    [
      { key: "moral urgency", label: "Moral urgency", question: "does the design make the human stakes of the data unmistakable?" },
      { key: "evidence-to-action", label: "Evidence-to-action", question: "does it lead a decision-maker from evidence to a specific action?" },
      { key: "comparative clarity", label: "Comparative clarity", question: "are before/after and cohort comparisons immediate and honest?" },
      { key: "institutional legibility", label: "Institutional legibility", question: "could a busy administrator grasp and defend the argument in one minute?" },
      { key: "honest dramatization", label: "Honest dramatization", question: "does emphasis amplify the truth without distorting magnitudes?" },
    ],
    "After scoring, propose 5+ specific delta improvements ranked by your criteria. Demand that the design earn a decision, not merely attention."
  ),
},
```

Matching `GRAD_STUDENTS` entry:

```js
nightingale: {
  name: "Nightingale Group",
  icon: "🌹",
  discipline: "statistical advocacy and reform (Nightingale tradition)",
  lens: "Evidence that compels action. You evaluate whether a design turns data into a moral argument a decision-maker cannot ignore — comparisons that indict, magnitudes rendered honestly, and a clear path from chart to changed policy. Persuasion without distortion is the entire craft.",
},
```

### 4.4 New antagonistic panels

Extending the README's six panels; encoded as `PANELS` data (pairs of ids + tension string) in `personas.js`, so the README table and any future UI conflict view derive from one source:

| Panel | Tension |
|---|---|
| Nightingale ↔ Cleveland | Advocacy dramatization vs. measured graphical perception |
| Tukey ↔ Knaflic | Exploratory openness vs. explanatory decluttering |
| Neurath ↔ Tversky | One universal pictorial standard vs. cognition-specific representation |
| Du Bois ↔ Healy | Expressive counter-narrative vs. plain-style convention |
| Playfair ↔ Few | Rhetorical invention vs. dashboard pragmatism |
| Minard ↔ Krug | Multivariate density vs. don't-make-me-think scanability |
| Cairo ↔ Bremer | Truth-first journalism vs. aesthetic delight |
| Wilkinson ↔ Posavec | Formal grammar vs. handcrafted expression |
| Ware ↔ Maeda | Perceptual constraints vs. computational aesthetics |
| Elavsky ↔ Bostock | Accessibility parity vs. bleeding-edge web interaction |
| Muth ↔ Vinh | Functional color pragmatism vs. brand-led polish |
| Munzner ↔ Lupi | Task-abstraction rigor vs. data humanism |

---

## 5. Local & offline hardening

### 5a. Saved-runs library (generalizes the single fixture)

- `runs/` directory at the repo root (`SEANCE_RUNS_DIR` override); `runs/*.json` gitignored, `runs/.gitkeep` committed. New module `runs.js`: `saveRun(run)`, `updateRun(id, patch)`, `listRuns()`, `loadRun(id)` — ids validated against `^run-[\w-]+$` before any path join.
- Run file shape is a **superset of the existing fixture**:

  ```json
  {
    "id": "run-20260719T1200-dashboard",
    "createdAt": "…",
    "engine": { "name": "claude-cli", "model": "sonnet", "cliVersion": "2.1.211" },
    "agents": ["tufte", "…"],
    "context": "…",
    "evaluations": [],
    "report": {},
    "presentations": null,
    "meta": { "durationMs": 0, "costUsd": null }
  }
  ```

  Because `design-review-evaluation.json` already has `{context, evaluations, report}`, it is listed as seed run `run-seed-fixture` with missing fields defaulted.
- `POST /api/evaluate` saves on completion and returns `runId`. `POST /api/synthesize` accepts `runId` and writes the resulting `presentations` back into that run file — so a replayed run is fully offline **including synthesis**.
- New endpoints: `GET /api/runs` (index: id, createdAt, agent count, hasPresentations, context excerpt) and `GET /api/runs/:id` (full). `GET /api/fixture` (`server.js:1062`) stays as an alias for the seed run.
- UI: a "Load a past séance" section on the input step lists `/api/runs`; loading calls the existing `showResults(data)` (`public/index.html:520`) with the stored run — zero generations. The current `runFixtureSynthesis` (`public/index.html:565`) becomes "replay run" + optional "re-run synthesis (live)".

### 5b. Vendor the CDN libraries

`public/vendor/` gets pinned copies of the five scripts currently loaded from unpkg (`public/index.html:7-11`): React 18, ReactDOM 18, @babel/standalone (~3 MB), marked, and JSZip 3.10.1. Swap the script tags to relative `vendor/…` paths and drop `crossorigin`. Commit the files — the offline-first guarantee beats repo size here — plus a dev-only refresh script `scripts/vendor.mjs` (`npm run vendor`) that re-downloads the pinned URLs. Nothing downloads at runtime.

### 5c. Local-directory design analysis

- Split `cloneRepository` (`server.js:494-529`) into the clone step plus `analyzeCheckout(dir)` (README excerpt, key-file listing via an `fs.readdirSync` walk replacing the current `find` shell-out, package.json excerpt; no cleanup/deletion for local directories).
- `analyzeRepository` (`server.js:531`) routes: GitHub URL at `sample` depth → API path (unchanged); other URL → clone → `analyzeCheckout`; **filesystem path** (starts with `/`, `./`, `~`, or a drive letter, or lacks a URL scheme) → `path.resolve`, verify the directory exists, `analyzeCheckout` directly.
- `POST /api/evaluate` accepts `repoPath` alongside `repoUrl`; the UI relabels the input "Repo URL or local folder path".

### 5d. Graceful degradation (no more 500s)

- Startup runs `engine.healthCheck()` and caches the result. New `GET /api/health` → `{ engine, mode, ok, detail, model, concurrency }`.
- `/api/evaluate` and `/api/synthesize`: when `engine.mode === "replay"` or health is not ok, respond `503 { error, code: "ENGINE_UNAVAILABLE", fallback: "replay" }` with a human-readable detail ("claude CLI not found — install Claude Code, or run `claude auth login`"), replacing both API-key 500 guards. Run/fixture endpoints keep working regardless.
- UI: fetch `/api/health` on mount; when degraded, show a persistent banner ("Live engine unavailable (…). Replay mode: load a saved séance below."), disable the run button, and expand the saved-runs picker. `code`-based handling on submit errors as a backstop.

---

## 6. Testing & hygiene

`package.json` gains `"test": "node --test test/"` — `node:test` + `node:assert`, **no new dependencies**. The `isMain` guard (`server.js:1166`) already makes `server.js` import-safe; extend the export line (`server.js:1163`) with `rankRecommendations`, `buildConflictPairs`, `averageScore`.

| File | Covers |
|---|---|
| `test/parse.test.js` | `parseAgentResponse` tier walk: structured `SCORES:`/`PROPOSALS:` sample; JSON-substring sample; freeform "Clarity: 7/10" prose; empty string. `parsePresentationSections` with all 5 headers, a missing middle header, junk before ABSTRACT |
| `test/report.test.js` | `rankRecommendations` position weighting (rank 1 beats rank 5) and agent weighting (tufte 1.2 beats a weight-1 peer on identical proposals); dedupe by trimmed text; top-5 cap. `buildConflictPairs` descending delta, null-score skip |
| `test/engine.test.js` | Engine selection for all three names + default; claude-cli backend with an injected `spawnImpl` fake: happy path returns `parsed.result`, malformed stdout retries then rejects, nonzero exit rejects with stderr in the message, semaphore honored (fake records max in-flight ≤ cap); fixture engine throws `EngineUnavailableError` |
| `test/personas.test.js` | Invariants over the 39: `Object.keys(AGENTS)` deep-equals `Object.keys(GRAD_STUDENTS)`; every prompt contains `{CONTEXT}`, a `SCORES:` contract, and exactly 5 dimension lines; weights within [0.9, 1.3]; unique names and icons; `DEFAULT_PANEL`/`PANELS` ids all exist |

**Drift sweep:** `package.json:4` description → "Multi-agent design review symposium: 39 antagonistic design critics"; fix the stale comment at `server.js:1061`; README Quick Start rewritten around `claude auth login` (once) + `npm start`, with `SEANCE_ENGINE=api` + key as the legacy alternative; env-var table from §2.2; roster and panels sections regenerated from `personas.js`; troubleshooting entries for "claude CLI not found", "not authenticated", and "plan limit reached".

---

## 7. Phased rollout

| Phase | Scope | Effort | Depends on |
|---|---|---|---|
| **1. Engine seam + limits** | `engine.js` (all three backends, semaphore, retries, health), call-site swap, delete top-level SDK client, `/api/health`, 503 degrade, `test/engine.test.js`, README quick-start | ~1 day | — |
| **2. Personas + roster + panels** | `personas.js` extraction (re-export shim), 17 + 17 new entries, weight backfill, dynamic `criticNames`, `PANELS`/`DEFAULT_PANEL`, `agents`/`disciplines` API params, extended `/api/disciplines`, UI panel picker, `test/personas.test.js`, README roster | ~1.5 days | parallel with 1 (small merge at `runReviewAgents(agentIds)`) |
| **3. Offline hardening** | `runs.js` + endpoints + save-on-complete + `runId` synthesis write-back, seed-fixture alias, UI runs picker + degrade polish, `public/vendor/` + `scripts/vendor.mjs`, `repoPath` local analysis | ~1 day | 1 (engine metadata in runs); picker benefits from 2 |
| **4. Tests + drift sweep** | `test/parse.test.js`, `test/report.test.js`, remaining exports, package.json description, stale comments, README troubleshooting, `methodology.md`/`iteration.md` consistency pass | ~0.5 day | 1–3 |

**Verification per phase:**

1. With no `ANTHROPIC_API_KEY` set and the CLI logged in, a full run (critics + synthesis) completes; process count never exceeds 4; `SEANCE_ENGINE=api` still works; a logged-out CLI yields the 503 + UI banner, not a crash.
2. `/api/disciplines` returns 39/39; a `classics` panel run engages only those personas (check `label` logs); synthesis prompts name only in-run critics; roster tests pass.
3. Run once live → kill network → restart with `SEANCE_ENGINE=fixture`: the SPA loads (no CDN), the saved run replays with presentations, and local-path analysis works on this repo's own directory.
4. `npm test` green; a grep for "6 agents"-style claims finds nothing stale.

---

## 8. Risks & open questions

1. **CLI JSON result shape.** `--output-format json` yielding `{type:"result", is_error, result, usage, total_cost_usd, …}` is the documented shape, but it wasn't smoke-tested during planning (a live call spends real quota). Mitigation: parse defensively (`parsed.result ?? parsed.text`), one smoke run at the start of Phase 1.
2. **`CLAUDE_CODE_MAX_OUTPUT_TOKENS` honoring.** Treat as best-effort; the prompt-embedded word cap is the guaranteed layer. Oversized outputs only cost latency — the parsers are length-agnostic.
3. **Subscription rate behavior at concurrency 4.** Plan-limit responses surface as `is_error` results or nonzero exits with usage-limit wording. The engine pattern-matches those and fails fast (no retry) with "try a smaller panel or wait for the window to reset". Exact CLI wording unknown — capture it during Phase 1 testing.
4. **Spawn overhead.** Each generation is a fresh process (~1–3 s startup). Against 30–90 s completions across 10–39 generations, that's <5% overhead. `--no-session-persistence` and the neutral cwd keep `~/.claude` clean.
5. **First-run auth.** Headless `-p` requires a prior interactive `claude auth login` (or `claude setup-token`) — a documented one-time step; the health check's `detail` says exactly that.
6. **Flag drift across CLI versions.** Log `claude --version` at startup and keep the flag list in one constant in `engine.js`.
7. **Default model choice.** `sonnet` trades some critique depth for plan-limit headroom; `SEANCE_MODEL=opus` is documented for small panels.
8. **Icon/name collisions.** All 17 proposed icons were checked unique against the existing 22; the personas test enforces uniqueness for future additions.
