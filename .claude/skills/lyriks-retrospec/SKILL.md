---
name: lyriks-retrospec
description: "Reverse-engineer an EXISTING product into its Lyriks spec (retro-spec), product-first: model what its users see and do, in their words; the codebase is evidence, never the subject. Triggers on 'ingest this codebase', 'retro spec', 'reverse engineer this app', 'spec the existing product', 'clone this app into Lyriks', 'adopt this product', 'start from a codebase'. Wraps lyriks-build with the product-language law, real-theme extraction, UI-walk screen inventory and behavior-complete data modeling, so the user barely needs to intervene."
---

# /lyriks-retrospec

Turn a product that already exists into its Lyriks specification. Lyriks
captures PRODUCT knowledge: what the product does for its users, how it looks,
what information it manages, who may do what. It is not a codebase browser.

**The one law: the code is evidence; the product is the subject.** You read
source files to know what is true, but what you WRITE describes the product a
user experiences. If a section would only make sense to the team that wrote
the code, it is wrong.

The finished spec's reader is a product manager, a designer, or a newcomer
seeing the product for the first time. Test every sentence against that
reader.

## The one-line kickoff

The user owes you one sentence, nothing more: *"With the help of the Lyriks
MCP, ingest this entire codebase into the Lyriks project "Acme" (id
acme-1a2b3c)."* Everything else is here and in the MCP's own instructions.
Never ask for a fuller brief, and never wait for one.

1. **Load the playbooks first.** Call `sync_skills` with `client` set to what
   you are, install what it returns the way each `installTargets` entry says,
   and follow this skill in full. If the catalog does not carry
   `lyriks-retrospec`, say so: this install does not ship it.
2. **Resolve the target project, never create a second one.**
   - The sentence says *create the Lyriks project "Acme"* (optionally *in the
     domain "X"*): create it first with `create_wizard_project` (that name,
     `source_mode: "code_to_spec"`, the domain resolved by name through
     `list_domains`), unless an empty project of that name already exists,
     which you reuse. Then author into it.
   - The sentence names an existing project: `list_wizard_projects` resolves
     that name or id to the project you author into.
   - It names none: the target is the card whose `sourceMode` is
     `code_to_spec` (created "From a codebase" in Lyriks) and whose
     `featureCount` is still 0. Several qualify: ask which. None exists:
     create one with `create_wizard_project`, then set its Foundation identity
     `sourceMode` to `code_to_spec`.
   - Author every section into that project and never change its
     `sourceMode`.
3. **"Entire" means entire.** Walk the whole product, not a sample: every
   entry point, every navigation item, every screen, form and table. Stop only
   at the Order of work's end, and at the questions the Low-intervention
   protocol allows.

## The product-language law (non-negotiable)

Everything authored in `users`, `features`, `foundation`, `experience`,
`data`, `rules`, `glossary` and journey/step names uses the words a daily USER
of the product would say.

Banned outside the `architecture` section and provenance spans:

- file, folder, module, component, class, function and variable names;
- framework, library and infrastructure vocabulary (stores, endpoints,
  props, middleware, ORM, container names);
- repo-derived feature names ("parse-experience-builder handling" is a
  module; "Design screens visually" is a feature).

Litmus test before every save: would a non-engineer who uses this product
daily recognize this name and this sentence? If not, rewrite before saving.

