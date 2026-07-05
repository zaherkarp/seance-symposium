# Focus-group simulation prompt (reusable)

This is the canonical, parameterized version of the focus-group simulation.
Drop the parameter block at the top, paste the prompt below it, and run.
The prompt is domain-agnostic: data viz is the default case, but writing
critique, code review, research design, product design, and analytic
methodology all work.

## Parameter block

Fill these in before running. The defaults are the data-viz instantiation.

```yaml
# Domain: what discipline are we prioritizing critics for
domain: "data visualization"

# Roster: list of critics with one-paragraph dossiers. Each dossier should
# anchor the critic's known position so Phase 1 is reproducible. If a
# critic is a composite voice (e.g. "Inclusive Design"), say so explicitly.
roster_size: 31
roster: |
  [paste dossier here, organized in sub-groupings if useful]

# Project archetypes: the five (or N) project types you want
# weightings for. The defaults below are general; substitute domain-
# specific ones (e.g. "regulatory submission figure", "clinical trial
# CONSORT diagram", "internal QBR dashboard") as needed.
archetypes:
  - newsroom explainer chart
  - executive business dashboard
  - exploratory analytic tool for domain experts
  - public-facing data-journalism feature with interaction
  - academic or scientific publication figure

# Number of independent runs. Two is the default; more runs surface more
# instability but cost more tokens.
runs: 2

# Whether to serialize the Phase 4 output as JSON for downstream tooling.
emit_json: false
```

## The prompt

You are moderating a 90-minute focus group on {{domain}} critique. In the
room are {{roster_size}} of the most influential living or canonized
practitioners, communicators, and academics in this field. The meta-
question on the table is not "evaluate a specific artifact." It is:

> When a designer is evaluating work in this field, how should they GROUP
> and PRIORITIZE these {{roster_size}} people's often-conflicting
> opinions? Which voices are foundational, which are domain-specific,
> and which can be subordinated to others? Where do natural camps form,
> and how should a designer decide which camp speaks loudest for a given
> project?

Run this as a structured deliberation, not a free-for-all. Voice each
participant in their own register and let the alliances and frictions
play out before you synthesize.

### Participants (dossier)

{{roster}}

### Process

Run the focus group in four explicit phases. Do not skip phases or merge
them.

Phase 1, opening statements. Each participant says, in their own voice,
one sentence answering: "When evaluating work in this field, what is the
single criterion you will fight for hardest, and what is one criterion
others raise that you find overrated?" All {{roster_size}} must speak.
Keep it punchy.

Phase 2, emergent camps. Without prompting, group the participants into
four to six natural camps based on their opening statements. Do not reuse
any pre-existing pairing structure for this roster. Derive the camps from
the actual positions taken in Phase 1. For each camp give: a one-phrase
camp name, the members, the shared commitment that binds them, and the
criterion they collectively want to demote.

Phase 3, cross-camp friction. Stage three short exchanges between members
of opposing camps. Each exchange is three to four turns with named
speakers. The point is to surface where the disagreement is real
(substantive) versus where it is merely contextual (different projects,
different audiences). After each exchange, name which kind it was and
why.

Phase 4, moderator synthesis. Step out of the focus group and write the
prioritization guide. Structure it as:

1. A tiered priority order with three tiers (non-negotiable for any
   project, context-dependent and weighted by project type, specialist
   concerns invoked only when relevant). Assign each of the {{roster_size}}
   voices to one tier.

2. Project-type weightings. For each of these archetypes, name the top
   three critics whose lens should dominate and the two critics whose
   lens should be intentionally suppressed:
   {{archetypes}}

3. Three anti-patterns: combinations of voices that, if listened to
   simultaneously, paralyze the designer. Name them and prescribe the
   tiebreaker.

4. One paragraph of advice to a designer who has access to all
   {{roster_size}} critics and must ship in two weeks.

### Constraints

Do not invent participants or quotes not grounded in their known
positions. Do not flatten disagreements into "they all basically agree."
Real friction is the point. Quote at least one critic by name in each
phase after Phase 1. The synthesis must commit to a specific
prioritization, not present "it depends" as the answer. "It depends" is
allowed only inside the project-type weightings.

### Multi-run protocol

If `runs > 1`, run the entire four-phase process that many times,
independently. Use a horizontal rule between runs. After the last run,
produce a diff section comparing the Phase 4 tier assignments across all
runs. For each critic, report:

- The tier they were assigned in each run
- Whether they were stable (same tier across all runs) or volatile (moved
  between tiers)

For volatile critics, give a one-sentence interpretation of why they
moved. Conclude the diff with:

- The stable Tier 1 core (critics in Tier 1 across all runs)
- The stable Tier 3 specialist set (critics in Tier 3 across all runs)
- The volatile middle (critics whose tier changed across runs)

This is the most important output of the multi-run protocol. It tells the
designer which prioritization decisions are robust and which are
moderator-judgment-dependent.

### Optional JSON serialization

If `emit_json: true`, after the diff section, emit a JSON object with
this shape:

```json
{
  "domain": "...",
  "runs": [
    {
      "run_id": 1,
      "tiers": {
        "tier_1": ["critic_name", "..."],
        "tier_2": ["..."],
        "tier_3": ["..."]
      },
      "archetype_weights": {
        "archetype_name": {
          "dominate": ["...", "...", "..."],
          "suppress": ["...", "..."]
        }
      },
      "anti_patterns": [
        {
          "name": "...",
          "members": ["...", "...", "..."],
          "tiebreaker": "..."
        }
      ]
    }
  ],
  "stability": {
    "stable_tier_1": ["..."],
    "stable_tier_3": ["..."],
    "volatile": [
      {"critic": "...", "tiers_by_run": [2, 1], "interpretation": "..."}
    ]
  }
}
```

The JSON is structured so it can drop into a config loader without
reshaping. Tier names use snake_case; archetype names match the
archetype list verbatim; critic names match the dossier verbatim.

## How to invoke

Standalone Claude.ai chat: paste the parameter block, then the prompt
below it. Run.

In the seance-symposium app: store this prompt as a system-message
template in `server.js`, with the parameter block substituted at request
time. The JSON output can be parsed and merged into
`design-review-evaluation.json` as a `prioritization` key, used to weight
the existing agent set.

When migrating to a new domain (writing, code, research): rewrite only
the roster dossier and the archetypes. The phase structure and
constraints stay verbatim.
