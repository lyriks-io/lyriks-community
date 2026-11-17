---
name: lyriks-retrospec
description: "Reverse-engineer an EXISTING product into its Lyriks spec (retro-spec), product-first: model what its users see and do, in their words; the codebase, the documentation or the prototype is evidence, never the subject. Triggers on 'ingest this codebase', 'retro spec', 'reverse engineer this app', 'spec the existing product', 'clone this app into Lyriks', 'adopt this product', 'start from a codebase', 'spec this prototype', 'retro-spec this mockup / Figma / design artifact'. Wraps lyriks-build with the product-language law, real-theme extraction, UI-walk screen inventory and behavior-complete data modeling, so the user barely needs to intervene."
---

# /lyriks-retrospec

Turn a product that exists into its Lyriks specification: what it does for its
users, how it looks, what information it manages, who may do what.

**The one law: the code is evidence; the product is the subject.** You read
the code to know what is true; what you WRITE describes the product a user
experiences, for a product manager, a designer or a newcomer.

## The one-line kickoff

1. **Load the playbooks**: `sync_skills`, install what it returns, follow this skill in full.
2. **Resolve the target project, never create a second one.**
   - "Create the project X": `create_wizard_project` (`source_mode: "code_to_spec"`, domain by `list_domains`) unless an empty one of that name exists.
   - A named project: `list_wizard_projects`.
   - From a design (a clickable prototype, a mockup, a Figma file): the
     same, with `source_mode: "from_figma"`; see *A product known from its
     prototype or its design*.
   - None named: the card whose `sourceMode` is `code_to_spec` and `featureCount` 0; several, ask; none, create one. Never change its `sourceMode`.
3. **"Entire" means entire**: every entry point, navigation item, screen, form and table.
4. **Read what done means first:** `assess_project_completeness` on the
   empty project lists what your work ends on; run it at every checkpoint.

## The product-language law

Outside architecture and provenance, use a daily USER's words.
Banned outside the `architecture` section, the infrastructure map and spans:
file, module, component, class, function and variable names, and framework
vocabulary (stores, endpoints, props, middleware, ORM). A non-engineer who uses
the product must recognize every name.

Code-facing names stay English (`lyriks-behavior`).

## Walk the UI, not the file tree

- Run the app when you can; otherwise read the router, navigation and layouts AS EVIDENCE and transcribe what they render: nav items, headings, tabs, dialogs, empty states, banners.
- A running instance shows its chrome THROUGH a demo project: transcribe the chrome, NEVER the demo's data (names, personas, counts, scores).
- Features split by USER CAPABILITY, never by module; cores are the pillars a user would list.
- Journeys follow the real navigation, one per goal a persona pursues.
- Roles come from real access checks, one per distinct check (*Count the surface*), never from a menu link.
- Each screen carries its real title, route and purpose. Not seen: left out, and say why.

## Design fidelity: extract, never invent

1. Read the identity from the product's assets (CSS variables, Tailwind config, tokens, fonts, logos, computed styles) and follow `lyriks-design` Rule 1: exact values under the code's names.
2. The palette (`brand.colors.palette`): primary, secondary, tertiary, each `base`, `hover`, `active` only where the stylesheet states that colour; text and surfaces in `brand.colors.semantic`; the stylesheet in `brand.sourceIds`. `check_design` holds a design file against it.
3. Every screen in `screens[]`, each journey step linked to its screen.

**When you cannot see, say so**, and ask for a screenshot or the theme file.

## Data model: behavior-complete, product-named

1. **Everything the behavior model knows**: every entity, state and event of every leaf exists in `data.entities` or is excluded with a reason; the audit reports the rest as `behavior-entity-unmodeled`.
2. **Everything the UI shows**: columns, form fields, filters, badges; `enumValues` are the words on screen.
3. **Every relation the product has**, from UI and storage evidence. Resolve orphans (`unrelated-entity`, `data-entity-unrelated`) or justify `standalone: true`. Record `onDelete` (`cascade`, `set_null`, `restrict`) only from code; required links never take `set_null`.
4. **Every field linked to the state that holds it**, as you capture: `link_data_fields` in the same pass, plus each table's existence state. `get_data_links` lists what remains; never link on a name alone. A field a person unlinked stays so.

