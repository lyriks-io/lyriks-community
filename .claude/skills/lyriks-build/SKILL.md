---
name: lyriks-build
description: "Build or extend a Lyriks project end-to-end through the Lyriks MCP — declare the external scope, author and assess every section, build a runnable Experience prototype, verify local behavior, run the whole-project audit, and finish only when its deterministic gate passes. Use whenever the task is to create/populate a Lyriks project, design its screens, or wire its simulator via the MCP (tools prefixed mcp__lyriks__*)."
---

# /lyriks-build

Playbook for authoring a Lyriks project **only through the MCP**. The MCP is at `http://localhost:3055/mcp` (auto-started by `pnpm dev` / `run-lyriks.sh` as a vite companion). All project DATA goes through the MCP; code stays repo edits.

## Two id namespaces (don't mix them)
- **v3 slug** (e.g. `causette`) — used by every section/experience/completion tool: `get_section`, `set_section`, `patch_section`, `describe_section`, `build_screen`, `simulate_experience`, `verify_experience`, `get_experience_coverage`, `assess_project_completeness`, `audit_project_scope`, `finish_project`, `update_wizard_project`, `get_implementation_context`, `import_data_collections`, `generate_acceptance_tests`.
- **back UUID** — used by `create_project`, `get_model`, `get_view`, `find_inconsistencies`, `generate_artifact`, `apply_rule`. NOT auto-linked to the v3 slug; a wizard project has no back model.

`update_project` changes a bare/back record only. To rename, describe, move, or stage the project the user sees in Lyriks, call `update_wizard_project`.

## Discover schemas first
Call `describe_section({section})` for the empty-draft shape, enum codes, a sample per collection, `uiLocation` (which capability + tab edits it) and authoring notes. Public section keys match capabilities: **Foundation is one `foundation` section**, while `rules` is edited inside Features. Quote `uiLocation` when telling a human where something lives. (If unsure of a built screen, `get_implementation_context({project_id, screen_id})` returns a markdown brief.)

## Evidence-first: authoring from memory is FORBIDDEN (all agents)

Every value written through the MCP must be traceable to something actually READ
during the session: a repo file, a registered document, a tool response, a
screenshot the user supplied. If you did not read the source, you do not write
the value: leave it empty and say why. This is a hard rule for EVERY agent using
this MCP, not a preference.

- It applies to everything: colors and tokens, tab sets and their order, nav
  items, page titles, table columns, enum values, versions, counts, schemas,
  guards, quotas. If it can be checked against a source, it must have been.
- Re-verify against the source AT THE MOMENT of writing, not from conversation
  memory: memory of a file read long ago drifts exactly like code drifts.
- For a retro-spec, the code is the only authority: grep or read the actual
  file first, then write, and register the file in `documents` so the claim is
  citable. "I know this product" is never a source.
- Empty beats invented, always. An honest gap is actionable; a plausible
  fabrication poisons the whole spec.

## Code-facing names are English, always

Every name the code will carry (entities, fields, enum values, state paths,
events, actions, parameters, surfaces, components, roles, collections) is
authored in English whatever the product's or the user's language; only prose
with no effect on the simulation (descriptions, rationales, glossary
definitions, briefs) may follow the user's language, and end-user copy follows
the product's. Naming follows the direction: spec to code, the code reuses
the spec's names by default; code to spec, the spec names in the product's
words and the span carries the exactness. The full law is in
lyriks-behavior ("The vocabulary language law"); it binds the `data` section
here as much as the behavior model. Never code in French from a Lyriks spec:
fix the spec first.

## Narrate, checkpoint, and never invent a product decision silently

Two things the humans around this MCP must never lose: WHAT you are about to
write, and WHICH choices you made on their behalf. This protocol binds every
skill that writes through the MCP (behavior, retrospec, delivery included).

**Announce before you write.** Before every batch or section write, three
lines in product words: what you are about to author, on which section or
feature, and the product decisions it embeds. A product manager must be able
to read the announcement; the engine's vocabulary never appears in it.

