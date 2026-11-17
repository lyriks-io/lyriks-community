---
name: lyriks-behavior
description: "Author FULL behavior depth on Lyriks features with apply_behavior_batch: surfaces, typed state, actions with mandatory rules, effects, executable scenarios, invariants, reachability goals. MANDATORY whenever features are created: a feature is never left at 0% (name and description only) unless the user asks for shells, or names a target stage (\"stop at Specified\"), which caps the depth per the ladder in this skill. Invoked by lyriks-build at the features step; usable alone to deepen an existing project."
---

# /lyriks-behavior

Every leaf feature ships with a **complete, verified behavior model**. A
feature at 0% is a defect; leave shells only when the user asks for them.

**A target stage is the user's to set.** "Stop at Specified", "Outlined
everywhere for now": accept it, author to that stage (ladder below), verify
what exists, and report "authored to <stage>", never "complete".

**Maximize true information, not the score.** Model every real guard, state,
event, failure path and promise. Some checks do not apply (a single screen has
no transition, a pure read has no permission story): never invent a construct
to silence one, a fake invariant makes the model less true. Chase correctness
to 100% (verdict passed, scenarios green); let the structural score land where
honesty puts it, and know why each open issue is expected.

## Names and language

- **Names the code will carry are English**, whatever the product's language:
  entities, fields, enum values, state paths (`cart.itemCount`, never
  `panier.nombreArticles`), events (`order.paid`), actions, parameters,
  surfaces, roles, collections, and the enum literals of scenario overrides.
  State paths and event names become `.unspa.json` keys verbatim. A spec that
  carries a non-English code name is renamed in the spec first, then coded.
- **Spec to code**, the spec's name is the code's identifier by default.
  **Code to spec**, the spec names things in the product's words and the span
  carries the exactness.
- **Prose is written in the ONE language the project declares** (Foundation,
  Operations, i18n; English when none), never in the conversation's:
  descriptions, rationales, criteria, glossary, scenario names, end-user copy.
  Every read states it (`specLanguage`). When none is declared and the prose
  reads otherwise, ask the person to declare it. Answer the person in their
  language; write the model in the spec's.

## The feature card comes before the batch

Write the feature in four to six lines of product words: who can do what, the
states it goes through, the guards that block, what a blocked user sees.
Record each product decision it embeds in the register of lyriks-build
(*Narrate, checkpoint, and never invent a product decision silently*). In
accompanied mode the user answers on the card, never on the ops.

## The per-feature template (one batch, 20 to 30 ops)

One `apply_behavior_batch` per feature (`feature_id` = the leaf id). Give
every add op a `ref`. Dry-run the first batch of a session.

**Read the op shapes from the running engine first**:
`get_behavior_operations {query:"add_parameter add_scenario add_surface_invariant"}`
answers with the exact schema in one call. Shapes are fussy (a rule nests
under `rule:`, an effect under `effect:`, an invariant under `invariant:`;
most ops want `surfaceRef`; a `switch` closes on `default`; a criterion takes
`title`/`given`/`when`/`then`): one read costs less than two refusals.

