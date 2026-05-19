import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "10mb" }));

// Debug logging
const publicPath = path.join(__dirname, "public");
console.log(`[Server] __dirname: ${__dirname}`);
console.log(`[Server] publicPath: ${publicPath}`);
console.log(`[Server] public/index.html exists: ${fs.existsSync(path.join(publicPath, "index.html"))}`);

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
console.log(`[Server] Anthropic model: ${ANTHROPIC_MODEL}`);

const OUTPUT_FORMAT_INSTRUCTIONS = `

After your prose evaluation, end your response with TWO machine-readable blocks in this exact format (these are parsed programmatically; do not omit or rename):

SCORES:
{DIMENSION_NAMES}

PROPOSALS:
1. <one-line summary of first proposal>
2. <one-line summary of second proposal>
3. <one-line summary of third proposal>
4. <one-line summary of fourth proposal>
5. <one-line summary of fifth proposal>

The SCORES block must contain exactly one line per dimension in the form "<dimension name>: <integer 1-10>/10". The PROPOSALS block must contain one numbered line per proposal — keep each line to a single sentence. The full elaborated proposals can remain in the prose above; the numbered list is just an index.`;

function buildAgentPrompt(persona, dimensions, closing) {
  const dimensionList = dimensions.map((d, i) => `${i + 1}. ${d.label}: ${d.question}`).join("\n");
  const scoreBlock = dimensions.map((d) => `${d.key}: <integer>/10`).join("\n");
  const formatBlock = OUTPUT_FORMAT_INSTRUCTIONS.replace("{DIMENSION_NAMES}", scoreBlock);
  return `${persona}

Evaluate the following design on these 5 dimensions (score 1-10 each):
${dimensionList}

${closing}

Design context:
{CONTEXT}
${formatBlock}`;
}

