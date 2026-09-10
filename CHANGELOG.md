# Changelog

All notable changes to Lyriks Community are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow the platform's semantic version.

## [Unreleased]

## [0.9.24] - 2026-09-10

### Fixed

- Approving an AI client in the browser no longer fails with "cross-origin
  request blocked". The consent page hid the referrer from itself, which made
  browsers send a null Origin on the consent form's own POST, and the gateway
  then refused it. The page now keeps the referrer for same-origin requests
  and the gateway also accepts the browser's own same-origin attestation.

### Added

- The appliance smoke test proves AI clients keep their MCP registration: it
  registers a client and requires a signed registration, checks the
  authorization page accepts it, and re-checks the client it registered on
  the previous run after every update or restart.

## [0.9.23] - 2026-09-10

### Fixed

- AI clients stay connected to the MCP gateway across gateway restarts and
  token expiry. A client registration is now a signed identifier the gateway
  verifies instead of a record it kept in memory, and the short-lived access
  token comes with a rotating refresh token bound to the operator's platform
  session. Before, every restart or update of the appliance forgot the
  client's registration and the client looped on the authorization page
  ("invalid client or redirect_uri") in the browser.

## [0.9.22] - 2026-09-09

### Changed

- The tools only Enterprise serves (`get_model`, `get_view`,
  `find_inconsistencies`, `apply_rule`, `generate_artifact`) are stand-ins on
  Community: same names, one argument, an answer that says what to use
  instead. Their real arguments live with the Enterprise overlay, as does the
  list of Enterprise constructs the open-source boundary test refuses.

### Removed

- The `paid` tier and the Canvas placeholder page: the editions are Community
  and Enterprise, nothing else.

## [0.9.21] - 2026-09-09

### Added

- Documents & Sources: a registered source must stay reachable by whoever
  reads the specification, through a web address anyone can open or through
  its content carried verbatim in the note. A row nobody else can open is
  reported when it is saved and by the completion gate (`source-unreachable`,
  `source-empty`), and the MCP playbooks state the rule.

### Fixed

- Behaviour dashboard: a checked state deletion started from `/behavior` on an
  appliance failed with "cross-origin request blocked". The dashboard calls the
  platform on its internal service name, and the CSRF guard refused that origin
  whenever `LYRIKS_TRUSTED_ORIGINS` named only the public one. The request's
  own origin is now always trusted beside the configured list.
- Shell: the user menu dropped from the initials opened behind the Control
  Center when the panel was open. The header now stands above side panels
  and below modal overlays.

## [0.9.20] - 2026-09-08

### Security

- Require explicit MCP client consent and issue opaque, revocable access tokens.
  Raw browser sessions are no longer accepted as MCP bearer credentials.
- Revoke local sessions after logout or a password change, including the MCP
  grants backed by those sessions and already-open collaboration sockets.
- Authorize collaboration rooms against their project and isolate the relay's
  room identifiers by project. Restrict the shared multi-user behavior editor
  to installation administrators.
- Reject unsafe login redirects and archives with inconsistent or excessive
  decompressed sizes. Update affected application dependencies.
- Scan the final platform, MCP and behavior images before publishing any of
  them. Preserve the scanned images and their build attestations for publication;
  retain complete reports, including vulnerabilities without an available fix.
- Exclude build dependencies and package managers from runtime images.

### Fixed

- Ship PostgreSQL 16 backup and restore clients to match the Compose database.
  The previous version 15 client refused to back up a version 16 server.
- Publish the scanned images: the publisher selects the tagged entry inside
  the OCI archive instead of failing on an archive that names several tags.

### Upgrade notes

- Upgrade the platform and MCP gateway together, then reconnect MCP clients
  and approve the new consent screen.
- The behavior image now uses the engine version selected by the tested
  workspace lockfile. Updating npm's latest version alone does not change a
  release rebuild.

### Changed

- The behaviour viewer's image is `lyriks-behavior-community`, renamed from
  `lyriks-dashboard-community`: "dashboard" named a shape, not the job, and the
  container is the one the platform serves at `/behavior`. An appliance rewrites
  the name on its next update; a compose install pulls the new repository as
  soon as it pulls this tree's version.

## [0.9.19] - 2026-09-05

### Security

- The operator login is enforced by the declared edition, like product
  activation: a Community install cannot be configured into open mode. Only a
  `vite dev` boot, or a build that declares no edition, keeps the flag.

## [0.9.18] - 2026-09-05

### Added

- The MCP gateway is part of this repository (`packages/mcp`) and is built
  here as `lyriks-mcp-community`, beside `lyriks-dashboard-community`
  (`docker/dashboard.Dockerfile`): a Community appliance now pulls three images
  this repository publishes, and nothing else. `pnpm dev:mcp` runs the gateway
  in development, `pnpm test:mcp` runs its suite and its own open-source
  boundary test.
- Control Center: the Coherence page reads as a diagnosis. Cards state the
  problem from the reader's side, the headline tiles filter the list, decisions
  are traced, and the score history shows where a project moved.
- Every project starts with one sentence: from scratch, or from a codebase,
  which lands on the kickoff prompt an agent follows through the MCP.
- A select with literal options projects as an enum state, typed alike
  everywhere it is written.

### Fixed

- A projected state definition is refreshed on save instead of frozen by its
  first projection; a leftover state seed is typed from its value, not declared
  a string.
- The writer gate and the realtime relay decide who may write on their own,
  without a companion service.

## [0.9.17] - 2026-09-04

### Fixed

- A viewer reads what it was granted, and nothing more; the realtime relay
  admits writers only, like the behaviour sync.

### Security

- fast-uri 3.1.6: four HIGH advisories in the pinned 3.1.5.

## [0.9.16] - 2026-09-03

First open-source tree of the Community edition.

### Added

- The specification workspace: foundation, users and permissions, features
  with full behaviour depth, journeys and screens with the Experience
  simulator, rules and edge cases, data, architecture, evidence and
  traceability, generated artifacts.
- Coherence, completion and readiness scores on the heuristic engine, with the
  Control Center listing every gap and where to fix it.
- Roadmap and delivery: releases, sprints, tickets whose acceptance criteria
  are the modelled scenarios, and the implementation index that keeps the
  specification and the code in step.
- The behaviour engine (unspaghettit) as an isolated subprocess, with the
  behaviour dashboard served behind the platform session.
- The MCP gateway proxy at `/mcp` with the five authoring skills.
- One operator account held by the platform, claimed at first run with a free
  Community key, verified offline.
- Product activation, update awareness, in-app feedback, and the shared search
  bar on every list that grew past reading.