1. **`add_surface`** `{name, type, description}`: screen, canvas, terminal, board, workflow, dialog_area...
2. **`add_state_definition`** x3 to 6 `{surfaceRef, path, type, defaultValue, description}`, enums with `enumValues` inline. Model the real lifecycle (`order.status: draft|placed|shipped`), not booleans for everything. Role gating: declare the role ONCE for the whole project, under the same path and the same values in every feature that reads it (`session.workspaceRole`, plus `session.projectRole` when the product holds a role per project), its values being the role ids of the access matrix; never a copy per feature. The plan a guard reads follows the same law (`workspace.plan`).
3. **`add_event`**: lowercase, dot-separated, at least one dot (`order.placed`, `invoice.payment_failed`); camelCase and capitals are refused. Declare it before any action emits it or listens to it, even when another feature owns it (declare a mirror).
4. **`add_action`** x2 to 4 `{surfaceRef, name, intent, roles[], emittedEvents?}`. `emittedEvents` really emits (the engine wires an `emit_event` effect): declare it for an event the action ALWAYS emits; a conditional emission is an `emit_event` effect on the rule that carries the condition. **Every action needs at least one `add_action_rule` in the same batch.** Unconditional? Say it as a rule: no condition, `effect:{type:"allow_action"}`. Set `actor` to `system`, `schedule` or `event` on every action no person fires (absent means `user`).
5. **`add_parameter`** per input `{name, type, required, description, bindToStatePath?, validations[]}` (non_empty, email, min_length, positive, integer...).
6. **`add_action_rule`**: the guards are the product's core reading. Categories: permissions, security, compliance, validation, business, billing_quota, error_handling, data. Block: `{category, condition, effect:{type:"block_action", reason, description}, description}`. Operators: equals, not_equals, greater_or_equal, lower_or_equal, greater_than, lower_than, contains, is_true, is_false, exists. `condition.right` takes expressions (`{kind:"state",path}`, `{kind:"mul",...}` for "80% of quota"); `left:{kind:"param",name}` works on action rules only.

   **A rule's `description` says WHY, never WHAT.** Lyriks reads every rule, invariant and goal back as an EARS sentence built from its logic, and every scenario as Given/When/Then (`statements` on a `get_behavior_feature` read by `action_id` or `surface_id`). So the description carries what the logic cannot: the reason the rule exists. Write "Card networks forbid a refund above the captured amount", never "Blocks a refund whose amount exceeds the paid amount". Read the `statements` back after a batch: a sentence that reads wrong is a rule modelled wrong.

   **On an existing product, a refusal is the server's**: span a block rule on the server check that rejects the request, never on a control a page hides (lyriks-retrospec, *A refusal belongs to the server*).
7. **`add_effect`**: set_state (an expression for counters, `min`/`max` to clamp), emit_event, show_message, append_to_list, remove_from_list, advance_time (`{type:"advance_time", by}`: makes time pass). Every action a PERSON fires that can be blocked gets an `onBlocked:true` show_message. An action nobody fires by hand gets `actor` and, as its only onBlocked effect, `{type:"no_feedback", reason}`. Never write a message the product does not show: a test generator will take it for a toast to build.
8. **`add_scenario`**, one per non-trivial action at least, success AND blocked: `{surfaceRef, actionRef, name, description, stateOverrides[], parameterOverrides[], expectedStatus, expectedAssertions:[{path, operator, value, description}], steps?}`. Overrides are arrays of `{path|parameterName, value}` and must satisfy the feature's invariants. A multi-step flow goes in the same batch, its `steps[]` naming new actions by `actionRef`.
9. **`add_surface_invariant`** `{invariant:{name, condition, message, description}}`: the property that ALWAYS holds. A => B is `{kind:"any",conditions:[not-A, B]}`. Never without a condition, never always false, never always true (`count >= 0` proves nothing). No evidence for one: write none and say why.
10. **`add_reachability_goal`** `{goal:{name, kind:"reachable"|"always_reachable", condition, description}}`: what can happen, and what can always be recovered.
11. **`add_acceptance_criterion`**: Given/When/Then for what scenarios cannot check (UI qualities, promises across systems).
12. **`add_persona`**, one per role a guard of the feature reads: `{name, description, stateOverrides:[{path:"session.workspaceRole",value:"admin"}]}`, with the values of that role's row in the access matrix (`roles[].behaviorValues`, lyriks-build step 9). The engine searches from the defaults AND from each persona: an admin-only action without its persona reads never reached.

## Numbers

- **A number used twice is a constant**: `add_constant {name, description, value}`, read as `{kind:"const", name}`, changed once with `update_constant`.
- **A value only a measurement can settle is specified in two passes**: the rule first, the number declared as a constant whose description says it is provisional and what will settle it; then code, measure, update the constant once. Never leave the measured number in the code alone.
- **A number bounded by another says so**: name the bound in the description and guard both with an invariant.
- **No approximate equality**: bracket a computed float between `greater_or_equal` and `lower_or_equal`. Never move a product number so an equality passes.
- **A rate is tested as a distance**: repeat the action as `steps[]` (each `{actionId, parameterOverrides?, expectedStatus?, expectedAssertions?, timeAdvance?}`, replayed in order) and assert the accumulated value.

