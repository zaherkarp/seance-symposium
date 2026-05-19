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

2. **Run evaluation**: All 6 agents evaluate in parallel

3. **View results**:
   - Agent scores and top proposals
   - Ranked choice voting (top 3 aggregate proposals)
   - Conflict map (where agents disagree most)
   - Full deliberation (read each agent's full analysis)

## The 6 Agents

- **Edward Tufte** (📊): Minimalism, clarity, precision, data-ink ratio
- **Hans Rosling** (🎬): Narrative, engagement, accessibility, story
- **Jacques Bertin** (🧬): Systematic rigor, semiotic correctness, perceptual science
- **Stephen Few** (⚙️): Pragmatism, business value, performance, maintainability
- **Ben Shneiderman** (🎮): Interactivity, user agency, exploration, control
- **Inclusive Design** (♿): Accessibility, neurodiversity, cultural sensitivity

## Evaluating Git Repos

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
