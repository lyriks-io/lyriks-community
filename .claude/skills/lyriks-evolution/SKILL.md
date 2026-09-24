---
name: lyriks-evolution
description: "Drive EVERY change to an existing Lyriks product through its dossier (an evolution, a change request), entirely through the Lyriks MCP: open the request, carry what the change proposes as a DRAFT feature the dossier holds and no section sees, read the impact and the coherence the platform computes with that draft laid over the specification, propose the values a person signs, cross the gates (the crossing into Verify freezes the spec AND writes the drafts into the features section), judge the derived implementation report, fold the acceptance remarks back. Use for ANY request that changes what an existing product does, whether the person wants it built now or only wants to know what it would cost: add a capability, change one, remove one, correct one, "we should add X", "what would it take to add X", "how big is changing Y", "prepare the dossier for Z". There is NO threshold and nothing to judge: never decide a change is too small for a dossier, because a request that disturbs nothing and contradicts nothing crosses its own gates and closes itself in the same act. NOT for a project being written for the first time, which lyriks-build authors directly. Who signs follows the roster: alone you carry the request through yourself, from two members up a person signs each proposal. Pairs with lyriks-behavior (authoring what a reading is missing) and lyriks-delivery (the code, then the index sync the report is derived from)."
---

# /lyriks-evolution

An evolution is a change to a product that already has a spec. The dossier that
carries it holds no specification value of its own: every field it gathers is
written into the section that owns it, and every report it shows is computed by
the platform. You drive the dossier; a person decides; the tools refuse anything
else with the sentence the specification wrote.

## When this skill applies: every change to a product that exists

One rule, the same in the binding block, the per-prompt hook and the MCP server
instructions:

- **A product that already EXISTS changes through a request, always.** Adding a
  capability, changing one, removing one or correcting one opens a dossier
  first. Whether the person wants it built today or only wants to know what it
  would cost changes nothing about the door: it is the same dossier, and what a
  request only meant to qualify does is stop short of the freeze.
- **A project being written for the FIRST time is not a change.** `lyriks-build`
  authors it directly. The door binds a project once its specification has been
  declared finished at least once, or once code is anchored to it.
- **There is no threshold, and nothing for you to judge.** Never decide that a
  change is too small to deserve a dossier. That judgement is the least reliable
  thing in the chain and it fails in the direction that hurts, calling a rule
  change a wording change. The platform decides instead, and a request that
  disturbs nothing and contradicts nothing crosses its own gates and closes
  itself the moment the readings come back, so it costs the author nothing but
  the trace it leaves.

## The one law: the freeze is what writes

While a request is being specified, **nothing is created in the spec sections**.

- What the change proposes lives on the dossier as a **draft**
  (`add_draft_leaf`): a feature that does not exist yet, an existing one in its
  amended form, or one marked for removal. It carries what a leaf carries, and
  it is counted among the touched features straight away.
- The impact report, the coherence check and the prototype read the
  specification **with the drafts laid over it**, so the change is measured and
  walked while it is written nowhere. Exactly one request's drafts at a time.
- A specification value (objective, problem, value, effect, acceptance criteria)
  is a **proposal** the person signs. Acceptance writes it into the owning
  section, stamped with its origin.
- **Crossing into Verify freezes the spec AND writes the drafts** into the
  features section: an addition is created, an amendment patched, a removal
  removed, each stamped with the request. That crossing is the only moment a
  dossier writes the tree.
- A new thing the change would need that is not a feature (an entity, a term, a
  rule) is still an **impact finding** the report predicts, not a row you write.

If the person says "just add it", that is what the dossier is for: draft it, run
the two readings, and if nothing moves the request finishes itself in the same
turn. You do not have to ask them anything.

## Who signs: the roster answers, not the size of the change

- **One member in the workspace**: there is nobody to counter-sign. You carry the
  request through yourself, proposals included, and the timeline records that
  the act arrived through a client.
- **Two members or more**: every proposal is signed by a person before its value
  is written, and you relay decisions with `as_person: true` exactly as before.
- **Either way**, a waiver stays a person's act: it says "the gate is unmet and I
  am going anyway", and that sentence needs somebody's name on it.
- A gate holds a request only on a blocking finding it can name. A score, a
  maturity tier or an empty field nobody declared critical never holds anything.

## The tools

