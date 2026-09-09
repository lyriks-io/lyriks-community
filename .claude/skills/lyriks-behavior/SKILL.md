---
name: lyriks-behavior
description: "Author FULL unspaghettit behavior depth on Lyriks features via mcp__lyriks__apply_behavior_batch: surfaces, typed state, actions with mandatory rules, effects, executable scenarios, invariants, reachability goals. MANDATORY whenever features are created: a feature is NEVER left at 0% (name+description only) unless the user explicitly asks for shells, or names a target TRL (\"stop at TRL 5\"), which caps the authored depth per the TRL ladder in this skill. Invoked by lyriks-build at the features step; usable standalone to deepen an existing project."
---

# /lyriks-behavior

Every leaf feature ships with a **complete, verified behavior model**, not a name and a description. A 0%-maturity feature is a defect, not a starting point; leave shells only when the user explicitly asks for them. Proven end-to-end on Zappier (2026-07-22): 21/21 features authored to 94–100% structural, all scenarios green, model-checked.

**Exception the user can invoke: a target TRL.** When the request names a level ("stop at TRL 5", "au TRL 6 ça suffit", "TRL 4 partout pour l'instant"), ACCEPT it; full depth is the default, not a mandate that overrides the user. Author to that level per the ladder below, verify what exists, and report "authored to TRL x", never "complete".

**Maximize USEFUL information, not the score.** The target is "everything that is genuinely true about this feature is in the model": every real guard, state, event, failure path and promise. It is NOT 100% on every feature: some checks legitimately don't apply (a single-screen feature has no surface transitions; a pure read has no permissions story; ImplementationStatus is empty before code exists). Never invent a construct just to silence a recommended check: a fake invariant or a decorative transition makes the model LESS true. Chase correctness (verdict passed, scenarios green) to 100%; let structural % land where honesty puts it, and be able to say why each remaining issue is expected.

## The vocabulary language law (code-facing names are English, always)

A Lyriks spec captures BEHAVIOR. How its names relate to the code's
identifiers depends on the direction, and the language rule below holds in
both:

- **Spec to code** (the code does not exist yet): the spec's name IS the
  code's identifier by default. Same name, no translation, no "better idea";
  departing from it is the exception and needs a reason. That is what makes
  the spec-to-code map nearly mechanical.
- **Code to spec** (the code exists, retro-spec / adoption): the spec is
  written as agnostically as possible, in the product's words and never in the
  code's jargon, while reflecting EXACTLY the variable or logic it maps to.
  The exactness is carried by the span and the index entry (file, line,
  signature), not by the name; lyriks-trace and the provenance gate audit it.

In both directions, everything in the spec that names a thing the code will
also name is authored in ENGLISH, whatever language the product, the user or
the conversation is in:
entity and field names, enum values, state paths (`cart.itemCount`, never
`panier.nombreArticles`), event names (`order.paid`), action names and
parameters, surface and component names, transition ids, role and permission
ids, collection names, and the enum literals used in scenario `stateOverrides`
/ `parameterOverrides`. State paths and event names go further: they become
`.unspa.json` keys verbatim, so a French one is a French key in the checkout
forever. Never code in French from a Lyriks spec: when a spec already carries a
French code-facing name, rename it in the spec first, then code.

Only what has NO effect on the simulation may follow the user's language:
descriptions, intents, rationales, rule and invariant `description`, glossary
definitions, briefs, persona stories, acceptance-criterion prose. Product copy
the end user sees (screen labels, messages, empty states) is product data and
stays in the product's own language. Answer in French when the user writes in
French; name in English regardless.

## The feature card comes before the batch

Before the batch below, write the feature in four to six lines of product
words: who can do what, the states the thing goes through, the guards that
block, what a blocked user sees. Announce the batch from that card, and record
every product decision it embeds (who may do what, lifecycle states,
thresholds, what a blocked user sees) in the register lyriks-build's protocol
"Narrate, checkpoint, and never invent a product decision silently" defines.
In accompanied mode the card is the checkpoint: the user answers on the card,
never on the ops.

## The per-feature template (~20–30 ops, one batch)

One `apply_behavior_batch` per feature (`feature_id` = the features-section leaf id; `project_id` = the project slug). Dry-run the FIRST batch of a session to validate shapes, then apply the rest directly. Always pass `ref` on every add op.

