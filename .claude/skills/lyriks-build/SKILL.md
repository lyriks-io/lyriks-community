---
name: lyriks-build
description: "Build or extend a Lyriks project end-to-end through the Lyriks MCP: declare the external scope, author and assess every section, describe the Experience (journeys, screen inventory, design system), verify the behavior, run the whole-project audit, and finish only when its deterministic gate passes. Use whenever the task is to create or populate a Lyriks project through the MCP."
---

# /lyriks-build

Author a Lyriks project **only through the MCP**. Project data goes through
the MCP; code stays repository edits.

## Two id namespaces

- **The project slug** (`acme-1a2b3c`) serves every section, experience and completion tool: `get_section`, `set_section`, `patch_section`, `describe_section`, `assess_project_completeness`, `audit_project_scope`, `finish_project`, `update_wizard_project`.
- **The back UUID** serves `create_project`, `get_model`, `get_view`, `find_inconsistencies`, `generate_artifact`, `apply_rule`. It is not linked to the slug.

To rename, describe or move the project the user sees, call `update_wizard_project`, never `update_project`.

## Discover schemas first

`describe_section({section})` gives the empty shape, enum codes, a sample per
collection, authoring notes and `uiLocation`, the page that shows it. Quote
`uiLocation` when telling a person where something lives, and never ask them
for a part no page shows. `rules` holds the issues What Lyriks noticed lists;
executable rules live in the behavior model.

## Evidence first: never author from memory

Every value you write traces to something READ in this session: a file, a
registered document, a tool answer, a screenshot the user gave. Not read, not
written: leave it empty and say why.

- It covers everything: colors, tabs and their order, labels, columns, enum values, versions, counts, guards, quotas.
- Re-read the source when you write, not from conversation memory.
- On an existing product the code is the authority: read the file, then write, and register it in `documents`. "I know this product" is never a source.
- Empty beats invented, always.

Confirm the intended instance and project with a read before writing. A generic
connector name does not identify a deployment. Preserve a binding the owner
reserved; syncing guides does not authorize replacing it. Start a large read
with its shape, verify a sample path, then compare returned counts and revision;
`capped`, `missingPaths` or shape placeholders are never complete evidence.

Names the code will carry are English; prose is in the ONE language the
project declares (lyriks-behavior, *Names and language*). That binds the
`data` section too.

## Narrate, checkpoint, and never invent a product decision silently

This protocol binds every skill that writes through the MCP.

**Announce before you write**: three lines in product words: what you author,
where, and the product decisions it embeds. No engine vocabulary.

**Checkpoints**, each with a recap (written, decided, remaining): scope
declared; foundation written; feature tree built; each leaf's behavior
authored (each core when leaves are many); data reconciled; experience built;
audits green; right before `finish_project`. The recap lists every product
decision since the last one, and names every measure the product displays,
the low ones first.

