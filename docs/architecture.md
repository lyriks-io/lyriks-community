# Architecture

Lyriks is a SvelteKit application with a hexagonal core. The rules that keep
it that way are in [AGENTS.md](../AGENTS.md); this page is the map.

## Layers

```
src/lib/domain          pure: entities, invariants, scores, no IO
src/lib/application     use-cases and the ports they need
src/lib/infrastructure  adapters: PostgreSQL, the behaviour engine, licensing, HTTP
src/lib/composition     the composition root: the only place that news an adapter
src/lib/ui              Svelte components, per capability
src/routes              SvelteKit pages, layouts and API routes
server.mjs              the process entry: the SvelteKit handler plus WebSocket proxies
```

The dependency arrow points inward. A route calls a use-case through the
services object the composition root builds; a use-case talks to a port; an
adapter implements it. Nothing in `domain` imports SvelteKit.

## The composition root and the overlay seam

`src/lib/composition/container.server.ts` builds every service once per
process. The open-source tree composes them from ports that carry a
single-operator meaning: identity is the platform's own operator account,
projects are not mirrored anywhere, the formal verdict is absent, member names
are the operator's.

The Enterprise edition is this tree plus a private overlay. The overlay hands
back its own adapters for some of those ports before the services are built,
and attaches its routes and panels after; what it provides, and how, lives in
the overlay. `pnpm test:oss-boundary` walks `src/` and fails on any Enterprise
construct outside the discovery points.

## Persistence

- **PostgreSQL** holds the project drafts, one document row per section
  (`project_*_drafts`), the operator account, the product activation, the
  residue used for what-changed-since-last-visit, and the settings document.
  Migrations run at boot.
- **The behaviour kernel store** lives on disk under `LYRIKS_UNSPA_ROOT`. The
  [unspaghettit](https://www.npmjs.com/package/unspaghettit) engine owns its
  format; the platform spawns it as an isolated stdio subprocess and never
  imports it.

## The process entry

`server.mjs` wraps the SvelteKit handler and adds what a Node server cannot do
from a request handler: WebSocket upgrades. `/behavior/sync` reaches the
behaviour dashboard's co-editing socket and `/yjs` reaches the realtime
relay, both only with a valid platform session. HTTP requests to `/mcp` and
`/behavior` are proxied from `hooks.server.ts` behind the same session.

## The MCP gateway

`packages/mcp` is a Hono service speaking MCP over Streamable HTTP (one
server per request, no session state). Every tool it registers calls the
platform's API through `LyriksClient` with the caller's session token, so the
gateway never holds data of its own. It is open source in full. The tools only
Enterprise serves are registered by its overlay; here each of them is a
stand-in that says it does not apply, so the tool list is the same on both
editions.

## Identity, session, activation

The session is an HS256 token in the httpOnly `lyriks_session` cookie, signed
with `LYRIKS_JWT_SECRET`; `sub` is the account id. The MCP gateway verifies
the same token with the same secret, which is what makes its OAuth login a
browser redirect to `/login` and back.

A fresh install is unclaimed. The first visitor claims it on `/login` with the
email a licence was issued to and the key itself, then chooses a password;
the key is verified offline against the Ed25519 public key compiled into the
build.

## Scores and coherence

Every number on a page has one definition, in [scores.md](scores.md). The
coherence analysis is deterministic and runs on the drafts plus the behaviour
model; the Control Center shows its gaps with a place to fix each one, and a
declared issue (written by a person or an agent) is a decision to settle, not
a detection.
