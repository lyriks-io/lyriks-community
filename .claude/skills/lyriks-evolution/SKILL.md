---
name: lyriks-evolution
description: "Take a person by the hand through a change to an existing Lyriks product, as an Evolution request, entirely through the Lyriks MCP: one question at a time, the dossier's `next` block saying what to ask and what to do, the person deciding. The change lives as a DRAFT nothing else sees until the freeze writes it into the spec as a numbered version; a frozen version can be reopened and frozen again. Evolution is OPTIONAL: an ordinary change is made directly (spec, code, index). Use this skill when the person asks for a dossier, or wants a change QUALIFIED before it is decided: \"prepare the evolution for X\", \"what would it take to add Y\", \"how big is changing Z\", \"open an evolution request\", or when a change is already carried by an open request. Pairs with lyriks-behavior (the draft's runnable behaviour) and lyriks-delivery (the code, then the index the report is derived from)."
---

# /lyriks-evolution

An Evolution request carries a change to a product that has a spec, from its
reason to the day it is live. The person knows the need and decides; you ask
the right question at the right moment, write what they said, and hand back
what is theirs. The platform computes every reading and refuses what the rules
refuse, in the spec's words.

## When

- **An ordinary change is made directly**: spec (`apply_behavior_batch`, `patch_section`), code, `sync_implementation_index`. Never open a request on your own.
- **Open one when the person asks**, or wants a change qualified before anyone decides it (what it involves, its impact, an estimate, a decision that belongs to someone else).
- **A change already carried by an open request continues in it.**

## Follow `next`

Every dossier read (`get_evolution {project_id, request_id}`) and every batch
answer carries `next`:

- `say`: where the request stands; tell the person, in their language.
- `ask`: the questions to put NOW, ONE at a time; never guess what they did not say. Optional ones are offered, not pressed.
- `then`: the operations that follow from the answers.
- `personDecides`: what only they decide; say it, give the link, wait.

Ask, write, read `next`, ask again. Never a list of ten questions, never a
dossier filled in silence.

## Work live on the pages: one session per project

A person holds ONE session per project. They stay on their pages (the
Specification 360°, the Retrospecification, the Evolution board, a request)
and you answer their clicks; the AI chip in the app bar shows it.

1. **Open it when the work calls for it, never merely because you use the MCP**: at the latest in the turn you hand the person a link to the app (an `href` a Lyriks answer carries), before that link, so their click there reaches you; when they ask to work with you on the pages; whenever you ask them something they answer on a page; when the prompt Ask my AI or "Prepare it with my AI" copies says a Lyriks session begins. In a bound repository open it yourself, in the background, silently unless it fails, and never again once the person ended it in that conversation. `start_evolution_session {project_id}` (with `request_id` when the prompt names one). Say in one sentence that you are listening, unless it opened by itself.
2. **Wait without taking the chat away**: in Claude Code run the `wait.command` the opening answered, as given, with Bash `run_in_background`; it signs in by itself (nothing to set, no token to ask for), prints the event and wakes you. Other clients call `await_evolution_event` with a short hold and answer the chat between waits. Events:
   - `click`. Each comes with the field, its question and value, the thread, `known` (what the page holds: title, origin, requester, every answer; never ask for it) and `answerWith` (the one operation that answers it). Kinds:
     - *Prefill with my AI* on a section: fill EVERY question of `section` you can, in one batch, a step's description first (`update_step_description`), then the questions written from it. With several members, ONE suggestion instead (see the guideline). Never call back with nothing written: ask the missing fact. *Prefill the whole step* carries `stepPrefill`: fill that section, ask its missing fact in your suggestion, and wait for the page to hand you the next.
     - `ask`: a message they wrote in a field's thread. A click whose `answer` is set is the answer to your suggestion's question: rewrite the suggestion, then fill what the answer allows.
     - *Draw with my AI*: a step's diagram.
     - `ticket`, on a closed request: post `ticket`'s message through YOUR tracker connector, move it to done, report with `report_ticket_post` (`note` says what could not be done). Lyriks calls no tracker.
     - `build`: `build.brief` is the frozen version to build and prove (lyriks-delivery).
     - `close`: `close.step` (merge, sync, branch) and `close.brief`: run them in the person's checkout, never push, never force, say what git refused.
     - `ask_block` (a question on a block of the Specification 360°) and `reread`: answer with `answer_click {clickId, text}`.
     Announce each major step on the page (`update_evolution_session {say}`: "Reading the dossier", "Writing the new version"), not one per tool call; answer with `answerWith`; wait again at once.
   - `progress`: the person moved the request themselves. Say in one sentence what they did and what comes next, do what `next` asks, hand them the `href` of what waits. Your own writes never come back; a waiting click comes first.
   - `nothing`: wait again, silently.
   - `ended`: they ended it, half an hour passed, or the call dropped. Say so in one sentence and stop.
   - `cancelled`, on any event: they pressed Cancel during your click; what you wrote for it went back. Do not redo it unless asked.
