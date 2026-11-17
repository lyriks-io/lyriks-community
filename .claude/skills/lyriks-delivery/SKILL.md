---
name: lyriks-delivery
description: "Turn a Lyriks spec into delivery work and close the loop back: find what the spec declares that the code does not have yet, write tickets whose acceptance criteria ARE the modeled scenarios, and re-sync the implementation index once the code lands. Use whenever Lyriks meets a tracker or a delivery workflow (Jira, Linear, GitHub Issues, BMAD, Scrum): 'prepare the tickets', 'what is left to build', 'the PO enriched feature X', 'create the story for this feature', 'plan the sprint from the spec'. Pairs with lyriks-behavior (authoring the spec) and lyriks-retrospec (extracting it from existing code)."
---

# /lyriks-delivery

Lyriks says **what the product is**; the tracker says **how the work is
piloted**. They join twice: the ticket takes its acceptance criteria from the
modelled scenarios (planning), and the landed code is synced back into the
index (delivery).

## Know which direction you are in

| Direction | The spec is | A gap means | The work list comes from |
|---|---|---|---|
| **Forward** (spec first) | ahead of the code | planned work | the roadmap's backlog and releases |
| **Adopted** (code first) | a model of what exists | a **defect** | the gap and drift reports |

Most projects are both. A feature whose `implementation` is null on
`get_roadmap` was never mapped; one assigned to a future release is planned.
Never put a defect and an unbuilt capability in the same epic.

## One copy of the spec

The spec lives in Lyriks only. A ticket is a **thin pointer**: the feature id,
what is missing, the scenarios as acceptance criteria. Title, estimate,
assignee: the tracker's. States, rules, scenarios, entities: Lyriks', by id.
A rule the ticket needs and the model lacks is authored in Lyriks first.

## The binding

Once the user asks for Lyriks on a product, names its project, or opens a
repository bound to it (installed `lyriks-*` skills, a `.unspa.json`), every
later request about that product goes through Lyriks without being asked again:

- **A change to make**: spec first (`apply_behavior_batch`, `patch_section`), then the code, then the index (Step 4), in the same turn.
- **A question** (how does it behave, what is missing, what broke): read the spec first (`get_behavior_feature`, `get_section`, `get_implementation_status`, `get_implementation_gaps`, `get_implementation_drift`, `simulate_behavior`), never the code alone or memory.
- **A change to qualify** (an estimate, an impact, a decision for someone else): an Evolution request, only when asked for (lyriks-evolution).

Work with no visible effect (refactor, build, formatting) skips the spec; say
so in one line. A request that contradicts the spec is surfaced, never coded
around.

## Step 1: find the work

**`get_roadmap(project_id)` first**: one call, no index needed. Each leaf comes
with its status, its coverage (`percent`, `found`, `expected`, `updatedAt`,
`specUpdatedAt`) and a drift flag:

| Flag | Means | Next |
|---|---|---|
| `spec-moved-since-sync` | the spec changed after the last sync | read the feature, size the delta, ticket it |
| `done-but-code-incomplete` | done, but not every element located | code missing or index stale: check first |
| `code-complete-but-not-done` | everything located, not done | `reconcile_roadmap_statuses`, not a ticket |

Then, from the checkout (both need the `index` of `.unspa.json`):

- `get_implementation_gaps({project_id, index})`: the roll-up per feature; with `feature_id`, the elements and their index keys.
- `get_implementation_drift({project_id, index, feature_id?})`: elements whose spec moved after the code was mapped. `scope: element` is evidence; `scope: feature` is suspicion by association.

## Step 2: read the spec, not your memory

`get_behavior_feature` per feature (`summary:true`, then by id). Add as needed:
`get_provenance` (the files a developer will touch), `get_section experience`
and `get_design_system` for UI work, `score_behavior_feature` or
`assess_behavior_feature` to judge a feature before ticketing it. A thin model
is deepened first: a ticket on a shell moves the ambiguity downstream.

## Step 3: write the ticket

