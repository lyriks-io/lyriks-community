---
name: lyriks-delivery
description: "Turn a Lyriks spec into delivery work and close the loop back: find what the spec declares that the code does not have yet, write tickets whose acceptance criteria ARE the modeled scenarios, and re-sync the implementation index once the code lands. Use whenever Lyriks meets a tracker or a delivery workflow (Jira, Linear, GitHub Issues, BMAD, Scrum): 'prepare the tickets', 'what is left to build', 'the PO enriched feature X', 'create the story for this feature', 'plan the sprint from the spec'. Pairs with lyriks-behavior (authoring the spec) and lyriks-retrospec (extracting it from existing code)."
---

# /lyriks-delivery

Lyriks and your tracker are two layers, not two competitors. Lyriks answers **what the product is**; the tracker answers **how the work is piloted**. They join at exactly two points, and this skill is those two joins.

| Join | Direction | What happens |
|---|---|---|
| **Planning** | Lyriks feeds the ticket | The story's acceptance criteria are the feature's modeled scenarios. Nobody re-writes the spec. |
| **Delivery** | The ticket feeds Lyriks back | Once the code lands, the implementation index is re-synced, so spec vs code stays honest. |

## First, know which direction you are in

The same gap report means opposite things depending on where the project is, and
reading it the wrong way produces a backlog nobody can act on.

| Direction | The spec is | A gap means | Where the work list comes from |
|---|---|---|---|
| **Forward** (spec first) | ahead of the code | **planned work** not built yet, entirely expected | the roadmap's backlog and its releases |
| **Adopted** (code first) | a model of what exists | a **defect**: the product does not do what it claims | the gap and drift reports |

Most real projects are both at once: a modeled baseline plus capabilities that
only exist on paper. Tell them apart before ticketing anything. A feature whose
`implementation` is null on `get_roadmap` was never mapped to code at all, and a
feature assigned to a future release is planned work. Never put a defect and an
unbuilt capability in the same epic: one says the product is broken, the other
says it is unfinished, and a team reads them differently.

## The law: one copy of the spec

The spec lives in Lyriks and NOWHERE else. A ticket is a **thin pointer**: the feature id, what is missing, and the scenarios as acceptance criteria. The moment you paste modeled behavior as prose into a tracker, you have created a second copy that will diverge, and the tracker copy always wins arguments it should lose.

- Ticket title, scope, estimate, assignee, links: the tracker's job.
- States, actions, rules, scenarios, invariants, entities: Lyriks' job, referenced by id.
- If a ticket needs a rule the model does not carry, the fix is to author the rule in Lyriks (`apply_behavior_batch`, see lyriks-behavior), not to write it in the ticket.

## Step 1: find the work (project-wide, cheap)

**Start with `get_roadmap(project_id)`.** One call, whole project, computed server-side, no index needed. Every leaf feature comes back with its workflow status, its implementation coverage (`percent`, `found`, `expected`, `updatedAt`, `specUpdatedAt`) and a drift flag when the claim and the evidence disagree:

| Flag | Means | Next step |
|---|---|---|
| `spec-moved-since-sync` | The feature's spec was edited AFTER the last index sync. Its coverage numbers describe an older spec. | Read the feature, size the delta, ticket it. **This is how a PO-side enrichment surfaces.** |
| `done-but-code-incomplete` | Marked done, but the index never located every spec entity. | Either the code is missing, or the index is stale. Check before ticketing. |
| `code-complete-but-not-done` | Every entity located, status not done. | Usually a status to fix: `reconcile_roadmap_statuses`, not a ticket. |

Then get the element-level picture. Both of these need the `index` object out of your repo's `.unspa.json`, so they only work from the implementation checkout:

- `get_implementation_gaps({project_id, index})` with NO feature id returns the project roll-up: one row per feature holding spec entities (`total` / `implemented` / `partial` / `missing`, worst first), project totals, and an `unavailable` list of features the engine could not answer for. Pass `feature_id` to get the elements themselves, with the key each one carries in the index.
- `get_implementation_drift({project_id, index, feature_id?})` names the entities whose spec moved after the code was mapped to them. Every stale row carries `scope`: `element` means that exact entity changed and the row is evidence; `feature` means only the feature-wide stamp was available, so the row is suspect by association. A feature authored before per-element stamps reports `feature` until its next edit calibrates it.

## Step 2: read the spec, not your memory

For each feature in scope: `get_behavior_feature({project_id, feature_id})`. That is the spec: surfaces, typed state, actions, rules (the guards), effects, scenarios, invariants, with stable ids. Use `paths` or `summary:true` when the feature is large.

Round it out only as needed:

- `get_provenance({project_id, feature_id})`: which code spans each element came from, so you name the files a dev will actually touch instead of guessing.
- `get_implementation_context({project_id, screen_id})`: a screen brief (layout outline, journeys, entities, design tokens) when the work is UI.
- `get_section` on `rules`, `data` or `experience` for cross-cutting context.
- `score_behavior_feature` when you need the issue list; `assess_behavior_feature` for the full report. Both are heavy: use them to judge a feature you are about to ticket, not to browse.