3. **Between clicks**, point at what waits with the `href` of that place, as a link in the chat ("1.2 waits for your validation"). One thing at a time.

**Asking on the page opens the session.** A question they answer on a page (a
`propose` with `question`, a `post_on_field` with `asks: true`, a link to
answer there) needs your session open first, in the same turn; otherwise
their answer never reaches you.

**Ask in the suggestion, one question at a time.** One fact missing: `propose
{..., question, choices}`, ONE question (two question marks are refused), at
most three short answers. Their answer comes back as a click: register their
words as a source, then `propose` again with it folded in; the new suggestion
replaces yours in place. Few possible answers are always `choices` (buttons;
`multiple: true` for boxes, six at most). A new topic of yours on a field
where your suggestion waits is refused.

**One thread, one question.**
- Reply under the message you were asked about (`replyTo`); a reply that asks something goes with `asks: true`.
- Read `click.scope`: when its `note` says the message opened a new topic while your question waits, ask which question it answers. Never act on a guess.
- A message about another question than its field's: say so, and carry it on that question (`post_on_field` there, `private: true`).

**Settling a text with the person.** A thread ends in the text written at its
place, never in words they copy.
1. Read `known`, the thread and the page before asking.
2. One question per message, the one that changes the text most.
3. Never paste a text to copy. Offer it in `writes`: `post_on_field {..., body, writes: [{ fieldPath, value }]}`, each place a step text (`step.<step>.description` or `step.<step>.<question>`, listed in `answerWith`), each value the whole text, one statement per line. The page shows Accept and Refuse. The Need's verbatim and a diagram are never suggested; a field of a block takes `propose`.
4. Once settled, offer every decided place in ONE message with a one-sentence body. Never send them to a button to get it written.
5. With several members you write no version on a step (`answer_step`, `update_step_description` refused): every text is such a suggestion. Alone, a Prefill writes the version they validate.
6. Read the verdict back (`suggestion {places, state}` on your message): accepted is written; refused is dropped unless they say why.

**What reaches you**: what they send with 'Ask your AI', and every reply under
your messages. A comment is for people: never answer or act on one. A private
exchange becomes public when they make it a comment or when your answer
changes the spec.

**While you are on a click, everything you write can be undone**; you cannot
cross a gate, close or delete the request until you wait again. A session
changes where you talk, never what you may do. End it
(`update_evolution_session {end: true}`) only when they say so.

## Description first, then what only this request needs

Every prose step opens on ONE description in the person's words: the Need
(`update_need {description}`), the Solution, the Functional spec, the
Technical spec (`update_step_description {step, description}`). Write it
verbatim, then read it: `propose` a value on each empty field, citing it, and
ask what it leaves unsaid with `ask_question {step, question, why, fieldPath?,
leafId?}`, a question only THIS request needs, five open per step at most. The
answer (`resolve_question {questionId, resolution: "answered", text}`, verbatim,
or `"set_aside"` with a reason) is a fact: turn it into a `propose`.

Everything typed is read against the glossary: a word it keeps for another
sense comes back in the summary; tell the person, keep their text.

## The eight steps

Need, Solution, Functional spec, Technical spec and Approval are VALIDATED by
people; the Impact analysis is read by the platform; Build and Deployment are
judged and declared.