**A spec correction is not a ticket**: it is done in Lyriks. Only code work
becomes a ticket. An epic is one campaign, a story one leaf feature, a task a
mechanical sub-item; a ticket over two features is two tickets.

```
Title:       <what a user gains, in product words>
Lyriks ref:  project <slug> · feature <id> · gap/element ids
Spec stamp:  feature id + spec version (specUpdatedAt / element versions)
What is missing: the elements the code map has not located, by id
Files:       from get_provenance, when adoption ran
Acceptance criteria:
  - one per SCENARIO of the feature (success AND blocked paths)
  - each one names its scenario id
Downstream:  re-sync the Lyriks index before closing (see Step 4)
```

Acceptance criteria are **transcribed scenarios, never new prose**: a
scenario is already a test.

**What evidence cannot settle is a finding, not a question**: an issue on
`rules` (`missing_rule` or `ambiguity`, `in_review`, option and alternative in
`detail`), which this pass then tickets.

**Always dry-run**: show the ticket set, get an explicit go, then create the
whole set without asking again.

## The spec-ready snapshot

When a ticket must stand alone (a story workflow, an outsourced team), it may
carry a **stamped snapshot**, generated, never hand-written:

1. Run `assess_behavior_feature` until `passed`; take `digest.markdown` and the per-scenario results verbatim.
2. Add the data slice (`get_section data`) and the feature's criterion ids.
3. Add the spec stamp. A later reader re-runs the assess and compares: a mismatch means the snapshot expired and is pulled again, never patched.
4. Optionally the code impact (files and lines from `get_provenance`).

With a story workflow: the spec stage emits digest, scenarios, verdict, data
slice and stamp; the story stage emits tasks, sizing, sequencing and test
plans. Three gates: no story without a stamp and a passed verdict; re-run the
assess and compare before decomposing; a story writer meeting an undecided
product question sends it back to the spec. A story never replaces the
snapshot: append it, or use a subticket.

## The branch, from start to merge

When the request card of `get_evolution` carries `code`, the project names a
deployment branch and the request's code follows it in git. Lyriks never
touches the repository: you report what git says.

1. **Work on `code.expectedBranch`**, never on the deployment branch: `git switch -c <expectedBranch> <deploymentBranch>`.
2. **Commit, then test**: a result on uncommitted code or another commit proves nothing. Commit the code, run the tests, `ingest-results.mjs`, then commit `.unspa.json`.
3. **Every sync reports the code**: `sync-index.mjs` sends the index, then the code state; read `codeState` (accepted, or the refusal).
4. **The validation fixes one commit**; a later commit of code sets it aside.
5. **The merge makes it live**: merge into the deployment branch when the person asks, then `node .lyriks/tools/report-merge.mjs --branch <request branch>` from the deployment branch (it checks the validated commit is in the merge and syncs the index). Never push.
6. **Cancelled**: `git branch -D <branch>`.

## Step 4: close the loop after the code lands

**The mapping law**: a mapping is real only when the code is captured. Never
report a bare `{file, line}`: an entry without its `signature` (the exact
line, verbatim) lands `unverified`. Leave none; if you cannot capture the code,
say so.

For adoption, verify feature `sourceIds`, register `stored` identity, analysis
source links and spans separately. Register before capture and pass `register_id`.
Reuse stored text after name/kind/size/hash checks; repair pointers without new
uploads where supported. Compare candidates by source, consumed offsets, type,
decision, target and multiplicity; preserve associations and rationales.