**Checkpoints.** After each of these, a recap (written / decided / remaining):
scope declared; foundation written; feature tree built; each leaf's behavior
depth authored (each core when leaves are many); data reconciled; experience
scaffold and screens built; audits green; and right before `finish_project`.
The recap lists every product decision taken since the previous checkpoint.

**Two kinds of choice.** Modeling MECHANICS (enum or boolean, which surface
holds a state, a rule's category, an effect's shape, how many scenarios, ids)
is your job: decide, never ask, never list. A PRODUCT DECISION is one where
two reasonable product managers could answer differently AND the answer
changes what a user experiences or what is in scope: the scope mode, the
feature split, who may do what, the lifecycle states of a thing, a threshold
or quota, what a blocked user sees, two sources that disagree, the name of a
central concept, what is left out. The test: "if I am wrong, will a user of
the product notice?"

**A product decision is never invented silently.** Take the best-evidenced
option and RECORD it together with the alternative you set aside:

- in `rules.issues[]`: `kind` = `missing_rule` (a case nobody decided) or
  `ambiguity`, `status` = `in_review`, `title` = the question in product words,
  `detail` = the option taken, the alternative(s) and why, `relatedFeatureId`
  when it belongs to one feature, `sourceIds` for the evidence. The human later
  settles it (`resolved`, `accepted_risk`) or reopens it.
- **Title grammar (every issue, every kind).** The title is read on a card by
  someone who does not have the spec open: SUBJECT FIRST, the thing that is
  wrong, under 80 characters, no reasoning. "Sidebar colour has no dark-palette
  value", not "The navigation rail is already dark, so it means nothing in a
  dark palette". The why, the option taken and the alternative go in `detail`.
  Always set `relatedFeatureId` when the issue belongs to a feature: it is what
  names the subject on the card.
- for scope-level decisions, an `approvals` row (`area`, `title`, `status` =
  `in_review`, `note` = the decision and the alternative), as the scope rules
  already require for omissions.

That register is what the checkpoint recap reads from, and it is where the
human reviews decisions: in the product, on their own time, not in the chat.

**Two modes, chosen by the user's words.**

- *Autonomous* (default): decide, record, recap at checkpoints, keep going.
- *Accompanied* ("accompagne-moi", "je veux valider", "explique-moi avant",
  any ask to be walked through): same loop, never paused for a decision. The
  draft simulation is what answers "what does this choice imply", so decide,
  record, test it in the draft at once, and at every checkpoint present the
  decisions taken since the last one as ONE numbered recap: one line of
  context in product words, the option taken, the alternative set aside, what
  a user would see, and the draft's verdict on it. At most five headline
  items, ranked by impact (scope > roles > lifecycle > rules and thresholds >
  naming); the rest is in the register. The user corrects what matters to
  them and the next turn realigns; silence means the decision stands.
- The loop stops for exactly three things: a decision that contradicts the
  original ask or scope (a scope change in disguise), two sources that
  disagree and the product itself does not settle (`flag_conflict`, a human
  decides), and a destructive operation. Everything else is a recorded
  decision, never a question. Use the runtime's native question tool (Claude
  Code: `AskUserQuestion`) only for those three.

**The feature card comes before the batch.** Before each leaf's behavior
batch, write four to six lines in product words: who can do what, the states
the thing goes through, the guards that block, what a blocked user sees. The
decisions the batch embeds are decided on the card and recorded there; the
ops carry none of their own. That is what keeps a 30-op batch from turning
into 30 decisions to review. (The card is the ephemeral form of the feature's
intent block, specified in `docs/skills/lyriks-intent-and-review.spec.md`;
once the engine carries it, read and update that instead.)

**Phrasing a decision for a human.** No engine word ("surface invariant",
"reachability goal", "state override"): say "what must always stay true",
"what a user can always reach", "the situation we start from". One sentence
per option, ending with what the user would see. If a choice cannot be phrased
that way, it is mechanics, not a product decision, and it is yours.

## Scope first — the reference set is not the generated model