Name entities and fields in the Glossary's words (`Invoice`, not
`invoice_record_v2`), and say on each journey step which records it reads or
writes (`stepDataReads`).

## Infrastructure code: the map, never a feature

Terraform, Terragrunt, Helm, manifests and Ansible say where the product lives,
never what a user does: no feature, screen, journey or role.

| Declared | Authored as |
|---|---|
| a VM, cluster, serverless runtime | `data.hosts` row (`kind`, `provider`, `region`) |
| a managed database, cache, search index | `data.databases` row on its host |
| a load balancer, gateway, queue, opened flow | `data.interfaces` row (`protocol`, `fromBrick`, `toBrick`) |
| Terraform, Helm, the cluster runtime | `architecture.techChoices`, `layer: "infra"` |
| encryption, data residency, backups | `architecture.constraints` row |

Read each value with what consumes it (a `yamldecode` call, a chart). Draw
production only. Tables come from the data model (`entities[].databaseId`).
Cite the files in `architecture.sourceIds`, and report that nobody watches it:
the map is a snapshot of the frozen commit. An infrastructure-only repository
feeds the project of the product it hosts. Never create a project for it alone.

## Adopting the codebase

**Code to spec always adopts, without asking**: trace elements, dispose
candidates, seed the index. Skip only on the person's word and report the spec
as a snapshot nobody watches.

1. **Walk the UI and split the features FIRST**: spans are recorded per feature.
2. **Attach the code properly**: only the files that carry behaviour, with the shipped script, never retyped: `node .lyriks/tools/attach-source.mjs <feature_id> <path...> --commit <frozen sha>`. A retyped file comes back altered and every span after the change points at the wrong text.
   **Where no script can reach Lyriks**, attach through the tool with exact
   content and `sha256` (`git show <sha>:<path> | sha256sum`). A mismatch stores
   nothing; resend the exact frozen text.
3. **Keep the product language**: the element is named for the user, the span points at the code.

**The mapping law**: capture code, never bare `{file, line}`. Supply snippets
to `report_implementation_status`; leave zero unverified locations.

Per feature: read the files, model product-first, `record_element_spans` in
batch, `stage_candidates` for what you did not model and `dispose_candidate`
for each (accepted names its element; the others carry a rationale), the
adversarial pass, `get_provenance`, `finalize_analysis`. Finally
`seed_implementation_index` with `sync:true` (it lands the entries in the same
call, the safe path where no script runs), write the entries into
`.unspa.json`, and read `synced.incomplete` and `shared`. Seed LAST: a later
write makes every entry stale.

## Every element says where it comes from

1. **Use reachable product history too**: connected trackers, wikis, drives, PRs, Figma, chat and repository docs. Report unavailable sources at the first checkpoint.
2. **Register each source** in `documents.sources` (lyriks-build, *Sources & citations*); give `attach_source` its `register_id`: one source, one id.
3. **Cite on every element**: code first, then tickets/pages. Attach and span a ticket that states a rule better than code too.
4. **Cite the passage**: `cite_passages` with the `source_id`, the element's `anchor`, the shortest `words` as the source reads them, and `takes` (what the element took). Quote, never paraphrase.

The audit blocks (`extracted-source-missing`) while an element cites no source.

## A refusal belongs to the server

**A rule that refuses is spanned on the check that rejects the request.**
A handler, a service, a form or serializer validation, a permission class, a
middleware. A condition that only hides or disables a control in a template
says who sees it, never that the request is refused. A request the server
accepts anyway is a finding for `rules.issues[]`, never a guard. Quote a
refusal message only when the code holds it verbatim.

**The product's own tests are evidence.**
Read each feature's tests before its rules; a test asserting a refusal is
cited beside the server span.

Trace the caller: a definition or unit test does not prove the check runs.
Page-only checks are never server refusals or `Mirrored:` assumptions. Search all
frozen variants before claiming absence. Account for retained but unexposed code
and its missing exposure without inventing an entry point; prototype controls
and samples keep their separate classification below.

## Freeze the baseline, then count what you must cover

**Freeze one commit and read only through it**: register the SHA and read with
`git show <sha>:<path>`, never the working tree. Lift it once, at
reconciliation, and say so.

**Count the surface before you model it.** The denominator is never the file
count; take the smallest countable set that leaves no unseen behaviour:

