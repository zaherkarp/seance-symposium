# Focus-group simulation methodology

## What this is

A four-phase deliberation protocol for taking a large roster of critics with
overlapping and conflicting positions and producing a defensible
prioritization. The output is a tier assignment plus project-archetype
weightings plus named anti-patterns. The method is run-and-diff: two
independent runs are compared, and the volatile critics (those who change
tiers between runs) are flagged as borderline rather than stably tiered.

The original use case was data visualization critique with a 31-person
panel. The method generalizes to any domain where a large roster of voices
must be reconciled before a designer can ship.

## Why this exists alongside the antagonistic-panels model

The seance-symposium app evaluates a specific design by running parallel
agents and surfacing conflict via six antagonistic pairings (Tufte versus
Rosling, Bertin versus Posavec, and so on). That model works well at
evaluation time: it forces productive friction on a concrete artifact.

It does less well at prioritization time. When a designer asks "which of
these 22 voices should I weight most for an executive dashboard versus a
newsroom explainer," the pairings give equal billing to every voice. They
do not tell you which voices to subordinate.

The focus-group simulation answers that prioritization question. It treats
the panel not as a parallel evaluation engine but as a deliberative body
whose collective output is a ranking. The two methods are complementary:
prioritize first (this method), then evaluate (the existing app, weighted
by the prioritization).

## The four phases

Phase 1 is opening statements. Each critic speaks one line answering what
they will fight hardest for and what they find overrated. The point is to
anchor each voice to their known positions before any interaction occurs.
This phase is intentionally low-variance: across runs, the same critic
should say substantively the same thing, because their position is in their
body of work. If Phase 1 drifts between runs, the prompt is failing to
anchor.

Phase 2 is camp formation. The simulation groups the critics into four to
six natural camps based on Phase 1 positions. The constraint is explicit:
do not reuse the existing pairings. This phase is medium-variance because
some critics genuinely sit on camp boundaries (Cairo can plausibly belong
to editorial clarity or to foundational theory; Heer can sit with encoding
rigorists or with system designers). Where they land affects downstream
synthesis.

Phase 3 is staged friction. Three short exchanges between members of
opposing camps. The discipline here is distinguishing substantive
disagreement (different beliefs) from contextual disagreement (different
projects, different audiences, otherwise compatible). This phase often
collapses apparent conflicts. The Shneiderman versus Cox exchange about
static charts versus interactive tools, for instance, usually resolves once
Wu reframes it as funnel position.

Phase 4 is the moderator's synthesis. Three tiers (non-negotiable,
context-dependent, specialist), five project-archetype weightings (each
with three dominant voices and two suppressed voices), three named
anti-patterns with prescribed tiebreakers, and a one-paragraph two-week
shipping advice. The synthesis must commit. "It depends" is allowed only
inside the project-archetype weightings.

## Run and diff

Phase 1 is anchored to canon, so it is stable. Phase 4 is interpretive, so
it is volatile. The recommended protocol is two independent runs followed
by a diff of the Phase 4 tier assignments. Critics who move between tiers
across runs are flagged as borderline. Critics who stay in the same tier
across runs are treated as confidently placed.

Empirically, on the 31-person data-viz roster, this produces:

- A stable Tier 1 core of six critics (Tufte, Munzner, Cairo, Wilke,
  Knaflic, Inclusive Design)
- A stable Tier 3 specialist set of five critics (Lupi, Posavec, Felton,
  Xie, Chamberlain)
- A volatile middle of about five critics (Bertin, Cox, Bryan, Bremer,
  Rosling) whose tier depends on which framings surfaced during the run

The volatile middle is informative, not a failure. It tells the designer
where their own reasoning will vary across reviews, and which critics
deserve explicit re-litigation at the start of a new project.

## When to run this

Run the full simulation when adding or removing critics from the roster,
when entering a new project archetype not previously weighted, when porting
the panel to a new domain (writing critique, code review, research design),
or when a project review is producing the "all 31 critics in the same
room" paralysis. Do not run it for every design evaluation. The evaluation
app is the tool for that.

## Outputs that feed the app

The Phase 4 outputs translate cleanly into app configuration:

- Tier assignments map to base agent weights (Tier 1 = full weight, Tier 2
  = conditional weight, Tier 3 = invoke only on archetype match)
- Project-archetype weightings map to per-project agent enable lists and
  multipliers
- Anti-pattern tiebreakers map to ranked-choice resolution rules when
  conflict-map disagreement is high

If the simulation is to feed the app, the synthesis should be serialized
to JSON in the same shape as `design-review-evaluation.json`. The
simulation prompt produces this serialization on request.