1. **Need**: why the change exists. `update_need {description}` verbatim, `register_source {title, note}` with their words, then `propose` each answer on `00-need.<question>` (`leafId: null`) citing it. Situation and objectives are essential.
2. **Solution**, in prose: the description says what changes, then `answer_step {step: "solution", question: "examples" | "out_of_scope", answer}`. Draft no feature yet. The page shows Solution, Functional spec and Technical spec as ONE tab (2.1 functional, 2.2 technical). Hand over the link to validate only when `next` says every required text is written: the Solution's description and examples, the Functional spec's description and rules (`refusals`). A change that refuses nothing new still writes one Rule line saying so, or `skip_question` with a reason. Until those four steps are validated (or marked not applicable), every draft op is refused ("The Solution waits for its validation"). A Solution rewritten after validation goes back to it, its drafts locked.
3. **Functional spec**, in prose, in their words: the description walks it as the user does (Journey), then `answer_step {step: "functional_spec", question, answer}`: `refusals` (required, Rule), and optionally `interactions`, `screens`, `experience`, `failures`. Cite a product element as `@[name](kind:id)`. Translating it into behaviour (`apply_behavior_batch` on `draft:...`, `simulate_behavior`) is optional; never ask the person to read a schema.
   **The use case diagram** (UML: use cases, one flow per use case in swimlanes with its ways out, the states each thing goes through) never says something other than the texts. When a text moves, `functionalDiagram.behind` turns true and `next` puts the redraw first: `redraw_diagram {step: "functional_spec", diagram}`, then tell the person it is your drawing of their words. `answer_step {question: "diagram"}` edits the drawing itself and rewrites the texts: only when they change the drawing. Notation, one line per element:
   ```
   actor Customer
   system Payment provider
   use case Pay an order: Customer, Payment provider
   flow Pay an order
   Customer: confirms the basket
   refused when <condition>: <what then happens>
   goes wrong when <condition>: <what then happens>
   states Order
   placed -> paid: <what causes it>
   ```
   Link what the change reuses: an existing feature ends with `@[name](feature:<featureId>)`, an existing action with `@[name](action:<featureId>/<actionId>)` (ids from `get_knowledge_graph`). A linked feature no draft touches is read at the Impact as used. While the diagram is behind, nothing can be validated.
   **The technical diagram** pairs with its description: components (`: new` after what the change adds, `link a -> b: what goes through`, `note part: constraint`) and sequences (`sequence <name>`, `a -> b: message`, `-->` for an answer, each with its `goes wrong when`). Link existing features and tables (`@[name](entity:<tableId>)`). Redraw with `redraw_diagram {step: "technical_spec", diagram}` when `technicalDiagram.behind`. Draw what helps a decision, not every class.
4. **Technical spec**: the description (known constraints and risks), then optionally `answer_step {step: "technical_spec", question: "data", answer}`; declare the tables from it (`add_data_draft`, field by field).
   **Every other page of the spec changes from the request too**: `add_section_draft {page, summary, edits}`, `page` as the person reads it (glance, users, experience, requirements, architecture, glossary), `edits` in patch_section vocabulary, limited to what that page shows. Read the section first. Never write such a change directly while a request carries it.
   **The rules the whole product keeps**: `add_rule_draft {summary, operations}` with `add_project_invariant`, `update_project_invariant` or `remove_project_invariant`; never through `apply_project_behavior_batch` inside a request, which writes at once. Draft the feature change before a rule that reads its states.
5. **Impact analysis**, entered once the four steps are validated; nobody validates it. Name what the change touches yourself: `get_knowledge_graph {kinds:["feature"], q:"<their words>"}`, then `add_draft_leaf` per subject (`add`; `amend` as a delta: `acceptanceCriteria`, `retireCriteria`, `changeCriteria`, `descriptionPatch`, `changeSummary`; `remove`), `add_data_draft`, `add_section_draft`, `add_rule_draft`. `propose` a value on each empty question of a named feature. Then `run_impact` and `run_coherence` in one batch. Read the impact's two plain lines, then what does not fit: **collides** (red) blocks, **rubs** (amber) is to settle, **nothing to attach to** (blue) asks a core or family; inherited (grey) never blocks. A collision is fixed in its section, accepted as a risk (`decide_finding {findingId, decision: "accept_risk", reason}`) or waived. Then `cross_stage` **freezes version N**; nothing is written into the spec yet.
6. **Build**: the code is written against version N (lyriks-delivery; on the branch Lyriks names when the card carries `code`), the index synced as usual: entries naming what the request adds are held on the request. Then `build_implementation_report`. The tests come ready (`GET /api/evolution/tests?projectId=&requestId=&runner=vitest|node`, or `export_behavior_scenarios` on each draft id); only the adapter is to write. Every screen, action and criterion of the touched features is a line, "to build" until the code proves it; a conform line needs no decision, the others `decide_line validated | invalidated | adopted | removed`. Inherited lines are counted, never ruled. Accepting the Build (`cross_stage`) fixes the commit it validates.
7. **Approval**: the person walks the change. Each remark is logged as said (`log_observation {body, type}`, `as_person`), ruled (`rule_observation validated | deferred | requalified | invalidated`), and if validated folded back as a criterion (`fold_back {observationId, leafId, text}`). Then `cross_stage` approves.
8. **Deployment, the ONE moment the change becomes official**: every draft is written into the spec under the ids the code was indexed against. With a deployment branch, its merge does it (`report-merge.mjs`; `declare_deployment` and `close_request` are refused there). Otherwise `declare_deployment {releaseId?, note?}` once live.