**Two kinds of choice.** Modelling mechanics (enum or boolean, which surface
holds a state, a rule's category, ids) are yours: decide, never ask. A
PRODUCT DECISION is one two reasonable product managers could answer
differently AND a user would notice: the scope mode, the feature split, who
may do what, lifecycle states, a threshold, what a blocked user sees, two
sources that disagree, the name of a central concept, what is left out.

**A product decision is recorded, never silent.** Take the best-evidenced
option and record it with the alternative set aside:

- in `rules.issues[]`: `kind` `missing_rule` or `ambiguity`, `status` `in_review`, `title` the question, `detail` the option taken, the alternative and why, `relatedFeatureId`, `sourceIds`.
- **Title grammar**: subject first, the thing that is wrong, under 80 characters, no reasoning ("Sidebar colour has no dark-palette value"). The why goes in `detail`.
- a scope-level decision is an `approvals` row (`area`, `title`, `status` `in_review`, `note`). `in_review` is the status YOU write; never write `approved` or `accepted_risk`, both say a person signed.

**Two modes, chosen by the user's words.**

- *Autonomous* (default): decide, record, recap, keep going.
- *Accompanied* ("walk me through it", "I want to validate"): the same loop, never paused. At each checkpoint present the decisions since the last one as ONE numbered recap, at most five, ranked scope > roles > lifecycle > rules > naming: context, option taken, alternative, what a user would see, the draft's verdict. Silence means the decision stands.
- The loop stops for three things only: a decision that contradicts the ask or the scope, two sources the product does not settle (`flag_conflict`), a destructive operation. Use the runtime's question tool for those three only.

**Phrase a decision for a person**: "what must always stay true", "what a user
can always reach", "the situation we start from", never "surface invariant"
or "reachability goal". What cannot be phrased that way is mechanics, and
yours.

## Scope first

The model cannot see a capability it never inventoried. Before the feature tree:

1. Read every supplied source and register it in **documents**.
2. Choose `scope.mode` from explicit intent only: `full_product` (no exclusion allowed), `selected_scope` or `prototype` (each omission with a rationale and an approval). Ambiguous: leave `unclassified` and ask. Never downgrade a whole-product request.
3. Inventory every expected capability in `scope.capabilities[]` with its `sourceIds` and a `disposition`; map each `included` one to its leaf `featureIds`.
4. Never derive the inventory from the features you authored: that is circular.

## The one-line kickoff (from scratch)

The user may hand you one sentence: *"With the help of the Lyriks MCP, specify
the Lyriks project "Acme" (id acme-1a2b3c) from scratch, from the Jira backlog
and the Notion pages, and ask me what they cannot tell you."* Never ask for a
fuller brief.

1. **Load the playbooks**: `sync_skills` with `client` set to what you are; with Node in the repository, `self_install: true` and run its `selfInstall.command`; otherwise install each `installTargets` entry. Then follow this skill in full.
2. **Resolve the target project, never create a second one**: "create the project X" is `create_wizard_project` (domain resolved with `list_domains`) unless an empty one of that name exists; a named project is resolved with `list_wizard_projects`; no name, ask.
3. **Harvest what the client's other MCP servers reach, and register each source with the web address the tool answer carries**: backlogs (epics and stories make the tree, their criteria the rules and scenarios), wiki pages (`foundation`, `users`, `glossary`), BMAD or Spec Kit files in the repository, Figma (`experience`, per lyriks-design), documents the user hands you.
4. **What no source says is a recorded decision**, presented at checkpoints. Never fill a gap a source left open.
5. Then the build order, every section assessed.

## Build order (persisted, resumable)

On an existing project start with `get_section(scope)` and
`assess_project_completeness`, and resume from what is open; never from chat
memory. Several projects: assess each, audit and finish each alone.

1. `create_wizard_project` (or the existing slug), then **documents**, then the **scope** inventory.
2. **foundation**: `identity`, `definition`, `operations`. `identity.brief` is the product summary the Overview reads whole: 500 characters at most (what, for whom, why); a longer write is refused.
3. **features** (cores, families, leaves), then `/lyriks-behavior` on every included leaf, at full depth or at the user's target stage.
4. **users**: personas first; the permission pass comes at step 9.
5. **data**, **rules**, **architecture**, each claim tied to the evidence register. The data model is a loop: write, read the write's `coherenceIssues`, fix. Every entity relates to what owns it or what points at it (*No orphan table* below). Logical architecture may precede technology choices.
6. **experience**: journeys (actor roles, core), ordered steps, each step on a screen of the inventory (`screens[]`: name, route, device, description), what it does (`stepOperations`) and the data it reads or writes (`stepDataReads`). There is no screen prototype: never author a layout.
7. **Design system**: `lyriks-design`, the `brand` sources.
8. Targeted edits with `patch_section` (one journey, step, screen or brand item by id).
9. The **users** permission pass over system, feature, action, journey and surface capabilities. A permission is ACCESS: one `{roleId, capabilityId, capabilitySource}` row per role and capability it reaches, no verb, no row where it cannot. Give every role the values the behaviour reads it by (`roles[].behaviorValues: [{path:"session.workspaceRole", value:"admin"}]`): Lyriks then names each action whose rules refuse a role the matrix grants, or let in one it keeps out. Send the pass as ONE `patch_section` of `append` ops.
10. **glossary**, **approvals**, **baselines**, **coherence**, **documents**: authored, or recorded as derived or not applicable in `scope.sectionAssessments`; never silent.
11. Every `sectionAssessments` row seeded `required`: `ready` means reviewed; `not_applicable` needs a rationale and an approval and is forbidden in `full_product`. Rows seeded `derived` are not yours.
12. The local verification, then the global protocol. Any later save makes the audit stale, by design.

## Authoring quality

- **Every section filled or assessed** from its `describe_section` schema: scope, foundation, users, features, experience, rules, data, architecture, coherence, glossary, approvals, baselines, documents. The usual accidental empties: glossary, permissions, Foundation operations, documents, rules. `evolution` is read with `get_evolution` and never assessed.
- **Every checkable field linked to the state that holds it** (`link_data_fields`, many at once, plus each table's existence state). `get_data_links` lists what remains; the audit counts it as `data-field-unlinked`.
- **Link meaning, not spelling.** Distinguish a value, presence, counter, comparison, unit and historical version. Preserve optional-presence booleans and numeric clocks the planner accepts. SQL `NOT NULL` does not prove non-empty text; read defaults and normalization. Copy stored enum codes, not display labels. Inventory calculated records consumed by journeys too, without inventing physical storage for them.
- **No orphan table.** Every data write answers `unrelated-entity` for a table that points at nothing and that nothing points at, and the audit repeats it as `data-entity-unrelated`. Add the relation the product has (ownership, reference, provenance), or mark a truly standalone table `standalone: true` with the reason. Never invent a relation; never mark `data` ready while one remains.
- **Columns mean what they say; a row is complete or absent.** An SLA's `metric` names what is measured (no number), `commitment` the target, `penalty` the consequence.
- **Never fabricate contractual, SLA, pricing, legal or penalty values.** Not stated: empty.
- **Locales come from the product** (its language switcher, `hreflang`): every language and the country split (`fr-BE`, `nl-BE`) in `foundation.operations.i18n.locales`.
- **Architecture moves from logical to implementation.** Start new designs at `logical`; record concrete choices with their alternatives in Documents & Sources and cite them (`referenceDocId`, `sourceIds`). Never infer a stack from a component name.
- **Form factors are chosen** (`web_interface`, `api`...), never left empty.
- **Scores**: close the coverage and coherence gap lists; readiness stays moderate on a spec no production has proven, by design. Say so.
- **Every action declares its rules**; an unconditional one says so with `allow_action`.
- **Batch limits**: split a batch that times out. An engine that refuses a legitimate shape is outdated: report it, never encode around it.

## Validate the spec against the code, and offer it

On a project that models existing code, propose this flow yourself when a
retro-spec reaches behavior depth, when a claim cannot be traced, or when the
user wonders whether spec and code agree.

- **While authoring from code**: `attach_source` the files you read (kind "code"), `stage_candidates` / `dispose_candidate` what you saw but did not model, `record_element_spans` for each element. `finalize_analysis` refuses while anything is untraced.
- **Once the model stops moving**: `seed_implementation_index`, LAST (a later write makes every entry stale), then `sync_implementation_index`; read `orphans` and `shared`.
- **Then reconcile**: `get_implementation_gaps` (no `feature_id` for the roll-up) and `get_implementation_drift`, whose rows carry `scope`: `element` (that element moved) or `feature` (suspect by association).
- **Read your own work back** (`get_provenance`, `get_view`, `get_knowledge_graph`) before reporting on it: the memory of writing it fills the gaps a reader will fall into.

## Sources & citations

`documents` is THE evidence register; every other section cites it by id in a
`sourceIds` field.

- **Register as you read**: `documents.sources[]` row `{id, title, kind, url, note}`, `kind` in interview, research, pdf, diagram, link, requirement, code, regulation, evidence, other; `note` the sentence the claim rests on.
- **Reachable, or it is not a source.** `url` is a web address anyone can open (the page, the issue, the Figma file, the file or commit on the repository host); a source read through another MCP always has one. No address (a PDF, an interview, a local file): `url` empty and `note` carries what the spec relies on, verbatim. Never a `file://` or local path in `url`: the audit reports `source-unreachable` (`source-empty` with neither). A code file goes through `attach_source`.
- **Cite where the claim is made**:

  | Section | Field |
  |---|---|
  | foundation | `foundation.definition.<section>.sourceIds` |
  | users | `roles[].sourceIds` |
  | features | `leafMeta.<id>.sourceIds` |
  | rules | `issues[].sourceIds`, `scenarios[].sourceIds` |
  | glossary | `terms[].sourceIds` |
  | architecture | `sourceIds[]`, `techChoices[].referenceDocId` |
  | data | `entities[].sourceIds`, the declaring code first |

- **At minimum**: regulations, market claims, SLA and pricing figures, terms from a standard, personas from research, the official docs of each tech choice. Whatever makes a reader ask "says who?".
- A citation never justifies an invented value; never cite a page you did not read. Keep ids stable; never delete a cited row.

## Where each kind of document goes

| Page | Place |
|---|---|
| test plan and results | `documents` row `evidence` (result, `criterionIds`) |
| ADR | `documents` row with its `decision` status |
| traceability matrix | each requirement id cited as a passage on its rule or criterion |
| pain points | `foundation.painPointLinks`, with the roles they hurt |
| SLA and penalties | `foundation.slas` |
| legal pages | Legal or Compliance constraints, `regulations` |
| API reference, OpenAPI | one `api` action per endpoint (the ledger's five lists) |
| import (CSV, another tool) | a feature |
| known bug (KI-xxx) | a `rules` issue: a person decides it |
| mock-up | the screen's source |
| roadmap, release plan, runbook, standards, minutes, support | source, set aside |

## Verify locally, then prove global completion

- `simulate_behavior({project_id, feature_id, run_scenarios:true})`: a failing scenario is a wrong rule or a wrong scenario; fix it.
- The Experience is checked through its journeys (a screen no step visits, a step on no screen, a step that says neither what it does nor what it reads): close them in the experience section.
- Acceptance tests come from the scenarios: `export_behavior_scenarios`.

These checks verify what exists; they never prove the project complete. Global protocol:

1. `assess_project_completeness`; resolve every blocking issue in its section; repeat until only audit freshness remains.
2. `audit_project_scope`, then read `assess_project_completeness` again: a change after the audit makes it stale.
3. **Report the Project health with the completion.** `health` (in that answer and in `get_section(coherence)`) is ONE score over every open point What Lyriks noticed. A project can audit at 100 and read a Critical health on the same screen. Give its score, its word, how many points block, and the heaviest points.
4. `finish_project` only when the user asks; only `completed:true` lets you say complete.

**Never write a bare score.** Name the measure and give the health beside it;
when they disagree, the disagreement is the finding. **A low health is often
the price of an honest register**: every recorded issue counts. Report the
number with its cause, and never close an issue to move a score.

Work that stops before `finish_project` is reported by its exact state:
"authored", "authored to <stage>", "locally verified", "ready for audit",
"blocked by ...". Never "complete".

Tickets, stories and the re-sync after code lands follow `lyriks-delivery`.
The conversation stays bound to the project: every later change is spec
first, every question a spec read first.

## Known noise

- No roll-out strategy on a product with nothing to migrate is correct.
- Open or accepted-risk issues are a healthy register.
- Readiness below 100 on an analysed spec is by design.

Noise is a reason not to chase a score, never a reason to leave it out: give
the number, then the reason.

## Gotchas

- `set_section` takes the WHOLE section; on the Experience prefer `patch_section`. The experience `builder` sub-tree is retired and refused.
- `patch_section`: a keyless row (users `permissions[]`) is addressed by `match:{roleId,capabilityId}`. A new row is `append` (idempotent, `id` optional); `merge` edits an existing one.
- Author features and experience before the permission pass. A permission row carries no `action`.
- Identical `coherenceIssues` on consecutive writes collapse into `coherenceIssuesUnchanged`.

## Implementation evidence

A passing scenario proves rules, guards and state in a model, never the real
renderer, networking, visuals or load. Record real test results as evidence
(build, command, artifact, criterion ids), and report unrun or blocked checks
as such.

A failed evidence provider is unavailable, never a successful check over an
empty list. Separate analysis coverage, verification limits and product health:
keep real product defects open when reporting a faithful retro-spec. The server
gate and the person's finish decision still apply; never close findings to pass.