| The repo is organised by | Count |
|---|---|
| domain modules (Nest, Spring, a modular monolith) | the modules, plus the persisted models |
| an ORM schema (Prisma, ActiveRecord, Ecto) | the models, plus the routes that write them |
| routes and handlers (Go, Express, serverless) | the public endpoints, grouped by resource |
| a front end over an API you do not own | the screens, plus the calls each one makes |
| layers rather than domains (controllers/, services/) | the persisted models first, then the entry points per model |
| infrastructure code (Terraform, Terragrunt, Helm, manifests) | the resources that run, store or carry data, and every route between them |
| a clickable prototype or a design (one HTML file, a design canvas, a Figma prototype) | the interactions (every click, key and input handler), the conditional displays, the fixed and script-built labels, the state variables, and the cases of every sample catalogue |

A denominator is listed by one command, the same for two people, and every
row ends modelled or dropped with a reason.

**The ledger is a file, and a gate.**
`.lyriks/retrospec-ledger.md`: one line per counted item, where it is modelled
or why it was dropped. Update it after each slice; never call `finish_project`
while a line is blank.

Whatever the spine, five lists always enter the ledger:

- **The API, endpoint by endpoint.**
  Each endpoint is an action on the `api` channel, method and path as its
  operation, a parameter per filter, page or flag, what it answers in its
  description, each error a block rule or an outcome. Reads count as much as
  writes. An endpoint named only in prose is not modelled.
- **Every access check of the code.**
  Decorators, permission classes, staff against superuser, tokens, single
  sign-on: which roles reach which capabilities, yes or no. Two checks that
  let in different people are two roles, never one merged flag. The API client and the identity provider are personas or actors,
  each is an actor of the journey it serves (sign-in, API).
- **Every screen, administration and settings pages included.** With the route or file that declares it: a page declared in
  metadata or configuration counts as much as a coded one.
- **Every setting that changes what the product does.** A toggle, a flag, a preference, an environment variable read at runtime, with the behaviour it switches.
- **Every rule on personal or sensitive data.** What is masked, never logged, never sent to a third party: a rule spanned on the
  code that enforces it.

**Log every ambiguity and resolve it by reading**: the two candidates, the
code that decides, the verdict. **The feature is the unit**: a slice is done
when every feature in it is finalized. **Code first, intent second**: target
documents are the delta after the code baseline.

## A product known from its documentation

**The pages are the denominator**: every page gets a ledger line (modelled
where, source only, or set aside and why). Store each kept page's text
(`attach_source` with `register_id`) and cite passages. Each kind of page has
its place: lyriks-build, *Where each kind of document goes*. What the pages
leave open is a recorded decision, never a guess.

## A product known from its prototype or its design

A prototype holds four layers: what the screens show, when, what each control
really does, and sample data that states rules. The first alone gives a
plausible spec.

1. **Read every file whole, and say so.** Measure each file and its longest
   line first; read a long line in pieces to its end. Never cut in silence.
2. **Count before writing, layer by layer, in the ledger:** fixed and
   script-built labels; conditional displays and their alternate states
   (empty, filtered to nothing, error, selected); every interaction with what
   its handler really does; state variables and attributes (`readonly`,
   `disabled`, `aria-*`); each case of every sample catalogue; delays; styles.
3. **Sort every element into product, sample data or prototype control, and
   write the sort down.** Names, people and counts on screen are samples;
   layout, theme or fake-activity switches are controls.
4. **A sample catalogue states rules: take the rule, never the instance.**
5. **A label is not a behaviour.** A Save button over `readonly` fields edits
   nothing; a function no control calls is no feature. What only a label
   suggests is a deduction for `rules.issues`.
6. **The prototype is a source like any other:** register it, store its text,
   cite it and its passages. `from_figma` is audited like code.
7. **Prove the end with three readings, never with an impression:** every
   fixed label has its counterpart in the spec or a ledger line; every handler
   its rule, action or reason to drop; `assess_project_completeness` and its
   health.

## Challenge each feature, then prove the spec against the code

**An adversarial pass before `finalize_analysis`, feature by feature.**
The gate checks that every element is traced, never that its span says what
the element claims. Reread each refusal, invariant, rationale and message
against its span: is the check on the server, the message verbatim, the
condition complete, the rationale true on creation AND update? When you can
start a sub-agent, a separate reviewer makes this pass.