1. **`add_surface`** (1, ref `srf`): `{name, type, description}`; types: screen, canvas, terminal, board, workflow, dialog_area…
2. **`add_state_definition`** ×3–6: `{surfaceRef, path, type, defaultValue, description}`; enums need `enumValues` inline. Model the feature's real lifecycle (`zap.status: draft|on|off`), not booleans-for-everything. Role gating: declare `session.role` (enum owner|builder|operator|viewer) per feature.
3. **`add_event`** ×1–2: dot-separated names (`zap.published`). Declare BEFORE any action's `emittedEvents`/`triggeredByEvent` or `emit_event` effect references it, even if the event "belongs" to another feature (declare a mirror).
4. **`add_action`** ×2–4 (each with `ref`): `{surfaceRef, name, intent, roles[], emittedEvents?}`. **Every action needs ≥1 `add_action_rule` in the same batch or the batch is rejected.** Genuinely unconditional? Say it as a rule: no condition + `effect:{type:"allow_action"}`.
5. **`add_parameter`** per action input: `{name, type, required, description, bindToStatePath?, validations[]}` (validation types: non_empty, email, min_length, positive, integer…).
6. **`add_action_rule`**: the guards ARE the product's core reading. Categories: permissions/security/compliance (role gates), validation (preconditions), business (lifecycle), billing_quota (caps), error_handling, data. Block shape: `{category, condition, effect:{type:"block_action", reason, description}, description}`. Operators: equals, not_equals, greater_or_equal, lower_or_equal, greater_than, lower_than, contains, is_true, is_false, exists (NOT eq/neq/greater_than_or_equal). `condition.right` accepts `{kind:"state"|"param"|"literal"|"mul"|"add"|…}` expressions: compare against state (`right:{kind:"state",path:"zap.stepLimit"}`), thresholds (`{kind:"mul",…}` for "80% of quota"). Param-left works on action rules only: `left:{kind:"param",name:"stepIndex"}`.
7. **`add_effect`** per action: set_state (value can be an Expression: `{kind:"add",left:{kind:"state",path},right:{kind:"literal",value:1}}` for counters, `min`/`max` to clamp), emit_event, show_message, append_to_list/remove_from_list. Add an **`onBlocked:true` show_message** on every action that has a block rule; blocked paths must not fail silently.
8. **`add_scenario`**: **one per non-trivial action minimum**, covering success AND blocked: `{surfaceRef, actionRef, name, description, stateOverrides[], parameterOverrides[], expectedStatus:"success"|"blocked", expectedAssertions:[{path, operator, value, description}]}`. stateOverrides/parameterOverrides are ARRAYS of {path|parameterName, value}. **Scenario overrides must satisfy the feature's invariants**: seeding `status=on` while the invariant says "on implies tested" without also seeding tested=true makes the engine block the action and fail the scenario.
9. **`add_surface_invariant`** ×1+: `{invariant:{name, condition, message, description}}`. Condition = the property that ALWAYS holds (TRUE = holds; FALSE = violation blocks the run). Implications A⇒B as `{kind:"any",conditions:[not-A, B]}`; ranges as `{kind:"all",…}`. Never condition-less, never tautologically false, and never tautologically TRUE: an invariant that cannot fail (`count >= 0` on a counter) proves nothing, inflates the score, and is worth less than its absence. If the real property is not establishable from evidence, write no invariant and say why.
10. **`add_reachability_goal`** ×1: `{goal:{name, kind:"reachable"|"always_reachable", condition, description}}`, the liveness complement ("a Zap can go live"; use always_reachable for "a paused Zap can always recover").
11. **`add_acceptance_criterion`** ×1–2: prose Given/When/Then for what scenarios can't check (UI qualities, cross-system promises).
12. **`add_persona`** where roles matter: `{name, description, stateOverrides:[{path:"session.role",value:"viewer"}]}`.

## Keep the state machine ALIVE (the dead-enabler trap)

If an action's guard depends on state **no in-feature action can produce** (publish needs `lastTestPassed` but testing lives in another feature), the model checker reports every action dead and the feature deadlocked at init. Add a small **ingest action** that produces the enabling state ("Record Passing Test", "Credential Expiry Detected", "Record Failing Run"): `roles:["persistence"]`, unconditional allow rule, one set_state effect, `triggeredByEvent` naming the (locally declared) upstream event. This models the real cross-feature signal AND makes the state space explorable.

**An ingest action reads state; it never takes parameters.** A cascade passes no input, so a handler's parameters can only ever hold their defaults. The engine refuses a REQUIRED parameter on a handler and tells you to give it a default, which is the trap: every cascade then writes that default, and a `set_state` effect fed by it overwrites what the emitter just computed. The damage surfaces far away, as a scenario whose assertions look like a modelling error. Author handlers with zero parameters, reading the state they need. `apply_behavior_batch` now answers with a `warnings` entry when a handler carries parameters: read it, do not dismiss it.

## Stopping at a target TRL (user-invoked depth cap)

The platform reads maturity % as a TRL via `TRL = round(% × 9 / 100)`, clamped to 1–9. So a target TRL x means: every in-scope leaf reaches AT LEAST the minimum % below, and you stop deepening once `score_behavior_feature` confirms it.

| Target TRL | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Min maturity % | 0 | 17 | 28 | 39 | 50 | 62 | 73 | 84 | 95 |

