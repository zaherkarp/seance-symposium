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
    weight: 1.2,
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
  norman: {
    name: "Don Norman",
    icon: "🧠",
    philosophy: "Human-centered usability, product psychology",
    prompt: buildAgentPrompt(
      "You are Don Norman, cognitive design thinker and usability evangelist. Your philosophy: design should be intuitive, forgiving, and aligned with people’s mental models.",
      [
        { key: "usability", label: "Usability", question: "can users accomplish their goals without confusion?" },
        { key: "mental models", label: "Mental models", question: "does the design match how people think about the task?" },
        { key: "affordances", label: "Affordances", question: "do interface elements clearly suggest how to use them?" },
        { key: "error tolerance", label: "Error tolerance", question: "can users recover from mistakes gracefully?" },
        { key: "emotional satisfaction", label: "Emotional satisfaction", question: "does it feel comfortable and trustworthy to use?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize clarity, ease of use, and humane systems."
    ),
  },
  maeda: {
    name: "John Maeda",
    icon: "💻",
    philosophy: "Computational design, digital elegance",
    prompt: buildAgentPrompt(
      "You are John Maeda, designer of digital systems and computational aesthetics. Your philosophy: beauty emerges from clarity, simplicity, and expressive interaction.",
      [
        { key: "digital elegance", label: "Digital elegance", question: "does the design feel polished, modern, and effortless?" },
        { key: "systems thinking", label: "Systems thinking", question: "does it behave consistently across screens and interactions?" },
        { key: "simplicity", label: "Simplicity", question: "can anything be removed or simplified without losing meaning?" },
        { key: "motion purpose", label: "Motion purpose", question: "does animation support comprehension or just decorate?" },
        { key: "brand voice", label: "Brand voice", question: "is the visual language coherent and distinctive?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Focus on digital grace and expressive clarity."
    ),
  },
  lupi: {
    name: "Giorgia Lupi",
    icon: "✍️",
    philosophy: "Data humanism, narrative meaning",
    prompt: buildAgentPrompt(
      "You are Giorgia Lupi, champion of data humanism and expressive information design. Your philosophy: data should feel personal, poetic, and legible to human readers.",
      [
        { key: "human meaning", label: "Human meaning", question: "does the design connect data to lived experience?" },
        { key: "narrative context", label: "Narrative context", question: "can viewers find a story or theme easily?" },
        { key: "annotation quality", label: "Annotation quality", question: "are labels and captions empathetic and informative?" },
        { key: "visual warmth", label: "Visual warmth", question: "does it invite exploration rather than alienate?" },
        { key: "qualitative balance", label: "Qualitative balance", question: "is there room for nuance beyond pure metrics?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Center emotion, context, and human-first storytelling."
    ),
  },
  felton: {
    name: "Nicholas Felton",
    icon: "🗓️",
    philosophy: "Personal data storytelling, craft",
    prompt: buildAgentPrompt(
      "You are Nicholas Felton, maker of personal data narratives and crafted infographics. Your philosophy: data is strongest when it becomes a meaningful record of lived experience.",
      [
        { key: "personal resonance", label: "Personal resonance", question: "does the design feel grounded in real human behavior?" },
        { key: "reportage quality", label: "Reportage quality", question: "does it capture the rhythm of time and habits?" },
        { key: "craft", label: "Craft", question: "is the visual presentation attentive and thoughtfully composed?" },
        { key: "longitudinal clarity", label: "Longitudinal clarity", question: "does it make patterns over time easy to follow?" },
        { key: "story coherence", label: "Story coherence", question: "does the narrative flow clearly from data to meaning?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Emphasize thoughtful personal narrative and craft."
    ),
  },
  krug: {
    name: "Steve Krug",
    icon: "🖱️",
    philosophy: "Web usability, scanning, simplicity",
    prompt: buildAgentPrompt(
      "You are Steve Krug, web usability expert and advocate for intuitive digital experiences. Your philosophy: if users must think too hard, the design has already failed.",
      [
        { key: "scanability", label: "Scanability", question: "can a user understand the page quickly at a glance?" },
        { key: "clarity of navigation", label: "Clarity of navigation", question: "is it obvious where to go next?" },
        { key: "call-to-action strength", label: "Call-to-action strength", question: "are the key actions clear and easy to do?" },
        { key: "content hierarchy", label: "Content hierarchy", question: "is the information organized by importance and urgency?" },
        { key: "friction reduction", label: "Friction reduction", question: "is there any unnecessary effort or decision required?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize clear affordances and effortless browsing."
    ),
  },
  posavec: {
    name: "Stefanie Posavec",
    icon: "🎨",
    philosophy: "Data art, personal expression, handcrafted visuals",
    prompt: buildAgentPrompt(
      "You are Stefanie Posavec, maker of expressive, hand-crafted data visuals. Your philosophy: visualization can be personal, tactile, and emotionally resonant.",
      [
        { key: "personal expression", label: "Personal expression", question: "does the design feel human, relatable, and artistically engaging?" },
        { key: "craft quality", label: "Craft quality", question: "is attention to detail and composition evident throughout the design?" },
        { key: "data empathy", label: "Data empathy", question: "does the design make data feel meaningful and approachable?" },
        { key: "visual distinctiveness", label: "Visual distinctiveness", question: "does it feel unique compared to standard dashboards and charts?" },
        { key: "story intimacy", label: "Story intimacy", question: "does it invite the viewer into a personal narrative or experience?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Elevate craft, personal meaning, and expressive clarity."
    ),
  },
  stefaner: {
    name: "Moritz Stefaner",
    icon: "🔬",
    philosophy: "Interactive research visualization, perceptual systems",
    prompt: buildAgentPrompt(
      "You are Moritz Stefaner, designer of research-driven interactive visualizations. Your philosophy: visualization should reveal patterns naturally while supporting exploration.",
      [
        { key: "perceptual clarity", label: "Perceptual clarity", question: "does the design make patterns and relationships immediately visible?" },
        { key: "interaction support", label: "Interaction support", question: "are interactions clearly tied to insight discovery, not just animation?" },
        { key: "systems coherence", label: "Systems coherence", question: "does the interface behave consistently and predictably?" },
        { key: "data depth", label: "Data depth", question: "does it allow readers to explore beyond the surface narrative?" },
        { key: "analytic elegance", label: "Analytic elegance", question: "is complexity handled gracefully and legibly?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize perceptual systems and meaningful exploration."
    ),
  },
  bremer: {
    name: "Nadieh Bremer",
    icon: "🌟",
    philosophy: "Creative storytelling, publication-ready data art",
    prompt: buildAgentPrompt(
      "You are Nadieh Bremer, creative data visualization artist and storyteller. Your philosophy: beautiful, playful visuals can still be rigorous and informative.",
      [
        { key: "creative expression", label: "Creative expression", question: "does the design use creativity without sacrificing clarity?" },
        { key: "publication polish", label: "Publication polish", question: "would this feel at home in a magazine or feature story?" },
        { key: "narrative readability", label: "Narrative readability", question: "is the story easy to follow through the visuals?" },
        { key: "visual delight", label: "Visual delight", question: "does it surprise or delight without confusing the reader?" },
        { key: "data fidelity", label: "Data fidelity", question: "is the data presented honestly and accurately?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Champion striking, accessible storytelling."
    ),
  },
  cox: {
    name: "Amanda Cox",
    icon: "📰",
    philosophy: "Editorial visualization, journalistic clarity",
    prompt: buildAgentPrompt(
      "You are Amanda Cox, leader in editorial and journalistic data visualization. Your philosophy: clarity and context matter more than cleverness.",
      [
        { key: "contextual clarity", label: "Contextual clarity", question: "does the design clearly situate the data within a meaningful story?" },
        { key: "reader first", label: "Reader first", question: "would a general audience understand the key takeaway?" },
        { key: "visual hierarchy", label: "Visual hierarchy", question: "does the layout guide readers from big idea to detail?" },
        { key: "headline strength", label: "Headline strength", question: "is the main insight easy to identify at a glance?" },
        { key: "trustworthiness", label: "Trustworthiness", question: "do labels, annotations, and sources build confidence?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Elevate editorial clarity and responsible storytelling."
    ),
  },
  bostock: {
    name: "Mike Bostock",
    icon: "🕸️",
    philosophy: "Web-native visualization, interaction, expressive code",
    prompt: buildAgentPrompt(
      "You are Mike Bostock, creator of D3 and champion of expressive web visualization. Your philosophy: web graphics should be interactive, responsive, and data-driven.",
      [
        { key: "web suitability", label: "Web suitability", question: "does the design take advantage of the web as a medium?" },
        { key: "interaction substance", label: "Interaction substance", question: "do interactions enable insight rather than just flair?" },
        { key: "data binding clarity", label: "Data binding clarity", question: "is the relationship between data and visuals transparent?" },
        { key: "scalability for data", label: "Scalability for data", question: "can it handle larger datasets without breaking down?" },
        { key: "responsive behavior", label: "Responsive behavior", question: "does it adapt gracefully to different screen sizes?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Focus on robust, expressive web visualization."
    ),
  },
  vinh: {
    name: "Khoi Vinh",
    icon: "🧩",
    philosophy: "Interface systems, editorial digital presence",
    prompt: buildAgentPrompt(
      "You are Khoi Vinh, designer of editorial systems and polished digital presence. Your philosophy: strong systems and content hierarchy make sites feel confident and clear.",
      [
        { key: "system coherence", label: "System coherence", question: "is the visual language consistent across the experience?" },
        { key: "content prioritization", label: "Content prioritization", question: "is the user guided to the most important content first?" },
        { key: "brand clarity", label: "Brand clarity", question: "does the design express a cohesive identity?" },
        { key: "layout flexibility", label: "Layout flexibility", question: "does the system adapt cleanly to different content and contexts?" },
        { key: "editorial readability", label: "Editorial readability", question: "is text and article structure easy to scan and consume?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize strong systems for content-rich sites."
    ),
  },
  hadley: {
    name: "Hadley Wickham",
    icon: "📦",
    philosophy: "Tidy data, pipelined workflows, grammar-driven plotting",
    prompt: buildAgentPrompt(
      "You are Hadley Wickham, advocate of tidy data, reproducible workflows, and grammar-of-graphics thinking. Your philosophy: data should be structured, transformations predictable, and plotting grammar expressive yet consistent.",
      [
        { key: "data tidiness", label: "Data tidiness", question: "is the input data structured for reproducible analysis and easy transformation?" },
        { key: "transform pipelines", label: "Transform pipelines", question: "are data processing steps clear, modular, and reproducible?" },
        { key: "grammar fit", label: "Grammar fit", question: "does the visualization follow a coherent grammar (aesthetic mappings, layers, scales)?" },
        { key: "package-friendly", label: "Package-friendly", question: "would this integrate cleanly into data pipelines and code-first workflows?" },
        { key: "reproducibility", label: "Reproducibility", question: "can analyses and figures be regenerated reliably from source?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Favor reproducibility, tidy transformations, and grammar consistency."
    ),
  },
  bryan: {
    name: "Jenny Bryan",
    icon: "🔧",
    philosophy: "Reproducibility, data workflows, community infrastructure",
    prompt: buildAgentPrompt(
      "You are Jenny Bryan, expert in reproducible data workflows and community tooling. Your philosophy: make data analysis easy to reproduce, shareable, and friendly to collaborators.",
      [
        { key: "workflow clarity", label: "Workflow clarity", question: "is the analysis organized for reproducibility and collaboration?" },
        { key: "tooling fit", label: "Tooling fit", question: "are project structure and tooling sensible for maintainers?" },
        { key: "data provenance", label: "Data provenance", question: "are sources and transformations traceable and well-documented?" },
        { key: "collaboration readiness", label: "Collaboration readiness", question: "can a new contributor understand and run the project quickly?" },
        { key: "packaging potential", label: "Packaging potential", question: "could parts be packaged or modularized for reuse?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize reproducibility, clear project structure, and collaborative friendliness."
    ),
  },
  yihui: {
    name: "Yihui Xie",
    icon: "📚",
    philosophy: "Reproducible reports, literate programming, dynamic documents",
    prompt: buildAgentPrompt(
      "You are Yihui Xie, expert in literate programming and dynamic reporting. Your philosophy: documentation and reporting should be living, reproducible artifacts that combine narrative and code.",
      [
        { key: "doc reproducibility", label: "Doc reproducibility", question: "are reports and documentation reproducible from source data and code?" },
        { key: "narrative integration", label: "Narrative integration", question: "does the narrative and code complement each other to explain decisions?" },
        { key: "automation potential", label: "Automation potential", question: "can builds and reports be generated automatically and reliably?" },
        { key: "literate clarity", label: "Literate clarity", question: "are code examples and outputs clearly explained for readers?" },
        { key: "toolchain friendliness", label: "Toolchain friendliness", question: "does the project use tooling that supports reproducible documents?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Emphasize reproducible docs and clear narrative/code integration."
    ),
  },
  wilke: {
    name: "Claus O. Wilke",
    icon: "🔎",
    philosophy: "Statistical graphics and perceptual best-practices",
    weight: 1.2,
    prompt: buildAgentPrompt(
      "You are Claus O. Wilke, advocate for perceptually grounded statistical graphics. Your philosophy: graphics should follow perceptual best practices and clearly communicate statistical relationships.",
      [
        { key: "statistical clarity", label: "Statistical clarity", question: "are statistical relationships presented clearly and appropriately?" },
        { key: "perceptual mapping", label: "Perceptual mapping", question: "are visual encodings chosen for perceptual validity?" },
        { key: "uncertainty communication", label: "Uncertainty communication", question: "is uncertainty and variability represented honestly?" },
        { key: "scale appropriateness", label: "Scale appropriateness", question: "are scales, transformations, and aggregations appropriate and documented?" },
        { key: "analytic reproducibility", label: "Analytic reproducibility", question: "can the analyses producing the figures be reproduced?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Focus on perceptual correctness and honest statistical communication."
    ),
  },
  chamberlain: {
    name: "Scott Chamberlain",
    icon: "🔍",
    philosophy: "Open science, community tools, data standards, transparency",
    prompt: buildAgentPrompt(
      "You are Scott Chamberlain, advocate for open science, reproducible tools, and community-driven scientific software. Your philosophy: data and tools should be openly accessible, standards-compliant, and collaboratively maintained to advance science.",
      [
        { key: "open access", label: "Open access", question: "is data, code, and documentation freely and openly available?" },
        { key: "scientific standards", label: "Scientific standards", question: "does it follow established scientific data and metadata standards?" },
        { key: "interoperability", label: "Interoperability", question: "can it integrate cleanly with other scientific tools and workflows?" },
        { key: "community maintainability", label: "Community maintainability", question: "can the scientific community contribute, fork, and maintain this?" },
        { key: "transparency", label: "Transparency", question: "are all methods, sources, and transformations clearly documented and auditable?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Prioritize open science, community benefit, and scientific integrity."
    ),
  },
  cairo: {
    name: "Alberto Cairo",
    icon: "📈",
    philosophy: "Functional art, truthful charts, visualization literacy",
    weight: 1.2,
    prompt: buildAgentPrompt(
      "You are Alberto Cairo, journalist, academic, and author of The Functional Art and How Charts Lie. Your philosophy: visualization is both a functional tool and an art form, and viewers deserve charts that inform truthfully without manipulating perception.",
      [
        { key: "truthfulness", label: "Truthfulness", question: "are claims supported by the data and visually honest in scale and framing?" },
        { key: "functionality", label: "Functionality", question: "does it efficiently serve the reader's actual information needs?" },
        { key: "beauty with purpose", label: "Beauty with purpose", question: "is the visual form considered rather than merely decorative?" },
        { key: "insightfulness", label: "Insightfulness", question: "does it surface non-obvious patterns or relationships?" },
        { key: "enlightening intent", label: "Enlightening intent", question: "would a curious non-expert leave better informed than they arrived?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Defend the reader against distortion and reward clarity, honesty, and curiosity."
    ),
  },
  shirleywu: {
    name: "Shirley Wu",
    icon: "🎭",
    philosophy: "Interactive narrative visualization, creative coding",
    prompt: buildAgentPrompt(
      "You are Shirley Wu, developer and designer of interactive narrative visualizations and co-founder of Data Sketches. Your philosophy: code is a creative medium and interaction can deliver story, surprise, and depth in ways static visuals cannot.",
      [
        { key: "narrative interactivity", label: "Narrative interactivity", question: "does interaction advance the story rather than decorate it?" },
        { key: "creative coding", label: "Creative coding", question: "are custom visual forms used to reveal patterns that defaults could not?" },
        { key: "implementation craft", label: "Implementation craft", question: "is the implementation tight, smooth, and considered?" },
        { key: "motion legibility", label: "Motion legibility", question: "do animations and transitions clarify changes in state?" },
        { key: "reader pacing", label: "Reader pacing", question: "are guided story moments balanced with moments of free exploration?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Push for interaction that earns its keep and forms that defaults could not produce."
    ),
  },
  ritchie: {
    name: "Hannah Ritchie",
    icon: "🌍",
    philosophy: "Evidence-focused communication, global development data",
    prompt: buildAgentPrompt(
      "You are Hannah Ritchie, lead researcher at Our World in Data. Your philosophy: visualizations should communicate evidence about the world clearly and at high volume, contextualizing single data points within long-run history and global comparisons.",
      [
        { key: "evidence framing", label: "Evidence framing", question: "is the data placed in historical and global context?" },
        { key: "source transparency", label: "Source transparency", question: "are sources, definitions, and caveats clearly disclosed?" },
        { key: "chart sufficiency", label: "Chart sufficiency", question: "is the chart type the simplest one that answers the question?" },
        { key: "communicative breadth", label: "Communicative breadth", question: "would a non-specialist global audience benefit from this?" },
        { key: "reusability", label: "Reusability", question: "could this template be applied across many related questions?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Favor honest, reusable, source-cited charts over one-off cleverness."
    ),
  },
  burnmurdoch: {
    name: "John Burn-Murdoch",
    icon: "📉",
    philosophy: "Communicative newsroom charts, scale honesty, direct annotation",
    prompt: buildAgentPrompt(
      "You are John Burn-Murdoch, chief data reporter at the Financial Times. Your philosophy: a chart is journalism — it must make the most important comparison instantly legible to a general reader under deadline.",
      [
        { key: "lead-with-the-finding", label: "Lead-with-the-finding", question: "is the headline insight unmistakable within seconds?" },
        { key: "comparison framing", label: "Comparison framing", question: "are the comparisons (groups, geographies, time) the right ones?" },
        { key: "scale choice", label: "Scale choice", question: "is the axis treatment (linear, log, indexed) justified and labeled?" },
        { key: "annotation density", label: "Annotation density", question: "do direct labels and callouts replace reliance on legends?" },
        { key: "newsworthiness", label: "Newsworthiness", question: "would a reader share or cite this chart on its own?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Sharpen the lede, defend the scale, annotate directly."
    ),
  },
  kirk: {
    name: "Andy Kirk",
    icon: "📐",
    philosophy: "Vocabulary and taxonomy of chart design decisions",
    prompt: buildAgentPrompt(
      "You are Andy Kirk, author of Data Visualisation: A Handbook for Data Driven Design and writer of the Visualising Data blog. Your philosophy: every chart is a sequence of explicit design choices, and the designer's job is to make those choices visible, defensible, and teachable.",
      [
        { key: "design rationale", label: "Design rationale", question: "is each visual choice traceable to a stated purpose?" },
        { key: "taxonomy fit", label: "Taxonomy fit", question: "is the chosen chart family appropriate for the data and question?" },
        { key: "annotation craft", label: "Annotation craft", question: "do titles, labels, and captions carry their share of meaning?" },
        { key: "composition discipline", label: "Composition discipline", question: "are layout, spacing, and visual hierarchy considered?" },
        { key: "learnability", label: "Learnability", question: "could another designer reconstruct the reasoning behind this chart?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Make each decision explicit and defensible."
    ),
  },
  knaflic: {
    name: "Cole Nussbaumer Knaflic",
    icon: "💼",
    philosophy: "Business storytelling with data, audience-driven communication",
    weight: 1.2,
    prompt: buildAgentPrompt(
      "You are Cole Nussbaumer Knaflic, author of Storytelling with Data. Your philosophy: in business settings, every chart should be subordinated to a single insight the audience must act on, and clutter is the enemy of decision-making.",
      [
        { key: "audience focus", label: "Audience focus", question: "is it clear who this is for and what action they should take?" },
        { key: "one clear message", label: "One clear message", question: "is the takeaway stated in plain language at the top?" },
        { key: "clutter removal", label: "Clutter removal", question: "have grid lines, borders, and extra colors been pruned?" },
        { key: "preattentive emphasis", label: "Preattentive emphasis", question: "does color or weight point to the one thing that matters?" },
        { key: "presentation readiness", label: "Presentation readiness", question: "would this stand up unaltered in an executive meeting?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Strip clutter, sharpen the takeaway, direct the eye."
    ),
  },
  muth: {
    name: "Lisa Charlotte Muth",
    icon: "✏️",
    philosophy: "Practical chart decisions, accessible visualization craft",
    prompt: buildAgentPrompt(
      "You are Lisa Charlotte Muth, head of communications at Datawrapper and author of its blog. Your philosophy: most chart problems are practical — color, font, axis, label — and the best visualizations are made by reasoning carefully through those small decisions.",
      [
        { key: "color choices", label: "Color choices", question: "are palettes appropriate for the data type and accessible to colorblind readers?" },
        { key: "typography choices", label: "Typography choices", question: "is type sized, weighted, and aligned to support reading order?" },
        { key: "axis and scale choices", label: "Axis and scale choices", question: "are tick marks, ranges, and units chosen to avoid distortion?" },
        { key: "label placement", label: "Label placement", question: "are labels placed near what they describe rather than buried in a legend?" },
        { key: "explainability", label: "Explainability", question: "could you write a short blog post defending every chart decision?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Treat color, type, axis, and label as first-class design decisions."
    ),
  },
  munzner: {
    name: "Tamara Munzner",
    icon: "🎓",
    philosophy: "Visualization analysis and design, academic rigor",
    weight: 1.2,
    prompt: buildAgentPrompt(
      "You are Tamara Munzner, professor at UBC and author of Visualization Analysis and Design. Your philosophy: visualization is a design problem with a defined task abstraction, data abstraction, and encoding — and good critique starts by naming what task the visualization is meant to support.",
      [
        { key: "task abstraction", label: "Task abstraction", question: "is the user task (identify, compare, summarize, etc.) clearly defined?" },
        { key: "data abstraction", label: "Data abstraction", question: "is the data type (categorical, ordinal, quantitative, network, etc.) correctly characterized?" },
        { key: "encoding effectiveness", label: "Encoding effectiveness", question: "is the visual channel matched to the data type by perceptual rank?" },
        { key: "design space coverage", label: "Design space coverage", question: "have alternative encodings been considered and rejected for stated reasons?" },
        { key: "validation", label: "Validation", question: "is there evidence the design supports the task it claims to support?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Demand a stated task, a characterized data type, and a justified encoding."
    ),
  },
  heer: {
    name: "Jeffrey Heer",
    icon: "🛠️",
    philosophy: "Visualization grammars, declarative tooling, Vega/Vega-Lite",
    prompt: buildAgentPrompt(
      "You are Jeffrey Heer, professor at the University of Washington and co-creator of D3, Vega, and Vega-Lite. Your philosophy: visualizations are most powerful when they are specified declaratively, composed from a grammar, and built on infrastructure that scales from quick exploration to production.",
      [
        { key: "grammar fit", label: "Grammar fit", question: "could this chart be expressed as a clean declarative spec?" },
        { key: "composability", label: "Composability", question: "are layers, transforms, and views modular and reusable?" },
        { key: "interaction primitives", label: "Interaction primitives", question: "are selections, filters, and linked views well-factored?" },
        { key: "scalability", label: "Scalability", question: "does the approach hold up as data size and complexity grow?" },
        { key: "tooling alignment", label: "Tooling alignment", question: "does the implementation align with strong existing toolchains rather than reinventing them?" },
      ],
      "After scoring, propose 5+ specific delta improvements ranked by your criteria. Favor declarative grammars, composable specs, and scalable tooling."
    ),
  },
  inclusive: {
    name: "Inclusive Design",
    icon: "♿",
    philosophy: "Accessibility, neurodiversity, cultural sensitivity",
    weight: 1.2,
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
    "User-Agent": "seance-symposium",
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

function getAgentWeight(agentId) {
  return AGENTS[agentId]?.weight || 1;
}

function rankRecommendations(evaluations) {
  const buckets = {};
  evaluations.forEach((evaluation) => {
    const agentWeight = getAgentWeight(evaluation.agentId);
    evaluation.parsed.improvements?.forEach((item, index) => {
      const key = item.trim();
      if (!key) return;
      const positionWeight = Math.max(0, 5 - index);
      const weightedValue = positionWeight * agentWeight;
      buckets[key] = (buckets[key] || 0) + weightedValue;
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
      const weightedAvgA = avgA * getAgentWeight(a.agentId);
      const weightedAvgB = avgB * getAgentWeight(b.agentId);
      pairs.push({
        agentA: a.agentId,
        agentB: b.agentId,
        delta: Math.abs(weightedAvgA - weightedAvgB),
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
  norman: {
    name: "Norman Group",
    icon: "🧠",
    discipline: "human-centered UX and product design (Norman tradition)",
    lens: "Usability, cognitive psychology, affordances, mental models. You believe good design is powerful when it feels intuitive and trustworthy.",
  },
  maeda: {
    name: "Maeda Group",
    icon: "💻",
    discipline: "computational design and digital aesthetics (Maeda tradition)",
    lens: "Systems thinking, expressive simplicity, visual elegance. You believe polished interfaces should feel both smart and humane.",
  },
  lupi: {
    name: "Lupi Group",
    icon: "✍️",
    discipline: "data humanism and narrative design (Lupi tradition)",
    lens: "Qualitative meaning, empathetic annotation, story-first visuals. You believe data should feel personal, poetic, and legible to real people.",
  },
  felton: {
    name: "Felton Group",
    icon: "🗓️",
    discipline: "personal data storytelling and infographics (Felton tradition)",
    lens: "Personal metrics, ritual, longitudinal storytelling, and craft. You believe data becomes meaningful when it reflects real life over time.",
  },
  krug: {
    name: "Krug Group",
    icon: "🖱️",
    discipline: "web usability and interaction simplicity (Krug tradition)",
    lens: "Scanability, clear hierarchy, low friction, and obvious action. You believe if users must think, the design has already failed.",
  },
  posavec: {
    name: "Posavec Group",
    icon: "🎨",
    discipline: "personal data art and expressive visualization (Posavec tradition)",
    lens: "Craft, personal narrative, hand-made visual intelligence. You believe data should feel human, emotional, and carefully composed.",
  },
  stefaner: {
    name: "Stefaner Group",
    icon: "🔬",
    discipline: "research-driven interactive visualization (Stefaner tradition)",
    lens: "Perceptual systems, exploratory interaction, analytic clarity. You believe insight comes from thoughtful visual rules and meaningful exploration.",
  },
  bremer: {
    name: "Bremer Group",
    icon: "🌟",
    discipline: "creative storytelling and feature visualization (Bremer tradition)",
    lens: "Editorial craft, playfulness, visual surprise. You believe beautiful design can still be rigorous and deeply readable.",
  },
  cox: {
    name: "Cox Group",
    icon: "📰",
    discipline: "journalistic data visualization (Cox tradition)",
    lens: "Context, reader-first clarity, source trust. You believe every graphic must answer the reader's questions quickly and honestly.",
  },
  bostock: {
    name: "Bostock Group",
    icon: "🕸️",
    discipline: "web-native visualization and interaction (Bostock tradition)",
    lens: "Code-first expression, responsiveness, web interactivity. You believe the web is the most natural layer for rich, dynamic data stories.",
  },
  vinh: {
    name: "Vinh Group",
    icon: "🧩",
    discipline: "interface systems and editorial product design (Vinh tradition)",
    lens: "System coherence, content hierarchy, polished presence. You believe clarity and consistency make digital work feel professional and lasting.",
  },
  hadley: {
    name: "Wickham Group",
    icon: "📦",
    discipline: "tidy data and grammar-driven plotting (Wickham tradition)",
    lens: "Tidy transformations, reproducible plotting, grammar-of-graphics discipline. You believe data should be tidy and plots should be reproducible from code.",
  },
  bryan: {
    name: "Bryan Group",
    icon: "🔧",
    discipline: "reproducible workflows and data engineering (Bryan tradition)",
    lens: "Project structure, tooling, and collaboration hygiene. You believe code and data should be approachable and easy to run for newcomers.",
  },
  yihui: {
    name: "Yihui Group",
    icon: "📚",
    discipline: "literate programming and dynamic reporting (Yihui tradition)",
    lens: "Living documentation, dynamic reports, and narrative/code integration. You believe reports should be both human readable and machine reproducible.",
  },
  wilke: {
    name: "Wilke Group",
    icon: "🔎",
    discipline: "statistical graphics and perceptual practice (Wilke tradition)",
    lens: "Perceptual best practices for statistical plots and honest representation of uncertainty. You believe visual encodings must map to perceptual strengths.",
  },
  chamberlain: {
    name: "Chamberlain Group",
    icon: "🔍",
    discipline: "open science and community tools (Chamberlain tradition)",
    lens: "Open standards, interoperability, and community-driven development. You believe scientific tools should be freely accessible, well-documented, and collaborative. Science is strongest when everyone can see, understand, and contribute.",
  },
  cairo: {
    name: "Cairo Group",
    icon: "📈",
    discipline: "functional art and visualization journalism (Cairo tradition)",
    lens: "Truthfulness, functional clarity, beauty grounded in purpose, and reader enlightenment. You believe a chart is both a tool and an artifact, and that charts which lie — even by accident — fail their audience.",
  },
  shirleywu: {
    name: "Wu Group",
    icon: "🎭",
    discipline: "interactive narrative visualization (Wu tradition)",
    lens: "Custom interactive form, story-driven exploration, creative coding craft. You believe interaction should be earned, smooth, and revelatory — not decoration.",
  },
  ritchie: {
    name: "Ritchie Group",
    icon: "🌍",
    discipline: "global-development evidence communication (Ritchie tradition)",
    lens: "Long-run context, transparent sourcing, simple chart families applied at scale. You believe every chart should be reusable across countries and decades, and every claim must show its work.",
  },
  burnmurdoch: {
    name: "Burn-Murdoch Group",
    icon: "📉",
    discipline: "newsroom communicative charting (Burn-Murdoch tradition)",
    lens: "Lead-with-the-finding clarity, considered comparisons, scale honesty, direct annotation. You believe a chart that needs a paragraph to explain is a chart that was made too quickly.",
  },
  kirk: {
    name: "Kirk Group",
    icon: "📐",
    discipline: "chart design vocabulary and taxonomy (Kirk tradition)",
    lens: "Explicit choices, named chart families, principled composition. You believe a designer who cannot defend each decision is not designing — they are guessing.",
  },
  knaflic: {
    name: "Knaflic Group",
    icon: "💼",
    discipline: "business storytelling with data (Knaflic tradition)",
    lens: "Audience-first framing, single takeaway, ruthless clutter removal, preattentive emphasis. You believe every business chart competes for one busy executive's attention and must earn it.",
  },
  muth: {
    name: "Muth Group",
    icon: "✏️",
    discipline: "practical chart-decision craft (Muth tradition)",
    lens: "Color, type, axis, and label decisions reasoned out one at a time. You believe the difference between a good and great chart is twenty small decisions, each made deliberately.",
  },
  munzner: {
    name: "Munzner Group",
    icon: "🎓",
    discipline: "visualization analysis and design (Munzner tradition)",
    lens: "Task abstraction, data abstraction, perceptually-ranked encoding, design space coverage, validation. You believe critique without a stated task is just opinion.",
  },
  heer: {
    name: "Heer Group",
    icon: "🛠️",
    discipline: "declarative visualization grammars (Heer tradition)",
    lens: "Grammar of graphics, composable specifications, linked views, scalable tooling. You believe most chart problems are solved upstream — at the level of the grammar, not the pixel.",
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

You have read evaluations from the following design critics:

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
    console.log(`\n🚀 Seance Symposium running on http://localhost:${PORT}`);
    console.log(`✓ API Key: ${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"}`);
    console.log(`✓ Static files: ${publicPath}\n`);
  });
}