**Nothing is official before it is live.** A value accepted on an existing
feature waits on the request's amendment. Deleting or reopening the request
leaves the spec as it was. **`rebrief`** reopens a frozen version: edits
again, validations asked again for what changed, the next freeze is N+1, the
next landing writes only what changed. A step a small change does not need is
`mark_step_not_applicable {step, reason}`; the Need never is, its unanswered
questions are skipped (`skip_question`).

## Who decides

- **Anyone with access validates, a viewer excepted.** Each answer needs `validationsPerAnswer` different people (one by default); change it only when the person says so.
- **Named validators**: `name_validators {fieldPath, leafId?}` or `{step}` with `people[]` (emails; `[]` clears). Once named, only they count. Suggest from `members[].jobs`: Product for Need and Solution, Product and Design for the Functional spec, Tech and Security & compliance for the Technical spec, Product and Business for Approval. Name only whom the person chose.
- **Every field is versioned.** `validate_field` stands behind the version held now; a later write outdates it. `refuse_field {fieldPath, leafId?, reason}`; `withdraw_field_verdict` takes either back. Accepting a proposal validates nothing. `skip_question` (undone by `unskip_question`) makes a question no longer owed: never ask it again.
- **Alone in the workspace** you may carry every step; the history says it came through the assistant.
- **Two members or more**: every decision is a person's. Relay one with `as_person: true` only as they said it in the conversation. `tag_reviewers` asks for a look.
- **Under delegation** (`aiDelegation`, on the request or the project) you validate in their name what they validate (`validate_field`, `validate_step`) and accept your own suggestions. Never refuse, cross a stage, freeze, accept a risk, approve or close; never give or take a delegation.
- **Always a person's**: a waiver, lifting one, deleting, cancelling or reopening a request, logging or ruling a remark. `cancel_request {requestId, reason}` with their reason only; `reopen_request`; `close_request` ends a delivered one.

## Tools

| Tool | Use |
|---|---|
| `get_evolution {project_id}` | The board. |
| `get_evolution {project_id, request_id}` | One dossier with `next`, `gate`, `stepDescriptions`, `customQuestions`; lists one `part` at a time (drafts, fields, proposals, impact, report, readings, history, graph). |
| `apply_evolution_batch {project_id, operations[], as_person?}` | Typed operations, atomic. |
| `apply_behavior_batch` / `get_behavior_feature` / `simulate_behavior` on `draft:...` | The draft's behaviour. |
| `start_evolution_session` / `await_evolution_event` / `update_evolution_session` | The person's session. |

Ids are accepted in full or by a unique prefix of four characters or more.
Never `set_section` or `patch_section` on `evolution`.

## Proposals

`propose {fieldPath, leafId, value, whatWasRead, whatWasInferred,
citedSourceIds[]}`: what you READ and what you INFERRED, in the project's
language, citing at least one source (`register_source` first). The person
accepts, rewords or refuses; `withdraw_proposal` takes back an undecided wrong
one. Use the glossary's words.

## Links and refusals

Whatever waits on the person, give the `href` of that exact place as a
clickable link; never describe where to click. A refused batch applies
nothing: read the reason as it is and do what it names, never work around it.
Names that face the code stay in English.
