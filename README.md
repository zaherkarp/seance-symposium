# Seance Symposium - Setup Guide

## Quick Start

### 1. Set your API key as an environment variable

```bash
export ANTHROPIC_API_KEY="sk-your-key-here"
```

Or on Windows (PowerShell):
```powershell
$env:ANTHROPIC_API_KEY="sk-your-key-here"
```

Get your key from: https://console.anthropic.com/account/keys

### 2. Install dependencies

```bash
npm install
```

### 3. Run the app

```bash
npm start
```

The app will start on `http://localhost:3000`

## How It Works

**Frontend**: A single HTML file loaded via Express that runs 100% in the browser (React via CDN)
**Backend**: Node.js/Express server that:
- Handles all API calls to Claude (your key stays server-side)
- Clones and analyzes git repositories
- Returns evaluations to the frontend

**No API key exposure**: Your Anthropic API key is never sent to the browser—all calls happen server-to-server.

## Using the App

1. **Input a design** via one of three methods:
   - Text brief (describe the design concept)
   - Image URLs (screenshots, mockups)
   - Git repo URL (with sample or full codebase analysis)

2. **Run evaluation**: All agents evaluate in parallel

3. **View results**:
   - Agent scores and top proposals
   - Ranked choice voting (top 3 aggregate proposals)
   - Conflict map (where agents disagree most)
   - Full deliberation (read each agent's full analysis)

## The Agents

- **Edward Tufte** (📊): Minimalism, clarity, precision, data-ink ratio
- **Hans Rosling** (🎬): Narrative, engagement, accessibility, story
- **Jacques Bertin** (🧬): Systematic rigor, semiotic correctness, perceptual science
- **Stephen Few** (⚙️): Pragmatism, business value, performance, maintainability
- **Ben Shneiderman** (🎮): Interactivity, user agency, exploration, control
- **Don Norman** (🧠): Human-centered usability, affordances, mental models
- **John Maeda** (💻): Computational design, digital elegance, systems thinking
- **Giorgia Lupi** (✍️): Data humanism, narrative meaning, empathetic annotation
- **Nicholas Felton** (🗓️): Personal data storytelling, craft, longitudinal narrative
- **Steve Krug** (🖱️): Web usability, scanability, clear actions
- **Stefanie Posavec** (🎨): Handcrafted data art, personal expression, tactile storytelling
- **Moritz Stefaner** (🔬): Research visualization, perceptual systems, interaction design
- **Nadieh Bremer** (🌟): Creative data storytelling, publication-quality visuals
- **Amanda Cox** (📰): Editorial visualization and journalistic clarity
- **Mike Bostock** (🕸️): Web-native visualization, interaction, D3-style expressiveness
- **Khoi Vinh** (🧩): Interface systems, editorial digital presence, polished hierarchy
- **Hadley Wickham** (📦): Tidy data, grammar-of-graphics, reproducible pipelines
- **Jenny Bryan** (🔧): Reproducible workflows, project structure, data tooling
- **Yihui Xie** (📚): Reproducible documents, literate programming, dynamic reporting
- **Claus O. Wilke** (🔎): Statistical graphics, perceptual best-practices
- **Scott Chamberlain** (🔍): Open science, community tools, data standards, transparency
- **Inclusive Design** (♿): Accessibility, neurodiversity, cultural sensitivity

## Antagonistic Discussion Panels

The agents are grouped into **deliberative panels** designed to create productive tension and reach consensus through diverse perspectives:

### Panel 1: Minimalism vs. Narrative
**Tension**: Data-driven reduction vs. engagement-first storytelling

| Persona | Philosophy | Characteristic Critique |
|---------|-----------|--------------------------|
| **Tufte** | *Remove all non-essential ink* | "This is over-decorated" |
| **Rosling** | *Engage audiences through story* | "This is emotionally inert" |

**Consensus Question**: *How can we tell a clear story without unnecessary decoration?*

---

### Panel 2: Rigor vs. Expressiveness
**Tension**: Systematic encoding rules vs. artistic freedom

| Persona | Philosophy | Characteristic Critique |
|---------|-----------|--------------------------|
| **Bertin** | *Semiotic correctness & visual grammar* | "Visual variables are inconsistently mapped" |
| **Posavec** | *Handcrafted, personal expression* | "This feels designed-by-committee and soulless" |

**Consensus Question**: *Can we be both systematic and emotionally resonant?*

---

### Panel 3: Data Structure vs. Human Feeling
**Tension**: Reproducible pipelines vs. qualitative meaning

| Persona | Philosophy | Characteristic Critique |
|---------|-----------|--------------------------|
| **Hadley** | *Tidy data & grammar-of-graphics* | "This is not reproducible from source data" |
| **Lupi** | *Data humanism & empathetic annotation* | "Where is the human story in these metrics?" |

**Consensus Question**: *How do we encode structure without losing humanity?*

---

### Panel 4: Pragmatism vs. Human Care
**Tension**: Business value & performance vs. holistic user experience

| Persona | Philosophy | Characteristic Critique |
|---------|-----------|--------------------------|
| **Few** | *Business ROI & maintainability* | "This is overengineered for the audience" |
| **Norman** | *Human psychology & affordances* | "This ignores how people actually think" |

**Consensus Question**: *Can we be both efficient and caring?*

---

### Panel 5: Control vs. Exploration
**Tension**: User agency & reversibility vs. computational expressiveness

| Persona | Philosophy | Characteristic Critique |
|---------|-----------|--------------------------|
| **Shneiderman** | *User agency & direct manipulation* | "This removes user control" |
| **Bostock** | *Web-native & expressive code* | "This is too constrained for rich interaction" |

**Consensus Question**: *How can users explore without getting lost?*

---

### Panel 6: Open Science vs. All Perspectives
**Tension**: Open standards & community benefit vs. specialized excellence

| Persona | Philosophy | Characteristic Critique |
|---------|-----------|--------------------------|
| **Chamberlain** | *Open science & community tools* | "Who can maintain this? Is it transparent?" |
| **Domain Expert(s)** | *Specialized excellence in craft* | "Does it meet scientific/design standards?" |

**Consensus Question**: *How do we balance openness with excellence?*

---

### The Deliberation Graph

```
     Tufte ←→ Rosling
       ↑         ↑
       │         │
    Bertin ←→ Posavec
       │         
       │    Hadley ←→ Lupi
       │       ↑        ↑
       │       │        │
      Few ←→ Norman ← Bryan ← Chamberlain
       │       ↑         ↑
       │       │         │
       └── Shneiderman ←→ Bostock
```

**How to use these panels**:
1. Run evaluation with multiple agents
2. Conflicts emerge between natural opponents  
3. Each panel surfaces design trade-offs
4. Consensus around antagonistic pairs = robust design decisions

Each pair creates **productive friction**—where both sides have valid concerns, designers must integrate both perspectives rather than choosing one.

---



Two analysis depths:
- **Sample**: README + directory structure + package.json (fast)
- **Full**: Complete codebase analysis (slow, detailed)

The backend clones the repo, analyzes it, and sends findings to all agents.

## Tips

- Be specific in your text brief—agents infer evaluation criteria based on what you describe
- Image URLs must be publicly accessible (agents can't see your images directly)
- Full repo analysis is thorough but takes longer; start with "Sample" to iterate quickly
- Agents disagree intentionally—that's the feature. Conflict Map shows where.

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Your Anthropic API key

Optional:
- `PORT` - Server port (default: 3000)

## Troubleshooting

**"ANTHROPIC_API_KEY environment variable not set"**
→ Make sure you exported the key before running `npm start`

**"Repository analysis failed"**
→ Ensure the git repo URL is public and valid

**"Evaluation failed"**
→ Check your API key is valid and has remaining credits