Register is not language. This law governs the REGISTER (the user's words, no
code jargon); lyriks-behavior's vocabulary language law governs the LANGUAGE
of code-facing names: entities, fields, enum values, state paths, events,
actions, parameters, surfaces, roles and collections are English even when the
product is French. The product's French lives in the labels you transcribe
and in the descriptions, never in a name the spec-to-code map will carry.
The platform already enforces the edges (the glossary rejects code
identifiers; data entities are named in the Glossary's words); your job is to
apply the same register everywhere in between.

## Walk the UI, not the file tree

- Inventory the product the way a user meets it. Run the app when you can
  (load the project's run skill if one exists); otherwise read the router,
  navigation and layout files AS EVIDENCE and transcribe what they render:
  every nav item, page heading, tab, dialog, empty state, banner.
- Know what you are looking at when the app runs: a live instance renders the
  product's chrome THROUGH whatever demo project it happens to hold. The
  CODEBASE is the source of truth for the Experience; screenshots are
  comparison evidence. Transcribe the chrome (layout, labels, tokens, empty
  states); NEVER transcribe the loaded demo project's data - its project
  names, personas, cores, counts, scores or verdicts are that project's
  content, not the product, and must never leak into the model.
- The feature split is by USER CAPABILITY (what can be done with the
  product), never by module. Folder names never name features. Cores are the
  product's pillars as a user would list them.
- Journeys are the real paths through the real navigation, one per goal a
  persona actually pursues.
- Roles come from the product's real authentication and permission behavior,
  not from a `roles` enum's spelling.
- Transcribed screens must be faithful copies of what the end user sees:
  same labels, same ordering, same vocabulary, same casing. Empty fields
  beat invented ones; if you did not see it, leave it out and say why.

## Design fidelity: extract, never invent

The first rendering must look like the product, not like a generic mockup.

1. BEFORE any `build_screen`: extract the real theme from the product's own
   assets (brand CSS custom properties, Tailwind config, design tokens,
   computed styles of the running app): accent, background, ink, font
   families, radius, density, dark or light. Set `builder.theme` from that
   evidence (nearest `preset` first, explicit values on top).
2. Load `lyriks-design` and follow it; transcribe each screen top-down like
   nesting dolls (shared chrome, skeleton, sections, elements), making every
   pass content-complete.
3. Verify side by side: `verify_experience` frames against the real screens.
   A screen that does not look like the product is a defect to fix in the
   same pass, not a draft to improve later.

## Data model: behavior-complete, product-named

The data section is reconciled from TWO mandatory sources; neither alone is
enough.

1. **Everything the behavior model knows.** Enumerate every entity, typed
   state and event across ALL leaf features (`get_behavior_context`,
   `get_knowledge_graph`, feature snapshots). Every behavior entity must
   exist in `data.entities`, or be explicitly excluded with a written
   rationale. `assess_project_completeness` reports every uncovered behavior
   entity as a `behavior-entity-unmodeled` warning: a retro-spec is not done
   while one remains.
2. **Everything the UI shows.** Table columns, form fields, detail pages,
   filters and badges are the product's real field list and real enum
   vocabulary. `enumValues` are the exact words visible in the product.
3. **Every relation the product really has.** Relations come from what
   screens show together AND from what the code stores together (foreign
   keys, owner ids, `xxxId` fields, join tables, a `projectId` on every
   section row). Every entity carries the relation to what owns it or is
   pointed at by what references it; a table nobody points at and that
   points at nothing is an orphan, and orphans are a defect. The platform
   checks it on every data write (`unrelated-entity` in the write's
   `coherenceIssues`) and in `assess_project_completeness`
   (`data-entity-unrelated`, which fails the `data` check): read the
   response of each data write and fix the orphans in the same pass, from
   evidence, never by inventing a link. A genuinely standalone table says
   so in its description.

Name entities and fields in the product's words (the Glossary's words), never
in the schema's (`Invoice`, not `invoice_record_v2`). Then
`import_data_collections` (never while an `unrelated-entity` issue is still
open), and seed demo rows that look like the product's real data, copied from
what it displays.

## Adopting the codebase: when, why, and what first

Adoption is the evidence chain UNDER the retro-spec: every modeled element
traced to the exact code span it came from, spotted-but-unmodeled behavior
parked as candidates, and the spans seeded into implementation coverage so
spec-vs-code drift detection is armed.

**Adopt (default) when the repo is yours and alive**: you will keep changing
this code, so you want `get_implementation_gaps` / `get_implementation_drift`
to notice when code and spec diverge, and you want the spec auditable (the
finalize gate refuses an element nobody traced, so nothing can be invented).

**Skip adoption when the spec is one-shot or the code is out of reach**: a
competitor teardown, a UI-only transcription, a product you will never
maintain. Tracing spans costs a full read of the implementing files; spend it
where drift detection will pay it back.

Before adopting, in this order and for these reasons:

1. **Walk the UI and split the features FIRST.** Spans are recorded per
   feature analysis; a wrong split means re-tracing everything. The split
   comes from user capabilities, so it must exist before any code is read
   in anger.
2. **Register the code sources properly**: `attach_source` with
   `kind:"code"` and the file's repo-relative path, only the files that
   carry behavior, never the whole tree. The path lands verbatim in the
   implementation index, so a wrong path poisons drift detection later.
3. **Keep the product-language law up.** Adoption reads code all day, which
   is exactly when technical naming creeps into the model. The element is
   named for the user ("Archive a conversation"); the SPAN points at the
   code. Both, never a compromise between them.

**The mapping law (one concept: adopt, implement, trace).** A spec↔code
mapping is only real when the code itself is captured. Never record or
report a bare `{file, line}`: that is a claim the engine cannot check, and
the dashboard stamps such locations `unverified`. The span flow IS the
evidence flow: attach the file, record the spans, finalize, seed, sync.
Spans carry the code, so every seeded index entry gets a real `signature`
line and the implementation panel can show the code beside the spec.
Pushing locations straight through `report_implementation_status` without
snippets produces an unverifiable report and is never an acceptable
shortcut for adoption. Leave zero unverified locations behind; if you
cannot capture the code, say so instead of reporting the location.

Then, per feature, while authoring behavior: read the implementing files,
model product-first, `record_element_spans` in batch, and park anything you
spotted but did not model with `stage_candidates` so it is not silently
dropped. Close every candidate with `dispose_candidate` (accepted names the
element it became; rejected and out-of-scope carry a rationale). Read
`get_provenance` before `finalize_analysis`: together they are exactly what
the gate checks. Finally `seed_implementation_index` and
`sync_implementation_index`, which is what turns the retro-spec into a
living spec instead of a snapshot. Seed LAST, once nothing else will be
authored: an entry carries the spec version it was stamped with, so any write
that lands afterwards makes every entry read stale and the drift report says
nothing. Read the sync's `shared` block too: a key several features declare
(a state path is not unique) holds ONE location, the last one seeded.

## Freeze the baseline, then count what you must cover

Two disciplines separate a retro-spec that finishes from one that drifts for
weeks. Both come from a field run that adopted a 47-module product into 83
features; neither is optional on a codebase you cannot hold in your head.

**Freeze one commit and read only through it.** Take the SHA at the start,
register it as evidence, and read every file with `git show <sha>:<path>`.
Never the working tree, never a shared branch: both move under you, and a
branch carrying partially merged work hands you two halves of two different
products in the same session. The freeze is what keeps a span recorded on day
one true on day four. Lift it once, deliberately, at the reconciliation step,
and say so when you do.

**Count the surface before you model it.** "Have I covered everything?" cannot
be answered without a denominator, and the denominator is never the file count.
Pick the smallest set of countable things such that, once each one is either
modeled or consciously dropped, the product holds no behaviour you have not
seen. Derive it from the repo's own spine:

| The repo is organised by | Count |
|---|---|
| domain modules (Nest, Spring, a modular monolith) | the modules, plus the persisted models |
| an ORM schema (Prisma, ActiveRecord, Ecto) | the models, plus the routes that write them |
| routes and handlers (Go, Express, serverless) | the public endpoints, grouped by resource |
| a front end over an API you do not own | the screens, plus the calls each one makes |
| layers rather than domains (controllers/, services/) | the persisted models first, then the entry points per model |

Two rules keep the count honest. A denominator must be **enumerable without
judgment**: one command lists it, and two people get the same list. And every
row must end at modeled or dropped-with-a-reason, never blank, so the ledger
can only be finished truthfully. Keep it outside the tool, beside the project,
and update it at the end of each slice.

**Log every ambiguity and resolve it by reading.** An item that could belong to
two domains (a join table, a rules engine that looks like routing) gets a line
naming the two candidates, the code that decides, and the verdict. Never
resolve one by preference, and never leave it implicit: the next session
re-litigates whatever you left unwritten.

**The atomic unit is the feature, not the slice.** Tracing, staging and the
finalize gate all take a feature id. A slice is done when every one of its
features is finalized; a half-finalized slice is not progress you can trust.

**Code first, intent second.** When the product also has target documents (PRDs,
a Figma the app has not caught up with), model the code baseline to completion
FIRST and treat those documents as the delta afterwards. The Experience is the
real screens, not the intended ones. Doing it the other way round produces a
spec that describes a product nobody has, and no gap you can act on.

## Low-intervention protocol

The user should not have to correct you; they should only decide.

- Ask the user ONLY: (a) the `scope.mode` at the start, (b) facts the product
  cannot show you (internal pricing, an admin area you cannot reach), and
  (c) the final `finish_project` go.
- Everything else: read, do not ask. Names come from the product, never from
  the user's patience.
- Report at checkpoints (scope declared, features authored, screens built,
  audits green) instead of asking questions at each step.
- This is lyriks-build's autonomous mode. When the user asks to be
  accompanied, lyriks-build's checkpoint protocol applies here too: decisions
  the product itself cannot answer are recorded in the same register and
  presented in the same batches.

## Order of work

1. `documents`: register the evidence (codebase, brand assets, any docs) as
   sources, each one reachable per lyriks-build's *Sources & citations* (a
   web address, or the content in the note; a code file attached with
   `attach_source`, never a local path in `url`); everything you author cites
   them.