## Keep the state machine alive

A guard on a state no action of the feature can produce leaves every action
dead. Add an **ingest action** that produces it ("Record passing test"):
`roles:["persistence"]`, an unconditional allow rule, one set_state effect,
`triggeredByEvent` naming the upstream event (declared locally). **An ingest
action reads state and takes no parameters**: a cascade passes no input, so a
parameter only ever holds its default and overwrites what the emitter
computed. Read the batch `warnings` that say so.

**One fact, one producer.** Inventory who writes a shared path and who only
observes it. An observer must not increment the owner's counter or replay its
transition: cascades already share the post-state. Test a real success, its
repeat, the next version, then a refusal after that success, with subscribers
enabled. Assert status, exact values, final stage AND raw emitted events.

**A refusal can keep effects.** Read the real mutation order. `block_action`
rolls state back; a rejection after consuming a code needs an outcome with that
consumption retained. Put success-only emissions on the success outcome, not
on a rule that can still run after a block. Read action, surface and feature
invariants before changing a branch. Never weaken an assertion or remove a true
invariant to accommodate an observer that writes the wrong value.

## Who acts, what time does, what the system does

A guard waits on a state; something in the model must move that state, or the
action behind it is never reached. Before writing a guard, name what moves it.

- **Who is acting is a given, not an action.** Role and plan are context states, set by a persona per role. Never default to the most powerful role to make the search pass: the refusal for everyone else then goes unproven.
- **What time does is an action of a schedule.** A guard on an age, a delay or a retention needs an `actor:"schedule"` action that makes time pass ("A day passes" adds 1 to what it ages, or `advance_time` when guards read `clock.now`). The action that starts the clock sets the counter to 0.
- **What the world does is an action of the system.** An outage, a lost connection, a failed payment: `actor:"system"`, or an ingest action on the event. A recovery action is never reached while nothing can break what it recovers.
- **A state another feature owns is read under its own path**, never mirrored into a copy only the guarded action writes.
- **A person's opt-in is an action of that person** ("Join the beta").

**Read the cause the engine gives.** A batch warns when a rule reads a state
no action changes and no persona sets; a target not reached names what holds
it (`stuck`: the path, its starting value, the actions that would change it).
Add what moves it; never force it with scenario overrides.

**One feature at a time, verified before the next.** Write, simulate,
`assess_behavior_feature`, fix, then move on. After a compaction, read the
feature back (`get_behavior_feature` summary, then `action_id`) before writing:
ids and rules live on the server, not in your memory.

## Stopping at a target stage

The stage is read from the maturity percentage. Minimum maturity per target:

| Target stage | Idea | Outlined | Specified | Simulated | Complete |
|---|---|---|---|---|---|
| Min % | 0 | 28 | 50 | 73 | 95 |

- The template's order IS the ladder: surface and states, actions and rules, effects, scenarios, then invariants, goals, criteria. Author a prefix, `score_behavior_feature`, stop once the row is reached.
- Floors at any stage: every action has a rule, nothing comes from memory, every scenario that exists passes.
- Below Simulated, zero engine rejections; open critical issues are the unauthored depth, list them. From Simulated, also `assess_behavior_feature` with no failing scenario or broken invariant.
- Report "authored to <stage> (avg NN%), stopped at the user's target", and record a project-wide cap in the scope section so the next agent reads a decision, not a gap.

## Verify

After each batch, `score_behavior_feature` and read the issues: fix what names
something real, justify what does not apply. At the end,
`assess_behavior_feature` per feature: **verdict.passed, no failed scenario,
no invariant violation, no dead action**.