If the model is thin where the ticket needs depth, say so and author the depth first. A ticket built on a shell feature just moves the ambiguity downstream.

## Step 3: write the ticket

**A spec correction is not a ticket.** Rewriting an invariant, attaching a role,
removing a field the code does not have: that work is done in Lyriks and it is
finished. Only code work becomes a ticket, meaning the code does not do what the
spec says, or the capability does not exist yet.

Where your tracker has levels, map them to the model rather than to feelings about
size: an **epic** is one campaign (a remediation, a release's worth of a
capability), a **story** is one deliverable unit and in practice one leaf feature,
a **task** is a mechanical sub-item of a story. A ticket that spans two features is
two tickets; three tickets against the same feature and the same surface are
usually one.

```
Title:       <what a user gains, in product words>
Lyriks ref:  project <slug> · feature <feat-…> · gap/element ids
Spec stamp:  feature id + spec version (specUpdatedAt / element versions)
What is missing: the elements the code map has not located, by id
Files:       from get_provenance, when adoption ran
Acceptance criteria:
  - one per SCENARIO of the feature (success AND blocked paths)
  - each one names its scenario id
Downstream:  re-sync the Lyriks index before closing (see Step 4)
```

Acceptance criteria are **transcribed scenarios, not new prose**. A scenario already carries its state overrides, its parameters, its expected status and its assertions: that is a test, and it is the only AC that stays true when the spec changes.

**What you cannot settle from evidence becomes a finding, not a question.** When
the spec and the code disagree and the code does not tell you which is right,
record it as an issue on the feature's `rules` section and carry on (same
register as lyriks-build's product decisions: `kind` `missing_rule` or
`ambiguity`, `status` `in_review`, the option taken and the alternative in
`detail`). It is then part of the model, it survives the session, and this same
pass picks it up as a ticket. Stalling on a question the human cannot answer either is the one outcome
that helps nobody.

**Always dry-run.** Present the ticket set as text, get an explicit go, then create. Never create tracker items on your own initiative, and when the go comes, create the whole set without asking again.

## The spec-ready snapshot (when a ticket must stand alone)

Some pipelines need the ticket to be self-sufficient: a story workflow (BMAD
and friends), an outsourced dev, an async team that will not open Lyriks. Such
a ticket may carry MORE than the thin pointer: a **stamped snapshot**,
machine-generated from the model, never hand-written.

1. `assess_behavior_feature` is the gate AND the source. Run it until the
   verdict is `passed`, then take `digest.markdown` (what you can do / the
   guards / what always holds) and the per-scenario results **verbatim**.
2. Add the data slice from `get_section` on `data` when the work touches
   entities, and the acceptance-criteria ids from the feature's leafMeta.
3. Add the **spec stamp** from the template above. The stamp is what keeps the
   one-copy law honest: any later consumer re-runs `assess_behavior_feature`,
   compares versions, and a mismatch means the snapshot EXPIRED and must be
   re-pulled, never patched by hand. A snapshot without its stamp is just
   prose that will diverge; the stamp makes it a cache instead of a fork.
4. Optionally a code-impact report (files and lines, from `get_provenance` or
   a repo scan): it is code-facing and completes the behavior-facing digest.

## Splitting the work with a story workflow (BMAD and friends)

When a downstream workflow turns the spec-ready ticket into dev stories, hold
this responsibility line:

| Derived from | Emitted by | Examples |
|---|---|---|
| the Lyriks model | the SPEC stage (this skill + lyriks-behavior) | digest, scenarios as AC, verdict, data slice, impact report, stamp |
| the ticket, toward build | the STORY stage (create-story or equivalent) | tasks/subtasks, sizing and splitting, sequencing, per-task test plan |

Three gates keep that pipeline honest:

- **Spec-ready gate.** No story from a ticket without a stamp and a passed
  verdict; bounce the ticket back to spec authoring instead of decomposing a
  guess.
- **Freshness gate.** Before decomposing, re-run `assess_behavior_feature` and
  compare the live spec version with the ticket's stamp. Stale means re-pull
  the snapshot, not trust it.
- **Bounce rule.** A story writer that meets an untraversed product decision (a
  modelling fork the spec never settled) never invents the answer. It goes
  back to spec authoring, where a human decides. Decomposing is the story
  stage's ONLY creative act; sizing and sequencing are exactly the judgment
  the model does not carry, and that is why the story stage exists at all.

The story must never REPLACE the spec-ready snapshot on the ticket: append it,
or put it on a subticket. The snapshot is what the freshness gate and the next
re-sync read; a story that overwrote it has severed the ticket from its spec.

## Step 4: close the loop after the code lands

Implementation without a re-sync is how the Coherence reading rots. In the same session as the code:

**The mapping law (one concept: adopt, implement, trace).** A spec↔code mapping is only real when the code itself is captured. Never record or report a bare `{file, line}`: that is a claim the engine cannot check, and the dashboard stamps such locations `unverified`. Whichever branch below applies, the code travels with the mapping: adoption spans carry it automatically, and a hand-written entry carries it as `signature` (the exact line, verbatim). An entry synced without a signature, or a `report_implementation_status` location without a `snippet`, lands as `unverified` in the implementation panel. Leave zero unverified locations behind; if you cannot capture the code, say so instead of reporting the location.

