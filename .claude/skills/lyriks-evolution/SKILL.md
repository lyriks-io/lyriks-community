---
name: lyriks-evolution
description: "Qualify a change to an EXISTING Lyriks product before anyone builds it, and drive its dossier (an evolution, a change request) from the raw need to acceptance, entirely through the Lyriks MCP: open the dossier, name the touched features, read the impact and the coherence the platform computes, propose the specification values a person signs, relay the person's decisions, cross the gates, judge the derived implementation report, fold the acceptance remarks back. Use when someone asks to QUALIFY a change: what it would involve, an estimate, an impact report, a dossier to prepare, a decision that belongs to someone else ('evolution', 'change request', 'what would it take to add X', 'how big is changing Y', 'prepare the dossier for Z'). NOT for a change someone asks to MAKE now: in a repository bound to its project that is a direct spec change, then the code, then the index sync (lyriks-behavior, lyriks-delivery). An ambiguous request ('we should add X') gets one clarifying sentence, never a silent choice. PLANS WITHOUT BUILDING: nothing is created in the spec sections while a request is specified. Pairs with lyriks-behavior (authoring what a reading is missing) and lyriks-delivery (the code, then the index sync the report is derived from)."
---

# /lyriks-evolution

An evolution is a change to a product that already has a spec. The dossier that
carries it holds no specification value of its own: every field it gathers is
written into the section that owns it, and every report it shows is computed by
the platform. You drive the dossier; a person decides; the tools refuse anything
else with the sentence the specification wrote.

## When this skill applies: a change to qualify, not a change to make

One rule, the same in the binding block, the per-prompt hook and the MCP server
instructions:

- **A change to MAKE** ("add X", "change Y to Z", "remove W", in a repository
  bound to its project): not this skill. It is a direct spec change
  (`apply_behavior_batch`, `patch_section`, `build_screen`, `wire_element`),
  then the code, then the index sync, in the same turn (the binding section of
  lyriks-delivery).
- **A change to QUALIFY**: this skill. Someone asks what the change would
  involve, an estimate, an impact report, a dossier to prepare, or the decision
  belongs to someone else (a product owner, a customer, a committee). The
  dossier plans; it never writes the sections.
- **Ambiguous** ("we should add X", "it would be nice if Y"): ask once, in one
  sentence, whether to make the change now or to qualify it first. Never choose
  silently, in either direction.

## The one law: plan without building

While a request is being specified, **nothing is created in the spec sections**:
no feature, no entity, no glossary term, no rule or scenario, no screen, no grant.

- The features a change touches are **existing** leaf features (`leafIds`). A
  request never creates a feature of its own.
- A new thing the change would need (an entity, a term, a rule) is an **impact
  finding** the report predicts, not a row you write.
- A specification value (objective, problem, value, effect, acceptance criteria)
  is a **proposal** the person signs. Acceptance is what writes it, into the
  owning section, stamped with its origin.
- A reading that comes back empty (a touched feature with no invariant, no
  grant, no entity) is authored in the owning section with the owning tool
  (`apply_behavior_batch`, users, data), and only once the person has crossed
  into Verify or asked for it. Never during Specify.

If the person asks you to "just add it" while a request is being specified,
the change has turned from one to qualify into one to make. Say in one line that
the dossier writes nothing, and ask whether they want it made now (a direct spec
change in the owning section, outside the dossier) or kept as a proposal to
sign. Never write the sections from inside the dossier.

## The tools

| Tool | What it is |
|---|---|
| `get_evolution {project_id}` | The board: one card per live request. |
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
- `set_leaves`, `update_request`.
- `run_impact {hypothesis, depth}`: computed, on two planes. The spec plane
  walks the knowledge graph from the touched features (never through a role or
  a core); the code plane lists the files the implementation index anchors on
  the touched and reached features, so sync the index from the checkout first.
  Run the three hypotheses in one batch: they read differently (add extends,
  change reworks, remove strips). Each run keeps its own findings, so the
  three stay readable side by side: the summary counts them under
  `impact.byHypothesis`, and `get_evolution {part:"impact", hypothesis}` reads
  any of them in full. The dossier opens on one plain line per plane: read
  those to the person before any list.
- `run_coherence`: computed by the coherence engine over the whole project.
  The findings that name a touched feature are published with the other node
  at fault and a Fix now target.
- `propose {fieldPath, leafId, value, reasoning, citedSourceIds[]}`: one
  proposal per empty field, targeting the **open questions first** (amber
  fields the author declared), then the empty **critical** fields the maturity
  names. The reasoning says what you **read** and what you **inferred**. Every
  proposal cites at least one row of the documents register; register the
  source first when it is not there (a web address, or the verbatim content in
  the note).
- `post_on_field {fieldPath, leafId, body}`: ask the person a question where
  the field stands.
- `build_implementation_report`: in Verify, after `sync_implementation_index`
  from the checkout. It is derived from the index against the frozen version.
  Never write a line yourself.

**The person** decides, and you relay the decision **only when they told you
to**, with `as_person: true` on the batch. The act lands as theirs, with the
channel stamped on the timeline:

- `decide_proposal {proposalId, decision: accept|refuse|reword}`: accept
  writes the value into its section. On a proposal handed to tagged
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
2. **Specify.** `set_leaves` on the existing features the change touches.
   `run_impact` (add, then change or remove). `run_coherence`. Read the dossier:
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
4. **Verify.** The crossing froze the spec as version N. The code is written
   against version N (lyriks-delivery), the index is synced
   (`sync_implementation_index`), then `build_implementation_report`. The
   person decides every line; an invalidated line yields a rebrief; an adopted
   out-of-scope line amends the spec and Challenge runs again.
5. **Accept.** The walkthrough happens on the page (captures, anchored
   observations). You relay rulings and fold validated observations back as
   acceptance criteria on the touched feature.
6. **Delivered, then closed.** `close_request` once nothing is owed.

## Reading a refusal

A refused batch applies nothing. Each result names the operation, the reason
(the sentence the spec wrote) and why the rule exists. Read it back to the
person as it is; do not work around it with `set_section`.

## Language

Proposals are written in the vocabulary of the project glossary; a value using
a banned synonym is flagged before it is offered, and the person rewords it.
Names that face the code stay in English (data, states, events, actions).