Read `specGaps` even when the verdict passes. Report scenarios, exploration,
solver proof and code tests separately: `moreToCome:true`, positive `unsettled`
or an interruption forbids a claim of complete proof. A contradictory advisory
does not override the weaker detail; zero scenarios is not a journey test.
When a presence link is accepted by the planner but rejected by another check,
keep the faithful representation and report the contract mismatch.

**Try it while you write it.** `simulate_behavior` walks a feature step by step
and saves nothing: per step `status`, `refusedBecause`, `changes`, `messages`,
`cascaded`. Pass the batch you are about to apply as `operations` to try it
first. `run_scenarios:true` and `model_check:true` run everything in the same
call. A walk reports, it never asserts: pin what it showed as a scenario. The
same tools work on an Evolution draft (`feature_id: "draft:..."`).

**What holds across features lives at the project level**:
`apply_project_behavior_batch` (`add_project_invariant`; one canonical
`add_state_variable`, `link_state_variable` to its data field;
`promote_to_project_library` for what several features copy). Read it with
`get_behavior_project`. Fence a feature with `set_non_goals` and
`set_expected_actions`; run `find_state_references` before renaming a state;
`generate_behavior_types` hands the code typed names.

**Not reached is not dead.** Only an exhaustive search (`truncated:false`)
proves an action dead, and only within `maxDepth` steps. Prove a long chain
with a passing scenario, and say so. Never reshape the model to fit the
explorer's budget.

**A state holding a data field's value is linked to it in the same pass**:
`link_data_fields` ({ table, field, state_path }, many at once). `get_data_links`
shows what remains.

## Gotchas

- **A feature id is global across the workspace.** Prefix it with the project (`feat-<proj>-glossary`); a duplicated id is refused with 409 naming the other claimant: rename the leaf.
- An `update_*` on an unknown id fails loudly: fix the id. Its `patch` is merged raw, so send complete values (a whole expression tree).
- Expression kinds are closed: `literal, state, param, const, add, sub, mul, div, mod, min, max, neg, not, sum, count, sum_pluck, count_where, switch` (`sub`, not `subtract`).
- Take ids from the COMMIT's `refs`, never the dry run's: a commit mints new ids.
- Confirm `batch.ok` and the new `updatedAt` before assessing a saved change. A refused or expired commit changed nothing. After a transport failure with an unknown write result, re-read the version and touched elements before retrying; never blindly replay an increment.
- Before a series of simulations, run one sentinel and inspect the state actually used. If dotted overrides are ignored, use the documented nested form and exclude the invalid runs from proof.
- **Several writers on one feature**: pass `expected_updated_at` (or `--expect` to `apply-batch.mjs`). A feature that moved refuses the batch, writes nothing and names what changed: re-read, rebase, resend.
- `get_behavior_operations {query:"<op or concept>"}` returns any op's exact schema, `update_*` and `remove_*` included.
- `emit_event` and `triggeredByEvent` need the event declared in the same feature.
- `find_state_references` is a starting inventory, not proof of an exhaustive rename: also inspect scenario/persona overrides, outcomes, goals, derivations and every level of invariant. Classify each occurrence before changing it; preserve unrelated literals.
- **An `emit_event` effect names its event in `event`**: `{type:"emit_event", event:"order.placed"}`. Under `eventName` the engine reads no name and refuses the batch.
- "Scenario not found" usually means a wrong `actionId`.
- After batching, re-read `get_section features` once: every leaf keeps its `coreId` and `parentFamilyId`.

## Scope, memory, sources

- Model the feature's OWN slice: one surface, 2 to 4 actions, a handful of states. Journeys live on `__experience`, entities on `__data_model`. Coupling across features is a mirrored event and an ingest action, never a copied surface.
- **Never model from memory.** On an existing product every guard, state, quota and failure path comes from a source read in this session. Not read, not modelled: an honest gap beats a plausible invention.
- **Say where it came from.** A guard or quota taken from a document is cited: register it in `documents` and add its id to `leafMeta.<featureId>.sourceIds` (lyriks-build, *Sources & citations*).
