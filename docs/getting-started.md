# Getting started

This guide takes you from an installed Lyriks Community instance to a first
specification built from an existing codebase. If you have not installed
Lyriks yet, start with [the README](../README.md#quick-start), or use one of
the alternative setup paths below.

## Before you start

- A running Community instance and the operator password you chose at first
  launch. A new production install also needs a Community key obtained by
  email on <https://get.lyriks.io>.
- An AI coding client that can read your repository and connect to an HTTP
  MCP server. The connection example below uses Claude Code.
- A small existing application you know well, available in a local checkout.
  It is easier to review a first spec when you can check it against the product.

Lyriks stores the spec and attached source evidence locally. Your AI client
may send what it reads to its provider. Local Lyriks storage does not make a
cloud AI client offline.

## 1. Open Lyriks

Open the address printed by the installer. With this repository's default
Docker Compose setup, it is <http://localhost:3000>.

On a new install, enter the Community key sent to your email and choose the
operator password. The key is checked locally. On later visits, sign in with
that password. You should reach the project list.

If you installed with the appliance kit, run `./lyriks smoke` from its
directory to check the stack. With direct Compose, use `docker compose ps`
to check the services. The one-shot `unspa-init` service should exit with
code 0; the other services should stay running.

## 2. Connect your AI client

For Claude Code and the default local Compose address:

```bash
claude mcp add --scope user --transport http lyriks http://localhost:3000/mcp
```

Replace `http://localhost:3000` with the address you use to open Lyriks if
it differs. Open your AI client in the application repository you want to
describe. In Claude Code, run `/mcp` and sign in to Lyriks when prompted.
Approve the connection you just started.

Ask the client:

> Connect to the Lyriks MCP server, list my projects, and load the authoring
> guides with sync_skills. Confirm that lyriks-retrospec is available before
> creating anything.

An empty project list is a valid result on a fresh install. A connection
error is not: resolve it before starting the walkthrough. See
[the MCP guide](mcp.md) for authentication and client configuration details.

## 3. Create your first spec: code to spec

Use a small application for this first pass. Replace “First spec” below if
you prefer another project name, then send this prompt to your coding client:

> Using the Lyriks MCP and the lyriks-retrospec guide, create a project named
> "First spec" from this codebase. Reuse that project if it already exists.
> Describe what the product does for its users: its features, roles, screens,
> rules and data. Use the source code as evidence, link the modelled behaviour
> back to that evidence, and sync the implementation mapping. Do not change
> the application's code. Report anything you could not verify, then give me
> the project link and the completion report.

The client reads your checkout and writes the spec through MCP. Lyriks does
not scan the checkout on its own. The client may need to save an
implementation index in the checkout to keep the spec-to-code links.

When the client finishes, open **First spec** in Lyriks. You should have a
feature tree, descriptions of the product's users and rules, and source
evidence for the behaviour the client modelled. The completion report should
identify any work that remains; a generated spec is still a draft to review.

## 4. Check the result against the product

Pick one feature whose behaviour you know well, such as creating an item or
changing its status.

1. In **Features**, check that its name and description match what a user does.
2. Review its behaviour: the allowed actions, the rules that refuse an action,
   and the edge cases. Compare them with the application and its code.
3. Open **Coherence** and inspect the reported gaps. Check the issue details,
   rather than relying only on the score.
4. Open **Roadmap** to see the recorded implementation coverage. Ask the client
   to show the source evidence for your chosen feature. A code link records
   evidence; it does not prove that the running application behaves correctly.

If you find a mismatch, describe it to the client with a concrete example:

> In First spec, the feature "[feature name]" says "[current description]",
> but the product actually does "[observed behaviour]". Check the relevant
> code, correct the spec and refresh its implementation mapping. Re-run the
> checks and report the remaining gaps. Do not change the application's code.

Reopen the feature and check the correction. Your first pass is complete when
you can find the feature, explain its rules, inspect its code evidence and
identify what still needs review. You do not need a perfect score to learn
from this first walkthrough.

## Common problems

| Symptom | What to check |
|---|---|
| The browser cannot reach Lyriks | Use the address printed at startup. For Compose, run `docker compose ps` and `docker compose logs --tail=100 platform postgres`. For the appliance, run `./lyriks doctor` and `./lyriks smoke`. |
| Compose reports a missing secret | Uncomment `POSTGRES_PASSWORD` and `LYRIKS_JWT_SECRET` in `.env` and set generated values as described below. |
| Activation or login is still required after setting a flag to `0` | Production Community installs always require both. Enter your Community key and operator password; the flags do not bypass them. |
| The AI client cannot find the MCP server | Use the app's address followed by `/mcp`. In development, start `pnpm dev:mcp` as well and check `LYRIKS_MCP_URL` in the app's environment. |
| MCP connects, but project requests fail in development | Set `LYRIKS_BASE_URL` in the gateway's terminal to the app's actual address, especially under WSL. Restart the gateway after changing it. |
| MCP asks you to sign in again | Reconnect from the client. Gateway restarts, signing out and password changes can invalidate MCP access. |
| `lyriks-retrospec` is missing | Check the catalog returned by `sync_skills`. Update the platform and gateway together if the installed release does not include the guide. |
| The spec has no implementation coverage | Ask the client to finish the source-evidence pass and sync the implementation mapping. Creating feature descriptions alone does not establish code coverage. |
| PostgreSQL fails in development | Check that the server is running and that the database and credentials in `LYRIKS_PG_URL` exist. Migrations create tables, not the database or its user. |

## Where to go next

- **Coherence:** work through a reported contradiction or missing rule. See
  [Scores](scores.md) for what the readings mean.
- **Impact analysis:** ask your client to inspect the project's knowledge graph
  for a planned feature or rule change and list linked elements to review.
  The result depends on the links already recorded in the spec.
- **Implementation analysis:** after a code change, ask the client to refresh
  the implementation mapping and report remaining gaps or spec drift.
- **Delivery:** use the `lyriks-delivery` guide listed in [MCP skills](mcp.md#skills)
  to turn the spec into implementation tickets.
- **A complete project:** use the [project completion guide](project-completion.md)
  to understand the full acceptance gate.

For a problem the table does not resolve, see [Support](../SUPPORT.md).

## Alternative setup: Docker Compose

Requirements: Git, Docker with Docker Compose, and internet access to pull
the images and obtain a Community key. Published images target `linux/amd64`;
the release workflow has not validated native arm64 images or Apple Silicon
installation.

```bash
git clone https://github.com/lyriks-io/lyriks-community.git
cd lyriks-community
cp .env.example .env
openssl rand -hex 16    # copy the output into POSTGRES_PASSWORD in .env
openssl rand -hex 32    # copy the output into LYRIKS_JWT_SECRET in .env
```

Uncomment those two entries and paste the generated values into `.env`.
Use the generated text, not a shell command such as `$(openssl rand -hex 16)`:
Compose does not execute commands in this file.

```bash
docker compose up -d
```

Continue at [Open Lyriks](#1-open-lyriks).

### Updates and backups

The Compose file pins image versions. Before updating, back up PostgreSQL and
the behaviour store in the `postgres-data` and `unspa-data` volumes. Use a
newer release checkout and review its configuration changes. If the Compose
configuration is unchanged, you can instead set `LYRIKS_TAG` in `.env` to the
published release tag. Then run:

```bash
docker compose pull
docker compose up -d
```

Pulling without changing the selected version does not select a new release.
See [Releases](releases.md) for the available image channels and versioning.

The appliance kit automates these maintenance tasks from its directory:

```bash
./lyriks backup     # PostgreSQL dumps and the behaviour store
./lyriks update     # backup first, then install the next release
./lyriks rollback   # return to the previous release's images
```

## Alternative setup: from source

Requirements: Node 22, pnpm 10.6.3 through Corepack, and PostgreSQL 16 with an
existing database and user accessible from your machine.

```bash
git clone https://github.com/lyriks-io/lyriks-community.git
cd lyriks-community
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `LYRIKS_PG_URL` in `.env` to your database's connection string, then start
the application:

```bash
pnpm dev:community
```

Use the URL printed by the dev server: normally <http://localhost:5173>, or
<http://localhost:8173> under WSL. Migrations run at startup and create the
required tables. With the default configuration, development needs neither
a licence key nor a login.

In a second terminal, from the same repository directory, start the gateway.
Set its target to the actual app address if it differs from port 5173:

```bash
# Under WSL; use your actual app address if different.
export LYRIKS_BASE_URL=http://localhost:8173
pnpm dev:mcp
```

On a default non-WSL setup, just run `pnpm dev:mcp`. The gateway listens on
port 3001. The app proxies `/mcp` to it through `LYRIKS_MCP_URL`, already set
in `.env.example`. Continue at [Connect your AI client](#2-connect-your-ai-client),
using the dev app's address; default development does not require signing in.

Run `pnpm check && pnpm test` before contributing. The full checks are in
[the CI workflow](../.github/workflows/ci.yml).

## Building the images

After installing dependencies from the frozen lockfile as above, build all
three images from the repository root. These commands tag them locally and
keep the behaviour viewer at the same version as the installed engine:

```bash
docker build -t local/lyriks-platform-community:dev .
docker build -f packages/mcp/Dockerfile -t local/lyriks-mcp-community:dev .
docker build -f docker/dashboard.Dockerfile \
  --build-arg UNSPA_VERSION="$(node -p "require('unspaghettit/package.json').version")" \
  -t local/lyriks-behavior-community:dev .
LYRIKS_REGISTRY=local LYRIKS_TAG=dev docker compose up -d
```

Set the two Compose secrets in `.env` before starting, as in the Docker
Compose setup above. Compose connects the services and mounts their persistent
data. This is a production Community build: activation and login are required.
See [Configuration](configuration.md) for runtime variables.