// Agent definitions
const AGENTS = {
  tufte: {
    name: "Edward Tufte",
    icon: "📊",
    philosophy: "Minimalism, clarity, precision",
    prompt: buildAgentPrompt(
      "You are Edward Tufte, master of information design and visual clarity. Your philosophy: minimize noise, maximize signal. Every pixel must earn its place through data or structure.",
      [
        { key: "data-ink ratio", label: "Data-ink ratio", question: "what percentage of visual elements represent data vs decoration?" },
        { key: "clarity", label: "Clarity", question: "can someone understand the core message in 3 seconds?" },
        { key: "typographic precision", label: "Typographic precision", question: "is letterform hierarchy intentional and effective?" },
        { key: "static elegance", label: "Static elegance", question: "does it work without animation or interaction?" },
        { key: "reduction", label: "Reduction", question: "what could be removed without loss?" },
      ],
      "After scoring, propose 5+ specific, actionable delta improvements ranked by your criteria. Be direct about what must be removed or simplified."
    ),
  },
  rosling: {
    name: "Hans Rosling",
    icon: "🎬",
    philosophy: "Narrative, engagement, accessibility",
    prompt: buildAgentPrompt(
      "You are Hans Rosling, champion of accessible data storytelling. Your philosophy: engage audiences, illuminate insights, tell stories that move people.",
      [
        { key: "narrative structure", label: "Narrative structure", question: "is there a clear, compelling story arc?" },
        { key: "emotional resonance", label: "Emotional resonance", question: "does it engage the viewer emotionally?" },
        { key: "accessibility for non-experts", label: "Accessibility for non-experts", question: "could someone without domain knowledge benefit?" },
        { key: "animation potential", label: "Animation potential", question: "where would movement clarify or delight?" },
        { key: "story scaffolding", label: "Story scaffolding", question: "does it guide discovery naturally and effectively?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize human connection and emotional engagement."
    ),
  },
  bertin: {
    name: "Jacques Bertin",
    icon: "🧬",
    philosophy: "Systematic rigor, semiotic correctness",
    prompt: buildAgentPrompt(
      "You are Jacques Bertin, semiotician of visual encoding and visual scientist. Your philosophy: visual encoding must be systematic, perceptually effective, and scientifically rigorous.",
      [
        { key: "semiotic correctness", label: "Semiotic correctness", question: "do visual variables encode what they claim?" },
        { key: "perceptual effectiveness", label: "Perceptual effectiveness", question: "do viewers perceive intended hierarchy and relationships?" },
        { key: "grammar of graphics", label: "Grammar of graphics", question: "are visual relationships systematic and rule-based?" },
        { key: "color semantics", label: "Color semantics", question: "do hues carry consistent, meaningful relationships?" },
        { key: "scientific replicability", label: "Scientific replicability", question: "could another designer rebuild your system from stated rules?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Demand systematic consistency and perceptual rigor."
    ),
  },
  few: {
    name: "Stephen Few",
    icon: "⚙️",
    philosophy: "Pragmatism, business value, performance",
    prompt: buildAgentPrompt(
      "You are Stephen Few, pragmatist and business strategist. Your philosophy: does it work? Can teams maintain it? Does it solve real problems profitably?",
      [
        { key: "business/user fit", label: "Business/user fit", question: "solves a real, material problem for users?" },
        { key: "maintainability", label: "Maintainability", question: "can a team realistically update and maintain this in 6 months?" },
        { key: "performance", label: "Performance", question: "does it load and respond fast under realistic load?" },
        { key: "ROI", label: "ROI", question: "resources invested vs. measurable value delivered?" },
        { key: "scalability", label: "Scalability", question: "works for 10 users and 10 million users equally well?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Challenge assumptions about complexity and prioritize pragmatism."
    ),
  },
  shneiderman: {
    name: "Ben Shneiderman",
    icon: "🎮",
    philosophy: "User agency, control, exploration",
    prompt: buildAgentPrompt(
      "You are Ben Shneiderman, pioneer of human-computer interaction. Your philosophy: users must have agency, control, and freedom to explore.",
      [
        { key: "user agency", label: "User agency", question: "how much control do users actually have over their actions?" },
        { key: "exploration freedom", label: "Exploration freedom", question: "can users discover unexpected insights and paths?" },
        { key: "interaction fluidity", label: "Interaction fluidity", question: "are controls responsive, intuitive, and discoverable?" },
        { key: "feedback clarity", label: "Feedback clarity", question: "does the system explain what's happening in real time?" },
        { key: "safe experimentation", label: "Safe experimentation", question: "can users undo mistakes and recover safely?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Empower users to direct their own exploration."
    ),
  },
  inclusive: {
    name: "Inclusive Design",
    icon: "♿",
    philosophy: "Accessibility, neurodiversity, cultural sensitivity",
    prompt: buildAgentPrompt(
      "You are the voice of Inclusive Design. Your philosophy: accessibility and clarity for all cognitive styles, motor abilities, sensory modalities, and cultural contexts. Leave no user behind.",
      [
        { key: "WCAG accessibility compliance", label: "WCAG accessibility compliance", question: "meets standards for all disability categories?" },
        { key: "cognitive load", label: "Cognitive load", question: "clear for people with ADHD, dyslexia, working memory limits, neurodivergence?" },
        { key: "cultural assumption-free", label: "Cultural assumption-free", question: "works across cultures, languages, and contexts?" },
        { key: "motor accessibility", label: "Motor accessibility", question: "usable without mouse/keyboard/touch (switch control, voice)?" },
        { key: "sensory alternatives", label: "Sensory alternatives", question: "text alternatives, colorblind-safe palettes, captions, transcripts?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Every person deserves to use this."
    ),
  },
};

const GITHUB_API_BASE = "https://api.github.com";

function parseGitHubRepoUrl(repoUrl) {
  try {
    const url = new URL(repoUrl);
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
      return null;
    }
    const parts = url.pathname.replace(/(^\/|\.git$)/g, "").split("/");
    if (parts.length < 2) {
      return null;
    }
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

async function fetchGitHubApi(path) {
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "design-review-agents",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(`${GITHUB_API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchGitHubFile(owner, repo, filePath) {
  try {
    const fileData = await fetchGitHubApi(`/repos/${owner}/${repo}/contents/${filePath}`);
    if (!fileData?.content) {
      return null;
    }
    return Buffer.from(fileData.content, fileData.encoding).toString("utf-8");
  } catch {
    return null;
  }
}

async function fetchGitHubRepoSummary(owner, repo) {
  const readme = await fetchGitHubFile(owner, repo, "README.md") || await fetchGitHubFile(owner, repo, "Readme.md") || "(no README found)";
  const packageJson = await fetchGitHubFile(owner, repo, "package.json");
  let rootFiles = [];
  try {
    const contents = await fetchGitHubApi(`/repos/${owner}/${repo}/contents`);
    if (Array.isArray(contents)) {
      rootFiles = contents.slice(0, 30).map((item) => `- ${item.type}: ${item.name}`);
    }
  } catch {
    rootFiles = ["Could not list root files via GitHub API."];
  }
  const summary = [
    `GITHUB REPO: https://github.com/${owner}/${repo}`,
    `Analysis mode: sample`,
    `Root files:\n${rootFiles.join("\n")}`,
    `README.md content (truncated):\n${readme.toString().substring(0, 2000)}`,
  ];
  if (packageJson) {
    summary.push(`package.json:\n${packageJson.toString().substring(0, 2000)}`);
  }
  return summary.join("\n\n");
}

async function cloneRepository(repoUrl) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
  try {
    execSync(`git clone --depth 1 ${repoUrl} ${tempDir}`, {
      timeout: 30000,
      stdio: "pipe",
    });
    const analysisParts = [`Repository clone path: ${tempDir}`];
    const readmePath = path.join(tempDir, "README.md");
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, "utf-8");
      analysisParts.push(`README.md:\n${readme.substring(0, 2000)}`);
    }
    try {
      const structure = execSync(
        `find ${tempDir} -type f -name "*.json" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | head -20`,
        { encoding: "utf-8" }
      );
      analysisParts.push(`Repository structure (key files):\n${structure}`);
    } catch {
      analysisParts.push("Repository structure listing failed.");
    }
    const pkgPath = path.join(tempDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      analysisParts.push(`package.json:\n${JSON.stringify(pkg, null, 2).substring(0, 1000)}`);
    }
    return analysisParts.join("\n\n");
  } finally {
    try {
      execSync(`rm -rf ${tempDir}`);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

async function analyzeRepository(repoUrl, depth = "sample") {
  const githubInfo = parseGitHubRepoUrl(repoUrl);
  if (githubInfo && depth === "sample") {
    try {
      return await fetchGitHubRepoSummary(githubInfo.owner, githubInfo.repo);
    } catch (err) {
      console.warn(`[Repo] GitHub API sample analysis failed: ${err.message}`);
    }
  }
  try {
    return await cloneRepository(repoUrl);
  } catch (err) {
    return `Error analyzing repository: ${err.message}`;
  }
}

function extractJsonSubstring(text) {
  if (!text || typeof text !== "string") return null;
  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };
  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const openBrace = trimmed.indexOf("{");
  const closeBrace = trimmed.lastIndexOf("}");
  if (openBrace !== -1 && closeBrace > openBrace) {
    const objectCandidate = tryParse(trimmed.slice(openBrace, closeBrace + 1));
    if (objectCandidate) return objectCandidate;
  }
  const openBracket = trimmed.indexOf("[");
  const closeBracket = trimmed.lastIndexOf("]");
  if (openBracket !== -1 && closeBracket > openBracket) {
    const arrayCandidate = tryParse(trimmed.slice(openBracket, closeBracket + 1));
    if (arrayCandidate) return arrayCandidate;
  }
  return null;
}

function stripFormatting(text) {
  return text.replace(/[*_`#]+/g, "").trim();
}

function parseStructuredBlocks(rawText) {
  const scoresMatch = rawText.match(/SCORES\s*:\s*\n([\s\S]*?)(?:\n\s*\n|\nPROPOSALS\s*:|$)/i);
  const proposalsMatch = rawText.match(/PROPOSALS\s*:\s*\n([\s\S]*?)$/i);
  if (!scoresMatch && !proposalsMatch) return null;

  const scores = [];
  if (scoresMatch) {
    const scoreLines = scoresMatch[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of scoreLines) {
      const match = line.match(/^([^:]+?)\s*:\s*(\d{1,2})\s*(?:\/\s*10)?$/);
      if (match) {
        const score = parseInt(match[2], 10);
        if (score >= 1 && score <= 10) {
          scores.push({ dimension: stripFormatting(match[1]), score });
        }
      }
    }
  }

  const improvements = [];
  if (proposalsMatch) {
    const proposalLines = proposalsMatch[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of proposalLines) {
      const match = line.match(/^\d+\.\s*(.+)$/);
      if (match) {
        improvements.push(stripFormatting(match[1]));
      }
    }
  }

  if (scores.length === 0 && improvements.length === 0) return null;
  return { scores, improvements };
}

function fallbackParseAgentResponse(rawText) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const scores = [];
  const improvements = [];
  // Match scored dimension lines: optional leading heading/bullet, dimension name, score n/10
  const scoreRe = /^(?:#+\s*)?(?:\d+\.|[-*])?\s*\**\s*([^:*\n]+?)\s*\**\s*[:\-—]\s*\**\s*(\d{1,2})\s*\/\s*10/;
  // Match proposal lines starting with: "N.", "- ", "Δn", "### N." or "### Δn" (with optional " — " or ". ")
  const proposalRe = /^(?:#{1,4}\s+)?(?:\d+\.|[-*]|Δ\d+|\d+\))[\s.\-—:]+\**\s*(.+?)\**$/;
  for (const line of lines) {
    const scoreMatch = line.match(scoreRe);
    if (scoreMatch) {
      const dimension = stripFormatting(scoreMatch[1]);
      if (dimension && !/^(?:total|composite|overall)$/i.test(dimension)) {
        scores.push({ dimension, score: parseInt(scoreMatch[2], 10) });
      }
      continue;
    }
    const proposalMatch = line.match(proposalRe);
    if (proposalMatch) {
      const text = stripFormatting(proposalMatch[1]).replace(/\s+/g, " ").trim();
      if (
        text &&
        text.length > 15 &&
        !/^(?:total|composite|overall|highest priority|lowest|score)/i.test(text) &&
        !/^\d+\s*\/\s*\d+$/.test(text)
      ) {
        improvements.push(text);
      }
    }
  }
  return {
    scores,
    improvements: improvements.slice(0, 10),
  };
}

function deriveSummary(rawText) {
  const paragraphs = rawText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const cleaned = stripFormatting(para).replace(/\s+/g, " ");
    if (cleaned.length > 40 && !/^scores?\b/i.test(cleaned) && !/^proposals?\b/i.test(cleaned)) {
      return cleaned.length > 280 ? cleaned.slice(0, 277) + "…" : cleaned;
    }
  }
  return "";
}

function parseAgentResponse(rawText) {
  const summary = deriveSummary(rawText);
  const structured = parseStructuredBlocks(rawText);
  if (structured && (structured.scores.length > 0 || structured.improvements.length > 0)) {
    return {
      scores: structured.scores,
      improvements: structured.improvements,
      summary,
      raw: rawText,
      source: "structured",
    };
  }
  const parsedJson = extractJsonSubstring(rawText);
  if (parsedJson && typeof parsedJson === "object" && (Array.isArray(parsedJson.scores) || Array.isArray(parsedJson.improvements))) {
    return {
      scores: Array.isArray(parsedJson.scores)
        ? parsedJson.scores.map((entry) => ({
            dimension: entry.dimension || entry.name || "Dimension",
            score: Number(entry.score) || 0,
          }))
        : [],
      improvements: Array.isArray(parsedJson.improvements) ? parsedJson.improvements.map(String).filter(Boolean) : [],
      summary,
      raw: rawText,
      source: "json",
    };
  }
  const fallback = fallbackParseAgentResponse(rawText);
  return {
    scores: fallback.scores,
    improvements: fallback.improvements,
    summary,
    raw: rawText,
    source: "regex",
  };
}

function averageScore(scores) {
  if (!scores || !scores.length) return null;
  const total = scores.reduce((sum, score) => sum + (Number(score.score) || 0), 0);
  return total / scores.length;
}

function rankRecommendations(evaluations) {
  const buckets = {};
  evaluations.forEach((evaluation) => {
    evaluation.parsed.improvements?.forEach((item, index) => {
      const key = item.trim();
      if (!key) return;
      const weight = Math.max(0, 5 - index);
      buckets[key] = (buckets[key] || 0) + weight;
    });
  });
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([proposal, score]) => ({ proposal, score }));
}

function buildConflictPairs(evaluations) {
  const pairs = [];
  for (let i = 0; i < evaluations.length; i += 1) {
    for (let j = i + 1; j < evaluations.length; j += 1) {
      const a = evaluations[i];
      const b = evaluations[j];
      const avgA = averageScore(a.parsed.scores);
      const avgB = averageScore(b.parsed.scores);
      if (avgA === null || avgB === null) continue;
      pairs.push({
        agentA: a.agentId,
        agentB: b.agentId,
        delta: Math.abs(avgA - avgB),
      });
    }
  }
  return pairs.sort((a, b) => b.delta - a.delta);
}

const GRAD_STUDENTS = {
  tufte: {
    name: "Tufte Group",
    icon: "📊",
    discipline: "minimalism and information design (Tufte tradition)",
    lens: "Reduction, data-ink ratio, static elegance, typographic precision. You believe most designs fail by adding rather than subtracting. Decoration is a moral failing.",
  },
  rosling: {
    name: "Rosling Group",
    icon: "🎬",
    discipline: "narrative data storytelling (Rosling tradition)",
    lens: "Emotional resonance, accessibility for non-experts, animation, story arc. You believe data without a story is just numbers. Restraint can be cowardice.",
  },
  bertin: {
    name: "Bertin Group",
    icon: "🧬",
    discipline: "semiotics and visual encoding (Bertin tradition)",
    lens: "Systematic encoding rules, perceptual effectiveness, a declared grammar mapping data types to visual variables. You believe ad-hoc visualizations are scientifically illegitimate.",
  },
  few: {
    name: "Few Group",
    icon: "⚙️",
    discipline: "pragmatic business analytics (Few tradition)",
    lens: "Does it work? Does it ship? Is it maintainable in six months? You believe most designs are over-engineered relative to their audience and you are tired of cleverness for its own sake.",
  },
  shneiderman: {
    name: "Shneiderman Group",
    icon: "🎮",
    discipline: "human-computer interaction (Shneiderman tradition)",
    lens: "User agency, direct manipulation, reversibility, exploration. You believe explorables without undo, state-sharing, or feedback are user-hostile no matter how clever.",
  },
  inclusive: {
    name: "Inclusive Design Group",
    icon: "♿",
    discipline: "inclusive and accessible design",
    lens: "WCAG compliance, cognitive load, cultural assumptions, motor and sensory alternatives. You believe a design that excludes anyone is unfinished — elegance and accessibility are not in tension.",
  },
};

function formatEvaluationsForSynthesis(evaluations) {
  return evaluations
    .map((evaluation) => {
      const body = (evaluation.response || evaluation.parsed?.raw || "").trim();
      if (!body) {
        return `### Critic: ${evaluation.name}\n(No response produced.)`;
      }
      return `### Critic: ${evaluation.name}\n\n${body}`;
    })
    .join("\n\n---\n\n");
}

function buildGradStudentPrompt(student, evaluationsBundle, designContext) {
  return `You are a group of graduate students specializing in ${student.discipline}, presenting your semester-long review of a design.

Your disciplinary perspective:
${student.lens}

The design under review (the original context shown to the critics):
${designContext || "(no original design context provided — reason only from the critic evaluations below)"}

You have read evaluations from six design critics:

${evaluationsBundle}

Write a semester-project-style presentation from your discipline's perspective. Use these EXACT section headers, in this order, and nothing else at the top level:

## ABSTRACT
2-3 sentences. What is the design, and what is your group's verdict?

## KEY FINDINGS
What does this design do well and poorly from your lens? 3-6 bullet points.

## CONFLICT WITH OTHER DISCIPLINES
Where do you agree or disagree with the other critics? You MUST name at least one critic by name (Tufte, Rosling, Bertin, Few, Shneiderman, or Inclusive Design) and quote or paraphrase what they said before stating your disagreement. Be specific, not polite.

## PRIORITIZED RECOMMENDATIONS
Your top 3 changes, ranked by your discipline's values. For each one, use this structure:

1. **<one-line title>**
   - **What:** the concrete change
   - **Why:** rationale rooted in your discipline
   - **Tradeoff:** what is lost or gained relative to another discipline's preference

## CONCLUSION
One paragraph. What should the designer do FIRST, and why does that come before everything else?

Constraints:
- Be opinionated. You have a disciplinary perspective and you are defending it.
- Do not try to synthesize or balance all critics — argue from your lens.
- Do not invent dimensions or use section headers other than the five above.`;
}

const PRESENTATION_SECTIONS = [
  { key: "abstract", header: "ABSTRACT" },
  { key: "findings", header: "KEY FINDINGS" },
  { key: "conflicts", header: "CONFLICT WITH OTHER DISCIPLINES" },
  { key: "recommendations", header: "PRIORITIZED RECOMMENDATIONS" },
  { key: "conclusion", header: "CONCLUSION" },
];

function parsePresentationSections(rawText) {
  const sections = {};
  if (!rawText) return sections;
  for (let i = 0; i < PRESENTATION_SECTIONS.length; i += 1) {
    const current = PRESENTATION_SECTIONS[i];
    const next = PRESENTATION_SECTIONS[i + 1];
    const startPattern = new RegExp(`##\\s*${current.header}\\b[^\\n]*\\n`, "i");
    const startMatch = rawText.match(startPattern);
    if (!startMatch) continue;
    const startIndex = startMatch.index + startMatch[0].length;
    let endIndex = rawText.length;
    if (next) {
      const endPattern = new RegExp(`\\n##\\s*${next.header}\\b`, "i");
      const endMatch = rawText.slice(startIndex).match(endPattern);
      if (endMatch) {
        endIndex = startIndex + endMatch.index;
      }
    }
    sections[current.key] = rawText.slice(startIndex, endIndex).trim();
  }
  return sections;
}

async function runGradStudent(disciplineId, evaluationsBundle, designContext) {
  const student = GRAD_STUDENTS[disciplineId];
  const prompt = buildGradStudentPrompt(student, evaluationsBundle, designContext);
  try {
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    });
    const responseText = message?.content?.[0]?.text || message?.output?.[0]?.content?.[0]?.text || "";
    const sections = parsePresentationSections(responseText);
    return {
      disciplineId,
      name: student.name,
      icon: student.icon,
      discipline: student.discipline,
      response: responseText,
      sections,
      error: null,
    };
  } catch (err) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error";
    console.error(`[API] Grad-student ${disciplineId} error:`, err);
    return {
      disciplineId,
      name: student.name,
      icon: student.icon,
      discipline: student.discipline,
      response: "",
      sections: {},
      error: errorMessage,
    };
  }
}

async function runSynthesis(evaluations, designContext) {
  const evaluationsBundle = formatEvaluationsForSynthesis(evaluations);
  const disciplineIds = Object.keys(GRAD_STUDENTS);
  return Promise.all(disciplineIds.map((id) => runGradStudent(id, evaluationsBundle, designContext)));
}

function buildIterationPrompt(evaluations, context) {
  const topRecommendations = rankRecommendations(evaluations).slice(0, 5);
  const agentSummaries = evaluations
    .map((evaluation) => {
      const avg = averageScore(evaluation.parsed.scores);
      return `- ${evaluation.name}: ${avg !== null ? avg.toFixed(1) : "N/A"}/10`;
    })
    .join("\n");
  return `Use the following design context and evaluation findings to create a concise, prioritized next iteration plan.\n\nDesign context:\n${context}\n\nAgent evaluation summary:\n${agentSummaries}\n\nTop cross-agent recommendations:\n${topRecommendations
    .map((item, index) => `${index + 1}. ${item.proposal}`)
    .join("\n")}\n\nPlease produce:\n1. The highest-priority changes to make in the next iteration.\n2. A short rationale for each change.\n3. A single actionable prompt that a designer or Claude-style assistant can use to rewrite or improve the design.`;
}

async function runReviewAgents(finalContext) {
  const agentIds = Object.keys(AGENTS);
  return Promise.all(
    agentIds.map(async (agentId) => {
      const agent = AGENTS[agentId];
      const prompt = agent.prompt.replace("{CONTEXT}", finalContext);
      try {
        const message = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        });
        const responseText = message?.content?.[0]?.text || message?.output?.[0]?.content?.[0]?.text || "";
        const parsed = parseAgentResponse(responseText);
        return { agentId, name: agent.name, response: responseText, parsed, error: null };
      } catch (err) {
        const errorMessage = err?.message || err?.error?.message || "Unknown error";
        const modelNotFound = err?.error?.type === "not_found_error" && errorMessage.includes("model");
        const helpText = modelNotFound
          ? " Model not found. Set ANTHROPIC_MODEL to a supported model such as claude-opus-4-7, claude-sonnet-4-6, or claude-haiku-4-5."
          : "";
        console.error(`[API] Agent ${agentId} error:`, err);
        return {
          agentId,
          name: agent.name,
          response: "",
          parsed: { scores: [], improvements: [], summary: "", raw: "" },
          error: `${errorMessage}${helpText}`,
        };
      }
    })
  );
}

// Metadata endpoint so the frontend can render discipline tabs without hardcoding.
app.get("/api/disciplines", (_req, res) => {
  res.json({
    agents: Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, icon: a.icon, philosophy: a.philosophy })),
    gradStudents: Object.entries(GRAD_STUDENTS).map(([id, g]) => ({ id, name: g.name, icon: g.icon, discipline: g.discipline })),
  });
});

// Fixture endpoint: load the canned evaluation JSON so the synthesis layer can be iterated without
// rerunning the 6 review agents.
app.get("/api/fixture", (_req, res) => {
  const fixturePath = path.join(__dirname, "design-review-evaluation.json");
  if (!fs.existsSync(fixturePath)) {
    return res.status(404).json({ error: "Fixture file not found at design-review-evaluation.json" });
  }
  try {
    const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Failed to read fixture: ${err.message}` });
  }
});

// API ROUTE - Must come BEFORE static middleware
app.post("/api/evaluate", async (req, res) => {
  try {
    const { context, repoUrl, repoDepth, includeSynthesis } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "ANTHROPIC_API_KEY environment variable not set",
      });
    }

    let finalContext = context || "";

    if (repoUrl) {
      console.log(`[API] Analyzing repository: ${repoUrl}`);
      const repoAnalysis = await analyzeRepository(repoUrl, repoDepth || "sample");
      finalContext += `\n\nREPOSITORY ANALYSIS:\n${repoAnalysis}`;
    }

    const evaluations = await runReviewAgents(finalContext);

    const report = {
      topRecommendations: rankRecommendations(evaluations),
      conflictPairs: buildConflictPairs(evaluations),
      iterationPrompt: buildIterationPrompt(evaluations, finalContext),
    };

    let presentations = null;
    if (includeSynthesis) {
      console.log("[API] Running grad-student synthesis phase");
      presentations = await runSynthesis(evaluations, finalContext);
    }

    res.json({ context: finalContext, evaluations, report, presentations });
  } catch (err) {
    console.error("[API] Evaluation error:", err);
    res.status(500).json({ error: err.message || "Unknown evaluation error" });
  }
});

// Synthesis-only endpoint. Accepts either { evaluations, context } directly, or { useFixture: true }
// to read design-review-evaluation.json from disk and run synthesis against it.
app.post("/api/synthesize", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable not set" });
    }

    let evaluations = req.body?.evaluations;
    let designContext = req.body?.context || "";

    if (req.body?.useFixture) {
      const fixturePath = path.join(__dirname, "design-review-evaluation.json");
      if (!fs.existsSync(fixturePath)) {
        return res.status(404).json({ error: "Fixture file not found" });
      }
      const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      evaluations = data.evaluations;
      designContext = data.context || designContext;
    }

    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      return res.status(400).json({ error: "Request must include evaluations (array) or useFixture=true" });
    }

    const presentations = await runSynthesis(evaluations, designContext);
    res.json({ presentations });
  } catch (err) {
    console.error("[API] Synthesis error:", err);
    res.status(500).json({ error: err.message || "Unknown synthesis error" });
  }
});

// STATIC MIDDLEWARE - Serve files from public/
app.use(express.static(publicPath));

// FALLBACK - Serve index.html for all other routes (SPA support)
app.get("*", (req, res) => {
  const indexPath = path.join(publicPath, "index.html");
  console.log(`[Server] GET ${req.path} -> serving ${indexPath}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`[Server] Error serving ${indexPath}:`, err.message);
      res.status(404).send("Not found");
    }
  });
});

export { parseAgentResponse, parsePresentationSections, AGENTS, GRAD_STUDENTS };

// START SERVER (only when run directly, not when imported for tests)
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Design Review Agents running on http://localhost:${PORT}`);
    console.log(`✓ API Key: ${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"}`);
    console.log(`✓ Static files: ${publicPath}\n`);
  });
}
