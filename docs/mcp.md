# The MCP gateway

An AI client authors a Lyriks project through the Model Context Protocol. The
gateway is the `packages/mcp` service of this repository, run beside the
platform; the platform serves it at `<app origin>/mcp` so the client logs in
with the same browser session as the person using it. The gateway keeps no
data: every tool reads and writes through the platform's own API.

## Connecting a client

```bash
claude mcp add --scope user --transport http lyriks https://<your-install>/mcp
```

Then run `/mcp` in the client and sign in. The gateway uses OAuth with PKCE
and dynamic client registration; the login is the platform's own `/login`.

## What Community answers

Every section tool (`get_section`, `patch_section`, `set_section`,
`build_screen`, `apply_behavior_batch`, `simulate_experience`,
`assess_project_completeness`, `audit_project_scope`, ...) runs on the
platform. The portfolio tools (`list_projects`, `create_project`,
`get_project`) answer from the platform as well; `list_workspaces` is empty
because Community does not group projects into workspaces. The five formal
graph tools (`get_model`, `get_view`, `find_inconsistencies`, `apply_rule`,
`generate_artifact`) belong to the Enterprise engine and say so when called.
The tool surface is the same in both editions, so an agent's playbook works
on either without knowing which one it talks to.

## Skills

The platform ships the authoring playbooks an agent installs at the start of a
session with `sync_skills`. They live under `.claude/skills/` in this
repository and are served by the gateway:

| Skill | Use it to |
|---|---|
| `lyriks-build` | author a project end to end: scope, every section, the Experience prototype, the completion gate |
| `lyriks-design` | compose screens component-first with a product-derived visual identity, before any screen work |
| `lyriks-behavior` | give features their full behaviour depth: surfaces, state, actions with rules, scenarios, invariants |
| `lyriks-retrospec` | reverse-engineer an existing product into its specification, in the product's words |
| `lyriks-delivery` | turn the specification into tickets whose acceptance criteria are the modelled scenarios, and re-sync once code lands |

The catalog `sync_skills` returns is the authority on what an install ships.

## Running the gateway in development

```bash
pnpm dev:community     # use the printed app URL: normally 5173, or 8173 under WSL
pnpm dev:mcp           # the gateway on 3001, pointed at the platform
```

Run these in separate terminals. The gateway targets `http://localhost:5173`
by default. If the app uses another port, set `LYRIKS_BASE_URL` in the gateway's
terminal before starting it. Under WSL:

```bash
export LYRIKS_BASE_URL=http://localhost:8173
pnpm dev:mcp
```

The dev server proxies `/mcp` to `LYRIKS_MCP_URL` and serves nothing there
when the variable is unset: `.env.example` points it at the gateway's default
port (3001; the appliance wires `http://mcp:3055`). The gateway reads `LYRIKS_BASE_URL` (the platform), `JWT_SECRET` (the platform's
`LYRIKS_JWT_SECRET`), `MCP_AUTH_REQUIRED` and `PUBLIC_BASE_URL`. Default development
needs no authentication settings; `LYRIKS_BASE_URL` is needed when the app
address differs from the default.

## The Enterprise seam

The gateway has the same shape as the platform: `src/` is the whole Community
service, and a private overlay fills the Enterprise build. The tools only
Enterprise serves (`get_model`, `get_view`, `find_inconsistencies`,
`apply_rule`, `generate_artifact`) are registered by that overlay with their
real arguments; here each of them is a stand-in that answers that it does not
apply and names the tools to use instead, so the tool list is the same on both
editions. `pnpm test:mcp` runs the suite and `scripts/oss-boundary.test.mjs`.

## Consent and session security

After signing in, approve the client name and callback only if you started the
connection. MCP gets a separate one-hour credential, never your browser session
JWT. Strict mode no longer accepts browser JWTs as MCP bearer tokens. Upgrade
the platform and gateway together and reconnect existing clients after upgrading.
The gateway keeps grants in memory, so a restart also requires reconnection.
Every request rechecks the backing session and role with the platform. Clients
can revoke a grant by posting a form-encoded `token` to `/mcp/oauth/revoke`.

Changing the Community password or signing out revokes existing operator sessions
and their MCP access. Already-open sockets are rechecked within 30 seconds.
Keep dashboard and relay ports private; use the platform's same-origin proxy.