| Tool | What it is |
|---|---|
| `get_evolution {project_id}` | The board: one card per live request. |
| `get_evolution {project_id, request_id, part: "drafts"}` | What the request proposes, in full. |
| `get_evolution {project_id, request_id}` | One dossier in full: fields with their values, readings, maturity per block, coherence and impact findings, the next gate and why it refuses, the report lines, the timeline, `fieldsAvailable` (the field paths you may propose on) and `originsAvailable` (the codes `open_request` takes). |
| `apply_evolution_batch {project_id, operations[], as_person?}` | Typed operations, atomic, guarded server-side. |

Read `get_evolution` before every batch. Never `set_section` or `patch_section`
on `evolution`: it is refused.

## Who does what

**You, as the AI client** (no `as_person`):

- `open_request {title, origin, leafIds[]?}`: a title so it can be found on
  Thursday, and one of the six origins. The origins are `internal_idea`,
  `customer_feedback`, `support_ticket`, `market_watch`, `regulatory`,
  `technical_debt`, and `get_evolution` lists them as `originsAvailable` for
  the day the list grows. The door asks for nothing else: the features the
  change touches are a SET with no main one among them, named with `set_leaves`
  once the impact report has been read, because naming them at the door only
  buys a guess the report then has to contradict. What requires them is the
  gate to Verify, through the maturity of the dossier.
- `add_draft_leaf {kind, baseLeafId?, name, description, objective, problem,
  expectedEffect, value, acceptanceCriteria[], dependsOn[], behaviour[]}`: what
  the change IS. `add` for a capability the product does not have, `amend` for an
  existing one in the form the change would leave it, `remove` for one it takes
  away. Do this before the readings: a request with no draft measures the hole
  where the change would sit, not the change.
- `update_draft_leaf`, `remove_draft_leaf`. Dropping a draft drops what was
  proposed on it, and the specification is exactly as it was.
- `set_leaves`, `update_request`.
- `run_impact {hypothesis, depth}`: computed, on two planes. The spec plane
  walks the knowledge graph from the touched features (never through a role or
  a core); the code plane lists the files the implementation index anchors on
  the touched and reached features, so sync the index from the checkout first.
  Run the hypotheses the request ASKS for, one per kind of draft it carries
  (add for an addition, change for an amendment, remove for a removal), in
  one batch: the report reads each row with the verb of the draft behind the
  feature it was reached from. What taking the change back out would cost is
  a reading of its own: run `remove` on a request that removes nothing only
  when the person asks that question. Each run keeps its own findings:
  `impact.byHypothesis` counts them and `get_evolution {part:"impact",
  hypothesis}` reads any of them in full. A report that ran and reached
  nothing says why in `impact.emptyBecause`: read it, because "nothing was
  declared" (an addition with no `dependsOn`) is not "nothing follows". The dossier opens on one plain line per plane: read
  those to the person before any list.
- `run_coherence`: computed by the coherence engine over the whole project.
  The findings that name a touched feature are published with the other node
  at fault and a Fix now target.
- `propose {fieldPath, leafId, value, whatWasRead, whatWasInferred,
  citedSourceIds[]}`: one proposal per empty field, targeting the **open
  questions first** (amber fields the author declared), then the empty
  **critical** fields the maturity names. Say what you **read** in
  `whatWasRead` and what you **inferred** in `whatWasInferred`: two fields, in
  the project's own language, and a proposal that fills only the older free-text
  `reasoning` cannot be accepted. Nothing is looked for in your wording, so
  French, Spanish or any other language passes exactly as English does. Every
  proposal cites at least one row of the documents register; register the source
  first when it is not there (a web address, or the verbatim content in the
  note).
- `post_on_field {fieldPath, leafId, body}`: ask the person a question where
  the field stands.
- `build_implementation_report`: in Verify, after `sync_implementation_index`
  from the checkout. It is derived from the index against the frozen version.
  Never write a line yourself.

**The person** decides, and you relay the decision **only when they told you
to**, with `as_person: true` on the batch. The act lands as theirs, with the
channel stamped on the timeline:

- `decide_proposal {proposalId, decision: accept|refuse|reword, sense?}`:
  accept writes the value into its section. On a value the glossary flagged,
  `sense` carries the person's own words when they keep the wording in
  another sense than the one the glossary guards; it is recorded beside the
  value. On a proposal handed to tagged
  reviewers, accept is that reviewer's validation and the value is written
  once every reviewer validated; refuse is an invalidation that refuses it.