Review alone when needed: counterexample, exact state/events, correction, rerun,
provenance and proof limits. Use `lyriks-behavior`'s producer/observer sequence.
Preserve valid conventions; archive the before and source for each correction.

Stabilize Data/Experience projections before final locking; recheck candidates
and untraced elements despite `finalized:true`. Apply `lyriks-delivery` Step 4's
layered source/index checks. Prefer preserving reopen; a destructive reset needs
authorization and a full replay plan, never deletion of real behavior.

**Prove against the code whenever it runs.**
Export the scenarios (`export_behavior_scenarios`), run them against the real
code or match each to an existing test, and bring the results back with
`node .lyriks/tools/ingest-results.mjs` (lyriks-delivery, Step 4), each test
named after its `titleToken`. Report the share proven: actions with a passing
run, out of how many. An audit at 100 with green scenarios proves the model
consistent with itself, never that it matches the code. When nothing could
run, say so.

## Complementary run

Every later run starts from the spec, erases nothing, and takes the delta from
the code's history, never from two AI readings.

Handoff: project/instance, frozen commits, decisions, confirmed writes, remaining
work and partial proofs, never credentials. Attribute model/effort only when
known, without quality comparisons. Resume missing work from receipts; count ids
and actual results. Distinguish expired auth, 403, 503, unknown write result and
verification budget; none proves insufficient RAM.

1. Read what the project holds (`get_project`, its plan by default); `report_retrospec_reading` with no argument gives the starting commit and the hand edits Code drift lists.
2. With a commit, check it exists (`git cat-file -e <sha>^{commit}`); if not, tell the person and stop.
3. Freeze the new commit and read only the delta: `git diff --name-only <from>..<new>` (without a commit, the files that differ from their attached version), changed or new documents, the code of each hand edit, the ledger's new or lost lines.
4. A run that holds its changes writes nothing: do as its prompt says (`changes`, `finished`, later `written`). Any other run writes what is new or changed, citing as on a first run. Leave untouched elements as they are (a rewritten element goes back to validation). Whatever is gone, or contradicts a validated value, becomes a finding for a person.
5. For each hand edit, `report_retrospec_reading` `checks`: its `anchor`, `says: "same"` or `"other"`, with `code` and `where`. Change neither the edit nor the code.
6. Sync the touched features' index, report the commit you read, run the final check.

**The whole product again** (when the prompt says so): read every source
element by element against the spec: confirm without
rewording, complete, correct, cite the new sources.

## Low-intervention protocol

- Ask ONLY what the next line gives to a person.
- **Your work, or a person's decision.** Only the `scope.mode`, approvals
  (terms, sections), the `finish_project` go and facts the product cannot
  show belong to a person. The scope's capabilities, every feature's
  behaviour (never left at 0% unless shells or a target stage were asked), section
  assessments, data links and the audit are yours: never report them as "a
  decision" or "to do on request".
- **Done is proven, never felt.** Announce nothing before the ledger has no
  blank line and `assess_project_completeness` ran after your last write;
  then hand over a coverage report (verified and by which check, deduced,
  open and who decides), not a claim.
- Report at checkpoints, never ask at each step: "audits green" is the completion AND the Project health beside it. Asked to be accompanied, lyriks-build's protocol applies.

## Order of work

1. `documents`: register sources now; attach code per feature at step 4 (`attach_source` needs a `feature_id`).
2. `scope`: the inventory from the UI walk, with its sources; `scope.mode` with the user.
3. `users`: distinct access checks, API client and identity provider, each with its `behaviorValues` (lyriks-build step 9).
4. `features`: the capability tree, then `lyriks-behavior` at full depth per leaf, adopting as you go (*Adopting the codebase*).
5. `data`: the reconciliation above, then the infrastructure map when its code is within reach.
6. `experience`: journeys from the real navigation, the screen inventory, the design.md sources (`lyriks-design`).
7. `rules`, `glossary`, the remaining contexts per `lyriks-build`.
8. `find_inconsistencies`, `assess_project_completeness` (including `behavior-entity-unmodeled`), `audit_project_scope`, code proof; `finish_project` only on the user's word and with no blank ledger line.
9. Before finish, `report_retrospec_reading` (`commit`, `repository`) records the next run's baseline.

When skills seem to conflict, the product-language law wins everywhere except
in `architecture` and the infrastructure map.
