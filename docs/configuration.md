# Configuration

Every variable is optional unless marked required. The platform reads them at
runtime; the appliance kit sets the ones it needs from its `.env`.

## Persistence

| Variable | Meaning |
|---|---|
| `LYRIKS_PG_URL` | PostgreSQL connection string. **Required.** |
| `LYRIKS_PG_POOL_MAX` | Connections per node. Keep node count times this value under the server's `max_connections`. |
| `LYRIKS_PG_STATEMENT_TIMEOUT_MS` | Statement timeout, so one slow query cannot pin a connection. |
| `LYRIKS_UNSPA_ROOT` | Root of the behaviour kernel store. Default `data/unspa`, relative to the process directory. |
| `UNSPAGHETTIT_MCP_BIN` | Path to the unspaghettit engine binary. Default: resolved from the installed npm package. |
| `LYRIKS_BUS` | `memory` (default) or `postgres` on every replica of a multi-node deployment. |

## Identity and access

| Variable | Meaning |
|---|---|
| `LYRIKS_JWT_SECRET` | Signs the session token. **Required** when authentication is on. Shared with the MCP gateway. |
| `LYRIKS_AUTH_REQUIRED` | Derived from the edition: a build that declares `LYRIKS_EDITION` walls the application behind the operator login, and this flag cannot switch it off. It only switches the wall on for a build that declares no edition. A `vite dev` boot is exempt. |
| `LYRIKS_ADMIN_EMAILS` | Addresses allowed to perform administrative mutations, such as entering a licence. |
| `LYRIKS_TRUSTED_ORIGINS` | Origins accepted for form submissions and API mutations (CSRF). The public address of the install. |
| `LYRIKS_COOKIE_DOMAIN` | Widens the session cookie to a parent domain. Leave unset for a single host. |
| `LYRIKS_ALLOW_SIGNUP` | Local self-registration. Community does not need it: the first-run claim creates the operator. |

## Product activation

| Variable | Meaning |
|---|---|
| `LYRIKS_EDITION` | `community`. Every declared edition is licensed; a Community key activates a Community install. |
| `LYRIKS_LICENSE_REQUIRED` | Derived from the edition; only matters when no edition is declared. A `vite dev` boot is exempt. |
| `LYRIKS_LICENSE_PUBLIC_KEY` | Overrides the bundled signing authority. Ignored unless the next flag is set. |
| `LYRIKS_LICENSE_ALLOW_KEY_OVERRIDE` | `1` lets a build accept the override above (reseller or test keys). |

Keys are verified locally with an Ed25519 public key compiled into the build.
Activation makes no network call.

## Companion services behind the app origin

The entry process serves three paths from the same origin as the application,
so one session cookie covers everything and no extra ingress rule is needed.

| Variable | Meaning |
|---|---|
| `LYRIKS_MCP_URL` | Internal address of the MCP gateway, served at `/mcp`. |
| `LYRIKS_UNSPA_URL` | Internal address of the behaviour dashboard, served at `/behavior` behind the session. |
| `LYRIKS_YJS_INTERNAL_URL` | Internal address of the realtime relay, served at `/yjs` behind the session. |
| `PUBLIC_YJS_WS_URL` | Browser-facing WebSocket address of the relay when it is not on the app origin. |
| `PUBLIC_UNSPA_DASHBOARD_URL` | Browser-facing address of the dashboard when it is not proxied. |

## Release awareness

| Variable | Meaning |
|---|---|
| `LYRIKS_VERSION`, `LYRIKS_TAG` | The release this process runs as, shown in Settings > Versions. |
| `LYRIKS_BUILD_SHA`, `LYRIKS_BUILD_DATE` | Build provenance, set by the image build. |
| `LYRIKS_UPDATE_CHECK` | `1` lets an administrator be told when a newer release exists. Off by default: no network call. |
| `LYRIKS_REGISTRY` | The registry the check asks, the same one the install pulls from. |
| `LYRIKS_REGISTRY_USERNAME`, `LYRIKS_REGISTRY_PASSWORD` | Read-only pull credentials, only for a private mirror with the check on. |
| `LYRIKS_HOST_FACTS_FILE` | The host record the appliance kit writes at install and update, read for Settings > Versions. |
| `LYRIKS_FEEDBACK_URL` | The feedback relay. `off` removes the online channel; the dialog then offers mail and copy only. |

## AI cost governor (opt-in)

| Variable | Meaning |
|---|---|
| `LITELLM_GATEWAY_URL`, `LITELLM_MASTER_KEY` | Both set wires an on-prem LiteLLM proxy; the governor then provisions one virtual key per scope. |
| `LITELLM_CHEAP_MODEL` | Model the "route to a cheaper model" guardrail pins traffic to. |
