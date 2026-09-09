# Project completion

Project completion is a distinct product verdict. It is not an alias for
Experience coverage, build readiness, behavior maturity, generation confidence,
or a successful evidence-pack run.

## Reference set

The `scope` bounded context persists the external reference set used by the
completion gate:

- authoring mode (`full_product`, `selected_scope`, or `prototype`);
- externally expected capabilities and their evidence-source ids;
- the disposition of each capability;
- included capability-to-leaf-feature mappings;
- approved omissions and their rationale;
- an assessment for every canonical project section;
- the last audit fingerprints and completion state.

This prevents circular coverage. The feature tree cannot prove that it contains
everything by comparing itself only with the features it already contains.

The scope document uses the consolidated `project_section_documents` store, so
existing installations need no schema migration. Existing projects load with an
`unclassified` mode and an unassessed row for every section; they remain usable
but cannot be marked complete until their scope is declared and audited.

## Gate

`assessProjectCompletion` is a pure domain function. The application layer
supplies current evidence through ports:

- registered Documents & Sources ids;
- settled Approvals ids;
- per-leaf behavior maturity;
- project-health readiness and blocking coherence gaps;
- end-to-end Experience verification;
- a fingerprint of every authorable model-section revision.

Completion is blocked when, among other things, a capability is unresolved,
unsourced, unmapped, or behaviorless; an omission is not approved; a section is
unassessed; project health or Experience verification is not ready; or the audit
fingerprints no longer match.

Three warnings never block but fail their check and stay on every report
until resolved: a behavior entity the data model does not represent, a data
table related to nothing, and a registered source nobody but its author can
consult (`source-unreachable`: a `file://` path, a local path or a plain
reference in its url; `source-empty`: neither a link nor a note). A source is
reachable through a web address anyone can open, or through its content
carried verbatim in the note. The Documents & Sources save answers with the
same rows as `coherenceIssues`, so an agent fixes them in the same pass.

Full-product mode forbids exclusions, deferrals, and not-applicable sections.
Selected-scope and prototype modes allow them only with a rationale and an
`approved` or `accepted_risk` approval.

## State transitions

```text
scope/model edit
    -> in_progress (previous audit becomes stale)
    -> audit_project_scope
        -> ready when no blocker remains
        -> in_progress otherwise
    -> finish_project
        -> completed only against the same fresh fingerprints
```

The audit stores both a scope fingerprint (including referenced source content)
and a model-revision fingerprint. Any later section save invalidates the global
verdict without deleting the historical audit.

## Two audit fields, two lifecycles

`audit` is the CURRENT snapshot and is dropped the moment the scope content
changes — that is what makes the gate honest. `auditLog` is the append-only
history of gate runs (newest first, capped at `SCOPE_AUDIT_LOG_LIMIT`) and
survives that invalidation, so a reviewer reads the sequence of attempts rather
than only the latest verdict. Each entry records who ran it, whether it was an
`audit` or a `completion`, the score, the verdict, the blocker count and the
check keys that failed. Both fields are server-owned: only
`AuditProjectScopeUseCase` and `FinishProjectUseCase` write them, and an
ordinary `PUT /api/draft/scope` save preserves the log verbatim.

## Surfaces

- Product UI: **none, deliberately.** The ledger is reasoning the modelling agent
  is forced through before it authors — a human filling it in would be
  self-certifying the gate — and the completion model has more moving parts than
  we currently master, so nothing about it is surfaced in the product for now.
  `scope` is a hidden capability with **no route**, and `/projects/:id/scope`
  308s to Foundation. Projects open on Foundation, from the portfolio and from a
  bare project URL alike. The gate itself is untouched and fully driven through
  the JSON API and the MCP; re-exposing a read-only review surface later means
  rendering `ProjectCompletionReport` plus `auditLog`, both of which are live.
- JSON: `GET|POST /api/projects/:projectId/completion` assesses, audits, and
  finishes; `GET /api/projects/completion` returns a compact read-only portfolio
  audit; `PUT /api/draft/scope` authors the ledger.
- MCP: `assess_project_completeness`, `audit_project_scope`, and
  `finish_project` expose the same use-cases;
  `assess_portfolio_completeness` supports safe bulk triage.
- Generation: closing a generation run is labelled as such and never mutates
  project completion.