The model cannot detect a capability it never inventoried. Before building the feature tree:

1. Read every supplied source (brief, existing product, research, regulations, agreed delivery boundary) and register it in **documents**.
2. Choose `scope.mode` only from explicit intent:
   - `full_product`: the user asked to cover the whole product; exclusions and deferrals are forbidden.
   - `selected_scope`: the user named a bounded subset; omissions require rationale + a settled approval.
   - `prototype`: the requested output is explicitly a prototype; omissions still require rationale + a settled approval.
   - If the boundary is ambiguous, leave `unclassified` and ask. Never silently downgrade a whole-product request to a prototype.
3. Inventory every externally expected capability in `scope.capabilities[]`, cite its `sourceIds`, then decide its `disposition`. Map every `included` item to real leaf `featureIds` once the feature tree exists.
4. Never derive this inventory by looking only at the features you authored: that is circular coverage and is exactly what this ledger prevents.

## The one-line kickoff (from scratch)

The user may hand you one sentence and nothing else: *"With the help of the
Lyriks MCP, specify the Lyriks project "Acme" (id acme-1a2b3c) from scratch,
from the Jira backlog and the Notion pages (through their MCPs connected here,
or the files of this repository), and ask me what they cannot tell you."*
Everything else is here. Never ask for a fuller brief, and never wait for one.

1. **Load the playbooks first.** Call `sync_skills` with `client` set to what
   you are, install what it returns the way each `installTargets` entry says,
   and follow this skill in full.
2. **Resolve the target project, never create a second one.** The sentence
   says *create the Lyriks project "Acme"* (optionally *in the domain "X"*):
   create it first with `create_wizard_project` (that name, the domain
   resolved by name through `list_domains`), unless an empty project of that
   name already exists, which you reuse. The sentence names an existing
   project: `list_wizard_projects` resolves the name or the id. Unnamed: ask
   which project, do not guess.
3. **Harvest the sources the same client reaches through its other MCP
   servers, and register each one in `documents` the moment it gives you
   something, with the web address the tool response carries** (see *Sources
   & citations*: a reader must be able to open what you cite). You are the one client that holds
   them all, so read each with its own tools:
   - a Jira, Linear or GitHub backlog: epics and stories become the feature
     tree and the roadmap; acceptance criteria become rules and scenarios;
   - Notion or Confluence pages: briefs, personas, decisions and vocabulary
     feed `foundation`, `users`, `glossary`;
   - BMAD documents in the repository (PRD, architecture document, epics and
     stories) and Spec Kit files (spec.md, plan.md, tasks.md, constitution):
     `foundation`, `features`, `architecture`, `rules`, the roadmap;
   - Figma files: `experience`, per lyriks-design;
   - documents the user hands you (PDF, deck, interview): wherever their
     content belongs, cited line by line.
4. **What no source says is a question, batched.** The narration protocol
   above applies unchanged: `scope.mode` first, product decisions recorded and
   presented at checkpoints, the final `finish_project` go. Never invent to
   fill a gap a source left open; empty beats invented.
5. Then the build order below, in order, with every section assessed.

## Build order (persisted and resumable)

On an existing project, start with `get_section(scope)` + `assess_project_completeness`. Resume from unresolved capabilities, non-ready section assessments, and report issues; do not restart or rely on chat memory.
For a batch of projects, start with `assess_portfolio_completeness`; it is read-only and returns the persisted status plus leading blockers for every visible project. Audit/finish projects individually so one stale or ambiguous scope cannot mutate the rest.