1. Get the entries:
   - **Adopted**: `record_element_spans`, `finalize_analysis`, then `seed_implementation_index`. On a spec-first feature it refuses ("No spans recorded"): that is not an instruction to record spans.
   - **Forward**: write the entries yourself, one per element the code implements (`rule:`, `invariant:`, `surface_rule:`, `surface_invariant:`, `event:`, `state:`, `transition:`, and their `action:` / `surface:` parents), at the line that applies it, with `signature` and `specVersion` (the feature's `updatedAt`). Searched and absent is `status: "missing"`. The code reuses the spec's names, so search for them.
2. Write them into `.unspa.json` (`node .lyriks/tools/index-file.mjs upsert`); the platform never stores your index.
3. `sync_implementation_index({project_id, index})`, and read `orphans` (usually a rename).
   - **Send a partial index**: the features you touched, each action or surface WITH all its children (a report replaces what was located under it).
   - `synced` counts reports, one per action and surface; `stale` and `healed` there are about code location and are never checked on an inline index. Spec drift is `get_implementation_drift`.
   - **The scripts ship with the skills** under `.lyriks/tools/` (plain Node; `LYRIKS_MCP_URL`, `LYRIKS_MCP_TOKEN`): `check-index.mjs --fix` finds each signature by its TEXT and rewrites moved lines; `sync-index.mjs [--feature <id>]` sends what does not fit a tool call; `apply-batch.mjs` and `mcp-call.mjs` do the same for a batch or any tool. Never hand-write a JSON-RPC client.
   - **Proof comes back by script**: `export_behavior_scenarios` gives fixtures with a `titleToken` (`[unspa:<surfaceId>:<actionId>:<scenarioId>]`); the repository's tests call the REAL code through one adapter and carry the token in their title; `node .lyriks/tools/ingest-results.mjs <report.json>` stamps `verifiedAt` on every action whose results all passed (no network). Located and proven are two claims; never type a `verifiedAt`.
4. `reconcile_roadmap_statuses` (it only upgrades).
5. Then close the ticket, once `get_roadmap` no longer flags the feature. If it still does, say so.

An index export must be complete before saving: compare keys with the native
denominator, reject truncated signatures/paths and shape placeholders, and page
or export the missing entries. Never turn a capped seed into a local index.
Report citations, finalized provenance, exact code signatures, sync acknowledgments
and measured coverage separately. An accepted sync can precede the aggregate
recalculation; inspect the touched reports and freshness before sending it again.
Located code and code proven by tests remain different claims.

## Keep the places true between two runs (CI)

Other people change the code too. In a shared repository, propose this job on
every merge to the main branch, or nightly:

```bash
node .lyriks/tools/check-index.mjs --fix   # Node 18, nothing to install, no network
node .lyriks/tools/sync-index.mjs          # only where the job can reach Lyriks
```

`check-index --fix` rewrites the lines that moved and fails, naming the entry, when a code line is found nowhere: the entry is re-audited the day its code changes. Never edit a line number by hand to make the job pass. `sync-index` sends the healed index with `LYRIKS_MCP_URL` and, where sign-in is required, `LYRIKS_MCP_TOKEN` held as a CI secret. Say that such a token expires: without a valid one the job keeps the check and drops the sync.

## A spec enriched by someone else

Told "we added X on feature Y": go to `get_behavior_feature`. Not told:
`get_roadmap` flags `spec-moved-since-sync` and the drift names the elements.
Never take silence for no change.

## What these tools cannot tell you

- **A key several features share holds ONE location** (a `state:` key carries a path, not a feature): the sync's `shared` block names them.
- **The index lives in the checkout**: gaps and drift move only when someone runs them from the repository. `get_roadmap` is the exception.
- **A green coverage is a past sync, not working code**: read `updatedAt` before `percent`.
- **Drift says what changed, not what it says now**: read the feature.
- **A located line is not a proven behaviour**: only a test run of the code proves it.
- **Every child needs its own key**: every action found and every rule missing means `rule:` keys were never written.

## Access and cost

- A multi-user install needs a Lyriks token; a run that now answers 401 usually holds an expired one.
- Reads are light; `assess_project_completeness` and `audit_project_scope` are heavy: run them at milestones.
- `sync_skills` at the start of a session keeps these playbooks current.

## Never

- Paste modelled behaviour into the tracker, or invent criteria the model lacks.
- Let a story overwrite the snapshot, or decompose a stale one.
- Create, update or close tracker items without an explicit go.
- Use `generate_artifact` with `type:"user_stories"` on a behavior-kernel project: it ignores your rules and scenarios.
- Close a ticket whose feature still flags in `get_roadmap`.
- Code a change the bound project does not carry yet.