1. Get the new entries into the index. The direction decides how, and only one of the two branches applies:
   - **Adopted** (existing code being modeled): `record_element_spans` / `finalize_analysis`, then `seed_implementation_index({project_id, feature_id})` returns entries. It only answers for features that hold spans; on a spec-first feature it refuses with "No spans recorded", and that refusal is NOT an instruction to go record spans.
   - **Forward** (spec first, code written to it): there are no spans and there never will be. The code reuses the spec's English names by default (lyriks-behavior's vocabulary language law), so locating an element is mostly a search for its own name. Write the entries yourself, one per element the code now implements (`rule:<id>`, `invariant:<id>`, `surface_rule:<id>`, `surface_invariant:<id>`, `event:<name>`, `state:<path>`, `transition:<id>`, plus the `action:` / `surface:` parents), each at the exact line that applies it, with `signature` (that line, verbatim) and `specVersion` (the feature's `updatedAt` from `get_behavior_feature`, which is what arms drift). An element you looked for and did not find gets an entry with `status: "missing"`: that is how "searched, absent" stays distinguishable from "never searched". Locating code that was written from a spec is the job of `lyriks-trace` when it spans more than a handful of elements.
2. Write the entries into your repo's `.unspa.json` yourself. The platform never stores your index.
3. `sync_implementation_index({project_id, index})` pushes the whole project's coverage in one call. Check `orphans`: a non-empty list means index keys that no longer resolve, usually a rename.
4. `reconcile_roadmap_statuses` aligns feature statuses with the coverage that just landed (upgrade-only, it never demotes a hand-set done).
5. Only then move the ticket to done.

After that, `get_roadmap` should no longer flag the feature. If it still does, the loop is not closed: say so rather than closing the ticket.

## Reading a PO-side enrichment

When someone enriches the spec and hands you "we added X on feature Y", trust it and go straight to `get_behavior_feature`. When nobody tells you, the three signals above find it: `get_roadmap` flags the feature as `spec-moved-since-sync`, and `get_implementation_drift` names the elements with `scope: "element"`. Announcement is faster; detection is what catches what nobody announced. Use both, and never assume silence means nothing moved.

## What these tools cannot tell you

Be explicit about this with the humans you work with; it changes the team's convention.

- **A key several features share holds ONE location.** State keys carry a path, not a feature id, so a `state:session.role` declared in a dozen features is ONE entry describing whichever was seeded last. `sync_implementation_index` names them in its `shared` block: read it, and do not ticket a gap on the strength of one of those rows alone.
- **The index lives in your checkout**, versioned with the code it describes. A PO working only in the dashboard cannot make gaps or drift move: someone has to run them from the repo. `get_roadmap` is the exception, which is why it comes first.
- **A green coverage number is evidence of a past sync, not of working code.** Read `updatedAt` before trusting `percent`, and treat `spec-moved-since-sync` as "these numbers answer for a spec that no longer exists".
- **Drift answers "what changed", not "what it now says".** A stale row names the element and when it moved; read the feature to see what it says today.
- **Every child element needs its own index key.** An `action:` entry says nothing about the rules, invariants and events under it; a coverage that plateaus with every action found and every rule missing means the index was never given `rule:` / `invariant:` keys, not that the rules are unimplemented. Do not conclude on such a number: add the keys (Step 4) and re-sync.
- **An element nobody ever stamped reports `scope: "feature"`.** That is the old coarse signal, not a bug: the whole feature is implicated because nothing finer exists yet. One edit through the authoring tools calibrates it.

## Access and cost

- Authentication depends on the install. A single-tenant appliance may need none; a multi-user one requires a Bearer Lyriks token, obtained interactively in a normal session. Headless and CI runs carry that token in the client config, and tokens expire: a run that used to work and now returns 401 is usually an expired credential, not a broken tool.
- Reads (`get_roadmap`, `get_behavior_feature`, `get_provenance`) are light. Whole-project operations (`assess_project_completeness`, `audit_project_scope`, `verify_experience`) are heavy: run them at a milestone, not per ticket.
- Call `sync_skills` at the start of an authoring session so this playbook and its siblings are current.

## Never

- Never re-write modeled behavior as prose in the tracker. One copy; a stamped, machine-generated snapshot is a cache of that copy, hand-written prose is a fork.
- Never invent acceptance criteria the model does not carry. Author them in Lyriks first, then transcribe.
- Never let a later stage (a story, a dev note) overwrite the spec-ready snapshot on a ticket. Append, or use a subticket.
- Never decompose a stale snapshot: re-run the assess, compare the stamp, re-pull.
- Never create, update or close tracker items without an explicit go.
- Never use `generate_artifact` with `type:"user_stories"` on a project specified through the behavior kernel: it reads the legacy unified model and ignores your rules and scenarios entirely.
- Never close a ticket whose feature still flags in `get_roadmap`.