1. `create_wizard_project` (or use the existing v3 slug) → **documents** → **scope** inventory.
2. **foundation** — author `identity`, `definition` and `operations` in the single document.
3. **features** (cores→families→leaves, MVP, releases), then immediately load `/lyriks-behavior` and author full behavior depth on every included leaf. A 0%-maturity included feature is a defect unless the user explicitly asked for shells. If the user names a target TRL ("stop at TRL 5"), accept it: author each leaf to that level per the TRL ladder in `/lyriks-behavior` and report the run as "authored to TRL x", not complete.
4. **users** (personas first; do the final capability/permission pass after Features + Experience exist).
5. **data** → **rules** → **architecture**, with every claim and tech choice tied to the evidence register. The data model is a picture of the product's REAL records and of how they hang together, so authoring it is a loop, not a dump: write, read the write's `coherenceIssues`, fix, until it is clean. Every entity carries the relation to what owns it or is pointed at by what references it; a table nobody points at and that points at nothing is an orphan, and orphans are a defect (see *No orphan table* under Authoring quality).
6. **experience scaffold**: journeys, linked steps, screen/component metadata, theme, state seeds, entry screen and collections; leave `builder.nodes:{}` and `builder.screenRoots:{}` empty until `build_screen`. Load `lyriks-design` BEFORE authoring `builder.theme` and follow its Rule 3: derive the identity from the product (brand adjectives, light-first surface choice, domain-coded accent) and set every theme lever explicitly (all seven colors, font, per-type radii, per-type hover, density). Never ship the default theme, and never the reflex dark-background + green-accent look without a written product-specific reason.
7. `import_data_collections({project_id})`: seeds the simulator backend from the data section's entities so lists/forms bind to real shapes. Never import while the last data write still reports an `unrelated-entity` issue: the collections would freeze the orphans.
   **Then author REAL demo rows — generator rows are placeholders, not a demo.** Set `builder.collections[].rows`
   (patch_section): explicit records keyed by field name (max 50), seeded INSTEAD of generated values — the only
   way to get correlated fields (a "Free" plan priced 0, a failed run whose errorMessage matches its status).
   Missing fields gap-fill from the generator. Also set per-field `options` pools on fields a `createRecord` flow
   will gap-fill (e.g. a new Zap's status → `["on"]`), so user-created records look right too.
8. **`build_screen`** once per screen and reusable component. Before this step load `lyriks-design`; follow component-first and responsive-by-default on every build and edit.
9. Targeted Experience edits with `patch_section`, then the final **users** permission pass over system, feature, journey and surface capabilities.
10. Explicitly author/review the remaining contexts: **glossary**, **supervision**, **finops**, **approvals**, **baselines**, **coherence**, **documents**. A context may be derived or not applicable, but it may never disappear silently: record that decision in `scope.sectionAssessments`.
11. Update every `scope.sectionAssessments[]` row. `ready` means it was actually reviewed. `not_applicable` needs a rationale + settled approval and is forbidden in `full_product`.
12. Run the local Experience/behavior verification loop below, then the global completion protocol. Any subsequent save invalidates the audit, by design.

## build_screen layout spec (the compact language)
Root = a group. Group: `{ label?, direction:'row'|'col', justify?, align?, gap?, padding?, wrap?, card?:true, maxWidth?:'sm'|'md'|'lg'|'xl', presentation?:'overlay'|'tabs', tabsKey?, componentId?, visibleWhen?:{path,op?,value?}, children:[...] }`.
- **`card:true`** → real surface container (bg+border+shadow). **`maxWidth`** → caps AND centres the column (chat threads, forms, plan cards, modals). *(These two were added so you no longer need a follow-up patch to get containers.)*
Element: `{ el:'heading'|'text'|'input'|'button'|'link'|'list'|'form'|'container'|'image'|'status', label?, variant?(button emphasis | status:'loading'|'empty'|'error'|'success'), inputType?, nav?:'<screenId>', setState?:['path','val'], on?:[{trigger?,navigate?|setState?|toggle?|increment?|call?,when?}], visibleWhen?, bind?:{kind:'collection',ref:'<collectionId>'} }`.
- Async/streamed feel: `on:[{trigger:'click', call:{label, loadingPath, resultPath, resultValue:'true', latencyMs}}]` + a `status` element gated `visibleWhen:{path:loadingPath, op:'truthy'}`.
- Overlays/modals: a group with `presentation:'overlay'` + `visibleWhen` + `card:true` + `maxWidth:'sm'`.

## Authoring quality (recette-hardened — every canonical section is accounted for)
These are the failure modes seen on real analyses (Beaba.fr). Apply them on every fill.
- **Fill or explicitly assess every section from its `describe_section` schema.** The canonical list is `scope`, `foundation`, `users`, `features`, `experience`, `rules`, `data`, `architecture`, `coherence`, `glossary`, `supervision`, `finops`, `approvals`, `baselines`, `documents` — 15 sections. (`contract` and `generation` were dropped from the platform; they are no longer sections and `describe_section` rejects them.) The common accidental empties are glossary, users/permissions, Foundation operations, documents and rules. A derived/not-applicable section is a recorded decision, never an omission.
- **No orphan table, and the check is automatic.** Every `set_section` / `patch_section` on `data` answers with `coherenceIssues`; an `unrelated-entity` issue names each table that neither points at another table nor is pointed at, and `assess_project_completeness` repeats each one as a `data-entity-unrelated` warning that fails the `data` check. Read the response of EVERY data write and resolve the issue in the same pass: add the relation the product really has (ownership: a Line to its Invoice, a Member to their Workspace, a section row to its Project; reference: a Ticket to its Assignee; provenance: a row to its Source), or, for a genuinely standalone table (a lookup, a singleton setting), say so in its description. Never silence it by inventing a relation, never leave it for the next session, and never mark the section `ready` while one remains.
- **Multi-column collections: respect column semantics; complete-row-or-none.** Each column means a distinct thing. For **Business SLAs**: `metric` = *what's measured* (e.g. "Store availability" — **no number in it**), `commitment` = *the numeric target* (e.g. "99.9%"), `penalty` = *the consequence*. Never jam the target into the metric label. Author **all** required columns of a row, or don't create the row — a half-filled row is worse than none.
- **Never fabricate contractual / SLA / pricing / legal / penalty values.** If the brief or site doesn't state it, **leave it empty** rather than inventing a plausible-looking value (these carry quasi-contractual weight). Same for regulations/legal constraints: only what's sourced.
- **Languages & locales: read the real source, don't guess.** Derive from the product's language switcher / `hreflang`, not the "obvious 3-4". Capture **every** language (don't drop IT/NL because they're less common) **and** the country×language split (e.g. `fr-BE` vs `nl-BE`) — put locales in `foundation.operations.i18n.locales`, not just bare language codes in "languages to support".
- **Architecture: every tech choice carries its official reference doc — MANDATORY.** Register the docs in `documents` first (see *Sources & citations* below), then set `referenceDocId` on **every** `techChoices[]` entry to one of those source ids, and list the same ids in `architecture.sourceIds[]`. `referenceDocId:null` is acceptable **only** when the tech genuinely has no official documentation (bespoke/internal tooling) — never because you skipped the lookup, and **never with an invented URL** (a fabricated doc link is worse than an honest null). This is THE promise of the Architecture tab: tech→doc referencing alone is 35/100 of its coherence (issue `unreferenced-tech`). *(Architecture no longer has its own `referenceDocs[]` — a legacy one on an older project is folded into the register automatically; read it there, never re-author it.)*
- **Form factors ("Software type") are not optional.** Pick the factors that match the product (a website → `web_interface`; an API → `api`; …). Never leave the default empty selection — an empty form-factor set reads as "SaaS/unknown" downstream.
- **Scores: aim coverage + coherence high; don't chase 100% readiness.** Coverage (breadth) and coherence (no contradictions) are legitimately targetable to ~100 from an analysis — loop on their gap lists to close them. **Readiness/TRL is 60% gated on production maturity** and will stay moderate for an analyzed-only spec — that's by design (a spec is not production-proven), so 85–95% ≈ 100% of what an analysis can assert. State this instead of "failing" to hit 100.
- **Every bound list gets a row-template component — never ship the default row.** The built-in compact row
  guesses two display fields; for entities whose leading columns are ids it reads as "# / #1000". Build a small
  row component per collection (`{Field}` interpolation, pill badges via `appearance` background/radius:999)
  and attach it with the list's `componentId`. The default row is a fallback, not a design.
- **Create flows must CREATE — use `createRecord`, not just state flips.** A "create X like a user" flow is:
  inputs whose LABELS exactly equal the collection's field names (label "Name" fills field `name`), `validations`
  (+ `requireValid` on the submit button) for real form errors, and a `createRecord:"<Collection>"` transition on
  submit — the run engine captures the typed values into a real new row that shows up in every bound list.
  Prove it with `simulate_experience` (collection count increments).
- **Every action must declare its rules.** "Which rules are active" is the product's core reading, so an `add_action` op is **rejected** unless the same batch carries an `add_action_rule` on that action's `ref`. Before writing an action, ask what gates it — permissions, state, quota, validity — and encode that. An action that truly is unconditional says so as a rule: no `condition`, `effect:{type:"allow_action"}`. Never leave the gating unstated.
- **Batch limits.** `apply_behavior_batch` times out on large batches — split into halves. If the kernel refuses a legitimate type or shape (an `int` parameter, a compound condition, a reachability goal), that is an outdated engine, not a hint to write something weaker: report it instead of encoding around it. Every workaround invented here becomes a lie the model keeps.

## Validate the spec against the code (code-to-spec) and OFFER it yourself

On any project that models an EXISTING codebase, the spec is only trustworthy
once it is validated against the code. This MCP carries the full flow; use it,
and PROACTIVELY SUGGEST it to the user whenever you judge it useful, at minimum:
when a retro-spec reaches behavior depth, when a claim cannot be traced to a
read source, and whenever the user wonders whether the spec matches the code.

- **While authoring from code**: attach the files you actually read
  (`attach_source` kind "code", or register them in `documents`), stage what you
  saw but did not model (`stage_candidates` / `dispose_candidate`), and pin each
  modeled element to the exact span it came from (`record_element_spans`).
  `finalize_analysis` is evidence-gated and refuses while anything is untraced.
- **After authoring, and only once the model has stopped moving**:
  `seed_implementation_index` from the finalized spans. Seed LAST. Every entry is
  stamped with the spec version at seed time, so authoring that lands afterwards
  makes all of them read stale and turns the whole drift report into noise. Then
  `sync_implementation_index`, and read its `orphans` block (keys matching no
  entity) and its `shared` block (keys several features declare, where one entry
  can only locate the last one seeded).
- **Then reconcile**: `get_implementation_gaps` with no `feature_id` for the
  project roll-up, then per feature for the elements themselves; and
  `get_implementation_drift`, whose stale rows carry a `scope`: `element` names
  the entity that actually moved, `feature` means only the feature-wide stamp
  existed and the row is suspect by association. Report both honestly; they are
  the reconciliation of spec and code, not a formality.
- **Continuously**: `get_provenance` answers "where does this element come
  from"; use it before asserting that a modeled behavior matches the code.

## Sources & citations — document where every claim came from (MANDATORY)
`documents` is THE project evidence register and the **single source of truth for evidence**: no other section keeps its own list of links. Everything else cites it by stable id through a `sourceIds: string[]` field. An analysis whose claims cite nothing is unauditable — and Lyriks exists to be auditable.

- **Register as you read, not at the end.** The moment a page, PDF, interview or standard gives you something you write into the spec, add a `documents.sources[]` row: `{id, title, kind, url, note}`. `kind` ∈ `interview|research|pdf|diagram|link|requirement|code|regulation|evidence|other`. `note` = the citation or the excerpt the claim rests on — the sentence you actually used, not a summary.
- **Reachable, or it is not a source.** Whoever reads the spec later (a reviewer, the next agent) must be able to consult what you cite, through one of two doors. Door 1: `url` is a web address anyone can open: the Notion page, the Jira issue, the Confluence page, the Figma file, the GitHub file or commit, the official docs. A source you read through another MCP always has one, the tool response carries it: use it. Door 2: the source has no address (a PDF handed over, an interview, a chat, a file on your disk): leave `url` empty and carry in `note` everything the spec relies on, verbatim, with where it came from. Never type a `file://` path, a local path or a plain reference into `url`: it opens for nobody, the write answers with a `coherenceIssues` line per such row, and `assess_project_completeness` repeats it as a `source-unreachable` warning that fails the Source traceability check (a row with neither url nor note is `source-empty`). Fix every reported row in the same pass. A code file you read goes through `attach_source` (readable back through `list_sources`); its register row carries the repository's web address for the file, or the repo-relative path in the note.
- **Then cite it from wherever the claim is made.** Add the source id to the `sourceIds[]` of the object that asserts it:

  | Section | Field |
  |---|---|
  | foundation | `foundation.definition.<section>.sourceIds` — one per section (`businessObjective`, `market`, `competition`, `business`, `technical`, `security`) |
  | users | `roles[].sourceIds` |
  | features | leaf `leafMeta.<id>.sourceIds` |
  | rules | `issues[].sourceIds`, `scenarios[].sourceIds` |
  | glossary | `terms[].sourceIds` |
  | architecture | `sourceIds[]` + `techChoices[].referenceDocId` |

- **Cite the claims that carry weight, at minimum.** Regulations and legal constraints, market/competitor claims, SLA and pricing figures, every governed glossary term that comes from a standard, every persona derived from real research, and every tech choice's official docs. If it would make a reader ask *"says who?"*, it needs a source.
- **A citation is not a substitute for honesty.** The rule above still holds: if the source doesn't state a contractual/SLA/pricing/legal value, leave the field empty. Never invent a source to justify an invented value, and never point a citation at a URL you didn't actually read.
- **Ids are the contract.** Keep source ids stable across writes and never delete a row that is still cited — the app surfaces the dangling citation ("1 linked source no longer exists") rather than hiding it, and Traceability scores coverage from these links.

## Verify locally, then prove global completion
- `simulate_experience({project_id, start_screen_id, actions:[{label|nodeId, type?}]})` — drives the real run engine; check `ok`, `errors:[]`, `visited`, `state`, `activity`. (A button with a `transition` is no longer mis-flagged as "unbound".)
- `verify_experience` — per-journey `reachedFinal` + the Gherkin/acceptance spec. `get_experience_coverage` — local 0–100 Experience readiness + gaps with `ref:{screenId,nodeId}`.
- Navigation inside a reused `componentId` group now counts toward reachability (a sidebar's links make their targets reachable).

These checks only verify what already exists in the model. They cannot detect a capability omitted from the source inventory and never authorize saying “the whole project is complete.”

Global protocol:

1. `assess_project_completeness({project_id})`.
2. Resolve every blocking `issues[]` item through the owning section. Re-run until the only possible blocker is audit freshness.
3. `audit_project_scope({project_id})` to snapshot the current external scope and every project-section revision.
4. Re-read `assess_project_completeness`. If anything changed after the audit, it is stale: fix/re-audit.
5. Call `finish_project({project_id})` only when the user asked to complete the project. Only a response with `completed:true` authorizes saying it is complete. A high section score, 100% Experience coverage, a clean simulation, generated evidence, or an agent's own review does not.

When work stops before `finish_project`, report the exact persisted status and blockers: “authored”, “authored to TRL x” (a user-set depth cap, see `/lyriks-behavior`), “locally verified”, “ready for audit”, or “blocked by …”. Never translate one of those into “complete.”

Once the spec is authored and validated, the work that FOLLOWS from it (tickets, stories, sprints, and the re-sync when code lands) is governed by `lyriks-delivery`. Load it instead of improvising a convention, and never copy modeled behavior into a tracker: the spec has one home.

## See it (visual loop the MCP can't give you)
`node scripts/causette-shots.mjs` (Playwright) drives the app's Run mode and saves device-frame PNGs of every screen + key states (empty/answered chat, overlays, spinner) to `docs/causette-shots/`. Read those PNGs to verify layout, then patch/rebuild. Adapt `SCREENS`/`PROJECT`/`CAUSETTE_BASE` for another project. (One-time: `npx playwright install chromium`.)

## Known coherence noise (by design — don't chase these to 100)
Some coherence dings are expected on a sound spec; recognise them instead of burning passes:
- **Foundation "No roll-out strategy chosen" on a greenfield product** — there is nothing to migrate; leaving `operations.migration.strategy` empty is correct.
- **Rules < 100 with "N issues still open"** — open/accepted-risk issues are a healthy spec, not a defect.
- **Readiness/TRL 85–95, not 100** — 60% is gated on production maturity; a spec is not production-proven. Report this as "100% of what an analysis can assert," not a failure.

## Gotchas
- `tabs` presentation selects the active panel by **numeric index** stored at `tabsKey` (default 0), not by a label. Seed `{path:tabsKey, value:'0'}` or prefer stacked groups for always-visible content.
- `set_section` needs the WHOLE section document; for the big Experience builder use `build_screen` + `patch_section` instead of resending `builder.nodes`.
- `build_screen` lists render one row from the element label; for bullet lists use multiple `text` elements (a `\n` in a single label is not split).

## Authoring upgrades (2026-07-21)
- **createRecord `fieldMap`** — when an input label can't equal the collection field name, add `fieldMap: {"<field name>":"<input label>"}` on the createRecord effect (build_screen/wire_element `on` entries). A createRecord that captures zero inputs now surfaces in `simulate_experience` → `warnings`; treat that warning as a bug in your screen.
- **simulate `expectError:true`** — put it on a step that is SUPPOSED to fail (blocked click, guard rejection): its errors are consumed (`ok` stays true, `expectedErrorMet:true` on the action), and raising no error fails instead. Script negative paths explicitly.
- **patch_section `match`** — keyless collections (users `permissions[]`) merge/remove via `match:{roleId,capabilityId}` instead of `id`; inserts via match never inject an `id`. `collection` also takes dotted paths ("builder.collections.0.fields").
- **import_data_collections** now returns `fields` per entity (id/name/kind/`options`) so you can see enum pools survived without re-reading the section.
- **Users ordering** — author features + experience BEFORE the final permissions pass. System capabilities are optional and enter scope only when explicitly granted.
- **verify_experience** — `engine.specGaps` items on projected mirror surfaces are flagged `mirrorDerived` and excluded from the critical count; only authored gaps are real debt. Repeated identical `coherenceIssues` on consecutive writes are collapsed to `coherenceIssuesUnchanged`.

## Interactivity upgrades (2026-07-22 — per-row actions, real controls)
The simulator no longer stops at "one screen-level button under a list". Use these
instead of faking them; `/lyriks-design` Rule 4 is the mandate, this is the how.
- **Per-row actions** — author them INSIDE the list's row-template component. Every element
  there acts on the row it renders in: `on:[{trigger:"click", selectRecord:"catalog.app"}]`
  publishes that record to state (`{catalog.app.name}` anywhere, `{catalog.app}` = row id),
  and a `setState` value may interpolate `{Field}` from the row. Never put a "Connect this
  app" button under the list — it cannot know which row the user meant.
- **Per-row conditions** — a `visibleWhen`/`when` path naming a ROW FIELD is evaluated
  against that row (`{path:"status",op:"eq",expected:"expired"}` → a Reconnect button only
  on the broken connections; hide "Choose" on the current plan).
- **Row layout** — a bound list takes `rowLayout:"stack"|"grid"|"cards"` + `rowColumns:1-4`.
  Pricing tiers / app catalogs / tile dashboards are `cards` (they wrap responsively).
- **Controls** — `el:"select"` (`options` or `optionsFrom:{collection,field[,filterField,
  filterPath]}` for live + dependent choices), `el:"checkbox"` (real boolean), `el:"textarea"`.
  They validate and fire `change` like an input; in a row template each row keeps its own value.
- **Prove it** — `simulate_experience` actions accept `rowIndex:<N>` (N = the rows currently
  visible, i.e. after the live search filter); the result echoes the `rowKey` that was hit.
  A per-row flow that isn't proven with a `rowIndex` step is not verified.
