# Iteration prompt

This prompt is for modifying an existing focus-group simulation output
rather than running it from scratch. Four iteration modes are supported.
Pick one mode per invocation. Mixing modes in a single run produces
unfocused output.

## Mode selector

Pick exactly one:

```yaml
mode: A   # add/remove critics from the roster and rerun
mode: B   # swap project archetypes and rerun weightings
mode: C   # stress-test tier assignments by forcing more runs and computing diff
mode: D   # port the panel to a non-default domain
```

## Mode A: add or remove critics

Use when the roster has changed since the last full simulation. New
critics need a Phase 1 opening statement and full re-evaluation through
Phases 2 to 4. Removed critics need to be deleted from camps,
weightings, and anti-patterns wherever they appear.

### Inputs

```yaml
prior_synthesis: |
  [paste the previous Phase 4 output, including tier assignments,
  archetype weightings, and anti-patterns]

additions:
  - name: "..."
    dossier: "[one paragraph anchoring their known position]"

removals:
  - "..."
```

### Prompt

You have the prior synthesis above. The roster has changed as listed.
Do the following:

For each addition, write a Phase 1 opening statement in that critic's
voice. Then place them in the most appropriate existing camp from the
prior Phase 2, or create a new camp if none fits and the addition shifts
the balance enough. Justify the placement in one sentence. Then assign
them to a tier in Phase 4 and explain in one sentence which tier and why.
Then update the archetype weightings if the addition belongs in any
"dominate" or "suppress" slot for any archetype.

For each removal, find every place they appear in camps, tiers,
weightings, and anti-patterns. Remove them and report what (if anything)
shifts: does a camp lose its anchor, does an archetype lose a dominant
voice, does an anti-pattern lose a member.

Emit the updated synthesis in the same structure as the prior. If any
volatile critic (one previously flagged as borderline) is now stable
because of the change, note it.

## Mode B: swap project archetypes

Use when entering a new project type not previously weighted, or when the
default five archetypes are wrong for your context. Common examples:
regulatory submission figure, clinical trial CONSORT diagram, internal
QBR slide, compliance audit narrative, policy briefing.

### Inputs

```yaml
prior_synthesis: |
  [paste the previous Phase 4 output]

archetype_changes:
  add:
    - name: "..."
      description: "[one sentence on audience, stakes, time horizon]"
  remove:
    - "..."
  replace:
    - old: "..."
      new: "..."
      description: "[one sentence on audience, stakes, time horizon]"
```

### Prompt

You have the prior synthesis above. The archetype set is changing as
listed. Do the following:

For each new archetype, name the top three critics whose lens should
dominate and the two critics whose lens should be intentionally
suppressed. Justify each choice in one sentence by reference to the
archetype's audience, stakes, and time horizon. The justifications are
load-bearing: they should make it obvious why a critic dominates here
who is suppressed elsewhere, or vice versa.

For each removed archetype, simply delete it from the weightings.

For each replaced archetype, do the same work as a new archetype.

If a critic that was previously suppressed for every archetype is now
dominant in a new one, flag this as a promotion candidate for Tier 2 in
the next full simulation run.

Do not re-run Phases 1 to 3. Only the archetype weightings change.

## Mode C: stress-test tier assignments

Use when the diff from the original two-run simulation flagged too many
volatile critics, or when a critical decision depends on a borderline
tier assignment that needs more evidence.

### Inputs

```yaml
prior_synthesis: |
  [paste the previous Phase 4 output and the two-run diff]

additional_runs: 3   # how many more independent runs to add

# Optional: focus the stress test on specific critics whose tier you most
# need to nail down. The simulation will still run all phases but will
# pay extra attention to where these critics land.
focus_critics:
  - "..."
  - "..."
```

### Prompt

You have the prior synthesis and the two-run diff above. Run the full
four-phase focus group `additional_runs` more times, independently. Each
run must derive its Phase 2 camps fresh from Phase 1, not by copying from
prior runs. Each Phase 4 synthesis must commit to a specific tier
assignment, not hedge by referring to the prior runs.

After all new runs are complete, produce an updated diff section that
combines the original runs with the new ones. For each critic, report:

- The tier they were assigned in each of the now total runs
- The modal tier (most frequent assignment)
- Whether the modal assignment is dominant (a clear majority) or
  contested (no clear winner)

For focus critics (if any), give a one-paragraph interpretation of why
they sit where they do, what would have to be true for them to move, and
what archetype is most sensitive to their placement.

The deliverable is a confidence-graded tier list: stable, leaning, or
contested. Treat leaning critics as Tier-2 by default and treat contested
critics as case-by-case.

## Mode D: port to a non-default domain

Use when applying the simulation to a domain other than data
visualization. Examples: writing critique (Strunk, Zinsser, McPhee,
Didion, Lamott, Hemingway, King, Tufte-on-PowerPoint, et al.); code
review (Knuth, Hoare, Kernighan, Beck, Fowler, Hickey, Norvig, et al.);
research design (Cronbach, Campbell, Cook, Pearl, Rubin, Imbens, et al.);
product design (Norman, Cooper, Krug, Ive, Dieter Rams, et al.).

### Inputs

```yaml
new_domain: "..."

# A starter roster. The simulation will extend or refine it if asked.
new_roster: |
  [paste critic list with dossiers, organized in sub-groupings]

new_archetypes:
  - "..."
  - "..."

# Whether the new domain has any analogue to the antagonistic-panels
# predecessor in seance-symposium. If yes, the simulation will avoid
# reusing its pairings. If no, leave blank.
prior_pairings: ""
```

### Prompt

This is a domain port, not an extension. Treat the prior data-viz
synthesis as inapplicable. Run the full four-phase focus group on the
new roster, with the new archetypes, against the new domain. The
constraints carry over verbatim:

- Anchor Phase 1 to each critic's known body of work in this domain
- Do not reuse `prior_pairings` if any were named
- Distinguish substantive from contextual disagreement in Phase 3
- Commit in Phase 4

The two-run diff protocol applies. Run twice independently and diff the
Phase 4 tier assignments.

If the new domain is one where a different output shape is more useful
than tiers (for instance, code review might benefit from a "review-depth
gradient" rather than tiers), the synthesis may substitute that shape,
but it must still commit to a specific prioritization. "It depends" is
still only allowed inside archetype weightings.

After the synthesis, emit a one-paragraph note on whether the four-phase
structure transferred cleanly or whether the new domain exposed a
limitation. This is feedback for refining the methodology.

## Invoking these in seance-symposium

Each mode produces an updated synthesis that can be merged into
`design-review-evaluation.json` under the same `prioritization` key
described in `simulation.md`. Mode A and Mode B produce partial updates;
the merge logic should overlay them on the prior synthesis. Mode C
produces a confidence-graded synthesis; the merge should replace the
`stability` block wholesale. Mode D produces a new top-level
synthesis under a new domain key.

For the wintermute migration: these modes work standalone in Claude.ai
without any app. The synthesis is markdown; the JSON is optional. Drop
the iteration prompts into a `prompts/` folder in the vault and run them
chat-by-chat.