How to run it:
- **Scope**: the target applies to the features the request names, or to every included leaf when project-wide. A mixed request ("TRL 7 on payments, TRL 3 elsewhere") is per-group.
- **Author in the template's order and stop when the score lands.** The template's step order IS the depth ladder: surface + states first, then actions with their rules, then effects, then scenarios, then invariants/goals/criteria. Batch a coherent prefix of it, `score_behavior_feature`, and stop as soon as `percentage >=` the target row; do not pad past the target, and do not trim an already-applied batch back down.
- **Floors that never drop, at any TRL**: every action still carries >= 1 rule (the engine rejects the batch otherwise); everything written still obeys evidence-first and never-model-from-memory; whatever scenarios DO exist must pass. A depth cap caps how much is authored, never the honesty of what is authored.
- **Verify proportionally.** Below TRL 6 run `score_behavior_feature` and require zero engine REJECTIONS but accept open critical issues (they are the unauthored depth, list them). From TRL 6 up (>= 62%, scenario territory) also run `assess_behavior_feature` and require scenarios failed:0 and no invariant violations on what exists. The full verdict bar (passed:true, deadActions:[]) applies only to full-depth work.
- **Report it as a capped state, never completion**: "authored to TRL x (avg NN%), stopped at the user's target; remaining engine issues: ...". The project-level consequences stand: the readiness gate and `finish_project` may stay below their thresholds, and that is the expected outcome of the cap, not a failure to fix. Say so instead of chasing the score.
- **Record the decision**: when the cap is project-wide, note it in the scope section (a `sectionAssessments` note or an approvals row), so the next agent reads a decision instead of rediscovering a "gap".

## Verify: authoring isn't done until the engine agrees

After each batch (or at least per core): `score_behavior_feature`, and read the ISSUES, not just the number: fix every issue that names something real and missing; leave (and be able to justify) the ones that don't apply to this feature. At the end, `assess_behavior_feature` per feature and require: **verdict.passed:true, scenarios failed:0, invariantViolations:[], deadActions:[]** (deadActions on parameterized-only enablement is a known checker bound; the scenarios must prove those paths instead). Fix and re-assess; do not report done on a failing verdict.

## Gotchas that bite (all hit in practice)
- **A feature id is global, so make it project-unique.** The engine resolves `featureId` across the WHOLE workspace while Lyriks reads per project, so a generic id (`feat-glossary`, `feat-licensing`) that two projects both declare gives one record two claimants: your batch lands in the other project, and yours keeps reading its own folder, shows nothing authored and blocks on `capability-behavior-missing`. Prefix every leaf id with something of the project (`feat-<proj>-glossary`). A write on a duplicated id is now refused with 409 naming the other claimant; if you hit it, rename the leaf rather than working around it.
- `update_*` targeting an id that doesn't exist now FAILS LOUDLY (`<kind> <id> not found in feature`) instead of the old silent `ok, appliedCount>0` no-op, so `remove_*` + `add_*` is no longer the workaround it used to be; a rejected update means the id is wrong, so fix the id. Removes stay idempotent by design.
- But `update_effect`/`update_*` merge their `patch` **raw**, without the normalisation `add_effect` runs on a full payload. So a patch must carry fully-formed values, in particular a complete Expression tree (`{kind:"sub",left,right}`), never a half-shape. Malformed expression kinds in a patch are rejected up front (see the expression-vocabulary note below).
- **Expression kinds are a closed vocabulary**: `literal, state, param, const, add, sub, mul, div, mod, min, max, neg, not, sum, count, sum_pluck, count_where, switch`. It is `sub`, **not** `subtract`. An unknown kind used to be stored as a plain literal, which made `max(0, <garbage>)` evaluate to `0`, so decrement-to-zero scenarios PASSED over a completely inert effect. Unknown kinds are now rejected at write time with a did-you-mean.
- Scenario/rule ids are minted at apply time: capture them from `refs` (via `ref`) or read them back; dry-run ids do NOT survive a commit.
- `emit_event` / `triggeredByEvent` require the event declared in the SAME feature first.
- The scenario's action lookup is scoped to the action you pass: a "scenario not found" usually means wrong `actionId`.
- After batching on leaves, re-read `get_section features` once: every feature must still carry its `coreId`/`parentFamilyId` (tag-case projection gotcha; hardened in-repo, still verify).
- More in the memories: [[unspa-kernel-authoring-vocabulary]], [[rules-mandatory-on-actions]], [[condition-less-invariant-poison]], [[unspa-bind-on-block-leak]].

## Scope discipline
Model the feature's OWN slice: 1 surface, 2–4 actions, a handful of states. Don't re-model journeys (they live on `__experience`) or entities (`__data_model`). Cross-feature coupling = a mirrored event + an ingest action, never copied surfaces.

## Never model from memory

On an existing product, every guard, lifecycle state, quota and failure path you
model must come from a source read in-session (the code span, a doc, a tool
response), never from what you believe you know about the product. If you have
not read it, do not model it: an honest gap beats a plausible invention.

## Say where the behavior came from
The kernel holds no citations, so the evidence lives Lyriks-side: when a guard, quota, lifecycle or legal constraint you just modelled comes from a real document (a regulation, a contract, an interview, an existing system's docs), register it in the `documents` section and cite its id on the leaf: `patch_section features` → `leafMeta.<featureId>.sourceIds`. A rule nobody can trace back is a rule nobody can defend in review. See the *Sources & citations* section of `/lyriks-build`.