- `tag_reviewers {proposalId, reviewerIds[]}`: hand a proposal to named
  members (ids = emails from `members` in `get_evolution`), only where the
  roster holds more than one member (Enterprise).
- `mark_open_question`, `answer_open_question`.
- `cross_stage {waiverReason?}`: one gate at a time. Specify to Challenge is
  open. Challenge to Verify needs no empty critical field, a coherence check
  run, and no blocking finding undecided; it **freezes the spec as a numbered
  version**. Verify to Accept needs every report line decided. Accept to
  Delivered needs every validated observation folded back. A waiver crosses an
  unmet gate at the cost of a stated reason that stays visible.
- `decide_line {lineId | verdict, decision}`, `rule_observation`, `fold_back`,
  `rebrief`, `lift_waiver` (admin), `close_request`, `delete_request`.
- `rule_observation` and `fold_back` act on observations the walkthrough
  logged. An observation is a person's: it is anchored on the screen and the
  element they were looking at, with their annotated capture, so nothing logs
  one from here. An id the dossier does not list is refused for that reason.

Never pass `as_person` for something the person did not say in the
conversation. If they said "accept the first three", relay exactly those three.

## The walk, stage by stage

1. **Bind.** `list_wizard_projects` gives the project. `get_evolution` gives
   the board. If the request exists, open its dossier; else `open_request`.
2. **Specify.** `add_draft_leaf` for what the change proposes, and
   `set_leaves` for the existing features it also touches. `run_impact` (add,
   then change or remove). `run_coherence`. If both come back with nothing, the
   request has already crossed its gates and closed: say so and stop. Read the dossier:
   the maturity names the critical holes, the readings say what the touched
   features already hold. Propose on the open questions, then on the empty
   critical fields, one value each, sourced. Tell the person what is waiting
   for their signature and what the impact says would move. Relay their
   decisions. Post a question on a field you cannot answer.
   The person reads the request in three steps: the idea (title, need, touched
   features), the proposals to sign, and the impact report on the spec and on
   the code. Everything else is behind the report; do not recite it unasked.
   The maturity percentage next to the dossier is INHERITED from the features
   the change touches, so a change to a complete product reads high before
   anything of its own has been decided. It never proves the change is
   specified, and Specify does not close while a proposal is still waiting for
   a signature: the gate says how many, and the waiver stays the named way
   through when a person decides to cross anyway.
3. **Challenge.** The person crosses. Re-run `run_coherence` after every
   accepted proposal that changed the spec. A blocking finding is fixed in the
   owning section (by a person, or by you once they ask), accepted as a risk on
   the Control Center, or waived with a reason.
4. **Verify.** The crossing froze the spec as version N and wrote every draft
   into the features section, each stamped with the request. The code is written
   against version N (lyriks-delivery), the index is synced
   (`sync_implementation_index`), then `build_implementation_report`. The
   person decides every line; an invalidated line yields a rebrief; an adopted
   out-of-scope line amends the spec and Challenge runs again.
5. **Accept.** The walkthrough happens on the page (captures, anchored
   observations). You relay rulings and fold validated observations back as
   acceptance criteria on the touched feature.
6. **Delivered, then closed.** `close_request` once nothing is owed.

## Hand the person a link, every time

Whenever you tell the person something waits on them (a proposal to sign, an
open question, a gate to cross or waive, a report line, a remark to rule), give
them the `href` the answer carries for that exact place, as a clickable
markdown link, one per thing. The request card, the dossier, `proposals.href`,
`gate.href`, each proposal, each field row, each report line, each observation
and each refused result a person resolves carry one. The link opens the page ON
that place, unfolded and highlighted, and survives the way through sign-in.
Never describe where to click instead, and never build a page address yourself:
only the server knows which installation the person uses.

## Reading a refusal

A refused batch applies nothing. Each result names the operation, the reason
(the sentence the spec wrote) and why the rule exists. Read it back to the
person as it is; do not work around it with `set_section`.

## Language

Proposals are written in the vocabulary of the project glossary. A value using
a banned synonym is flagged before it is offered, and the flag names the agreed
term it stands in for (`flaggedWords`). A flag WARNS and never blocks: the
person rewords it, or accepts it as it stands when they meant another sense.
A word between quotation marks is a citation of what the product or a source
says and is never flagged. If you made a proposal nobody has decided yet and it
is wrong, take it back with `withdraw_proposal {proposalId}` instead of leaving
the field held by a value nobody will sign.
Names that face the code stay in English (data, states, events, actions).