2. `scope`: the capability inventory from the UI walk, each item tied to its
   sources. Choose `scope.mode` with the user.
3. `users`: roles and personas from real auth behavior.
4. `features`: the capability tree, cores as product pillars; then
   `lyriks-behavior` for FULL depth per leaf, evidence from the code. When
   adopting (see above), attach each feature's implementing files as code
   sources, record spans and stage candidates as you go.
5. `data`: the two-source reconciliation above.
6. `experience`: theme extraction, then screens per `lyriks-design`, then
   wiring and simulation.
7. `rules`, `glossary`, and the remaining contexts per `lyriks-build`.
8. Audits: `get_experience_coverage`, `find_inconsistencies`,
   `assess_project_completeness` (resolve every issue INCLUDING
   `behavior-entity-unmodeled` warnings), `audit_project_scope`, and
   `finish_project` only on the user's word.

## Relation to the other skills

`lyriks-build` governs sections and completion; `lyriks-design` governs
screens; `lyriks-behavior` governs feature depth; `lyriks-delivery` governs what
happens after, when the spec meets a tracker and the code starts moving again. This skill adds the
retro-spec laws on top: product language, UI-walk inventory, theme
extraction, and the behavior-complete data model. When they seem to conflict,
the product-language law wins everywhere except inside `architecture`.
