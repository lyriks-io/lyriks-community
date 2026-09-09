## Engineering principles (apply to ALL code in this repo — not optional)

- **Hexagonal (ports & adapters).** The dependency arrow always points inward: **UI → application → domain**. The domain is the centre and stays pure and framework-free (`src/lib/domain/**` — no SvelteKit, no `fetch`, no IO, no stores, no global side effects). IO/UI/HTTP are adapters at the edges (`src/routes/**`, `src/lib/ui/**`, `src/lib/infrastructure/**`, HTTP clients). Side-effectful global bootstrap belongs at an edge, never inward — e.g. client UI config like `src/lib/ui/icons/offline.ts` is imported by the root layout, not reached into by the domain. Cross a boundary only through an explicit port (interface), never by reaching into another layer's internals.
- **Dependency inversion / reverse DI.** High-level policy depends on abstractions, not concretions. Define ports in the domain/application layer; wire concrete adapters at the composition root (`src/lib/composition/container.server.ts`, imported via `$composition`) — that root is the *only* module that `new`s an adapter or names a concrete infrastructure class. Never `new` an adapter elsewhere, and never import a route/store/UI from the domain.
- **Single Responsibility.** One reason to change per module/function. Use-cases live in `src/lib/application/use-cases/**` and each does one thing; keep pure helpers pure. A module's name should fully describe what it does (`offline.ts` makes icons render offline — and nothing else). Split a file the moment it grows a second responsibility.
- **Bounded contexts.** Respect context boundaries (experience, data, rules, users, framing, …). Each context owns its types and validates input at its edge (anti-corruption — see `parse-experience-*`, `parse-*-draft`). Don't share mutable internals across contexts; communicate through well-typed contracts. New features reuse the existing back API behind a strict bounded context rather than client shortcuts.
- **Clean code.** Small, well-named functions; no dead code or speculative abstractions; prefer pure functions; match the surrounding file's style and idioms; comments explain *why*, not *what*. **Always write code, identifiers, comments, commit messages, and committed docs in English — no exceptions.**


## Enterprise deployment & air-gap (read before adding any runtime dependency)

Lyriks ships as a **self-hosted, on-prem appliance** that must run **air-gapped with zero runtime egress**.
Protect this — it is a sales-critical, audited property (see `docs/`).

- **The platform is the product.** It runs on its own with PostgreSQL, the local coherence engine
  and the stub AI; the MCP gateway (`packages/mcp`) and the behaviour dashboard run beside it.
  Enterprise adds private components; everything here keeps working with `LYRIKS_BACK_URL` unset.
- **No new default egress.** Never introduce a runtime call to the public Internet that runs by default —
  no CDNs, web fonts, telemetry, or remote APIs. The AI backend is **opt-in / BYOK only** (default = local
  stub). Anything outbound must be optional and off by default.
- **Icons are bundled offline — do not regress this.** Icons render from
  `src/lib/ui/icons/lucide-offline.json` (registered by `src/lib/ui/icons/offline.ts`, imported in the root
  layout); the remote Iconify API is disabled. Only the **`lucide`** collection is used. After adding or
  removing any `lucide:*` icon, run **`pnpm icons:build`** to regenerate the committed subset. Never fetch
  icons from `api.iconify.design` at runtime.
- **Dependencies must be permissive, long-lived OSS.** Prefer well-stewarded MIT/BSD/Apache deps; avoid
  third-party copyleft runtime deps. `unspaghettit` (AGPL) is **first-party / vendor-owned** and run as an
  **isolated, runtime-optional subprocess** — keep that boundary; it is not a third-party copyleft risk.
- **Docs**: keep `docs/` in sync when the architecture, stack, or security posture changes. Never
  name specific prospects/customers in committed docs — keep them generic ("the customer").

