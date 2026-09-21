# Changelog

All notable changes to Lyriks Community are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow the platform's semantic version.

## [0.9.33] - 2026-09-21

The corrective lot, from a build made end to end through the tools.

### Added

- `patch_section` gains `append`: one new row at the end of a collection, with
  no selector at all. Adding a row used to mean knowing an id the section had
  not minted yet, or counting the existing rows to set an index.
- `get_evolution` serves the six origins a change request can carry, and the
  refusal that asks for one names them, so opening a request never means
  guessing an enumeration.
- `simulate_experience` answers who the run acted as, and says in words when a
  run as a role met no access gate at all, since such a run proves nothing
  about permissions.

### Changed

- An approval still `in_review` is a decision FILED: the completion gate counts
  it and reports the missing signature as debt instead of blocking, so nobody
  has to write `accepted_risk` on a human's behalf.
- Evolution is a derived section: its dossiers are written through their typed
  operations, so the completion gate no longer asks for a verdict on it, and
  `describe_section` answers for it like any other section.
- The rule inventory is a read-only mirror, so an empty one no longer zeroes a
  section whose contradictions and edge cases were authored; the message names
  the sections that fill it.
- Specify does not close while a proposal still awaits a signature: the
  maturity beside a dossier is inherited from the features it touches and never
  proves the change itself was specified. A named waiver still crosses.
- `import_data_collections` gives an existing collection the model fields it
  was missing, instead of skipping it in silence.
- Both batches accept `op` and `kind` as the same discriminator, a proposal
  takes a list of lines on a list field, and the answer fields lifted out of
  `raw` stop travelling twice.

- Evolution is read where it belongs: the board and every change request move
  into the Evolution tab of the Features capability, beside the feature tree a
  request changes, instead of a page of their own. The old address still
  resolves, carrying the request and the reading it named.

### Fixed

- A kernel write no longer shares one temporary file with whoever else writes
  the same feature: each write renames its own. A section save could answer
  that a row applied and lose it to another writer's rename.
- A declared `emittedEvents` really emits (engine 0.25.0): the cascade a model
  promises runs, and the batch says which declarations it wired.

## [0.9.32] - 2026-09-20

### Added

- Evolution: qualify a change to the product before anyone builds it. A change
  request opens as a dossier read in three steps (the idea, the proposals a
  person signs, the impact report), and the whole lifecycle is drivable from an
  AI client through `get_evolution` and `apply_evolution_batch`, under the same
  guards as the page: name the features the change touches, read the impact on
  two planes (what the specification holds and what the code anchors) under the
  three hypotheses of adding, changing and removing, read the coherence the
  engine computes, propose values a person accepts (an accepted value is written
  into the section that owns it, and the dossier keeps no copy), hand a proposal
  to named reviewers, cross a stage gate or waive it with a stated reason, freeze
  the specification as a numbered version, judge the implementation report the
  index derives under five verdicts, and close the request. A request plans
  without building: while it is being specified, no feature, entity, term, rule,
  screen or grant is created in the sections.
- The knowledge graph is the shared read model of a project: it holds what a
  feature promises, its edges no longer collide, a deep link opens the behaviour
  node it names, and deleting anything shows what rests on it first.
- A feature has one list of acceptance criteria, the model's. The rows written
  on the Features page and the criteria an AI client writes through the MCP were
  two lists that did not know each other; they are now one, which carries a
  title, Given/When/Then, an outcome, a status, relations and an index key, and
  the generated requirements document prints them.
- Evidence and traceability say apart what verifies a criterion and what is
  proven against the code, and actions the search did not reach are no longer
  counted as dead.
- The authoring skills ship with their helper scripts: an index sync and a batch
  apply, so a repository can send test results back into the implementation
  index and an agent can write a batch against the version it read.
- A conversation stays bound to its Lyriks project: `sync_skills` installs the
  binding, so every later request about that product goes through the model
  without anyone naming Lyriks again.
- AI clients stay signed in while they are used at least once every 30 days:
  each grant re-signs the session for thirty days, so a restart costs a silent
  refresh instead of a browser window, while a logout, a removed account or a
  withdrawn role still cuts the session on the next call.
- The MCP exposes what authoring actually needs: section writes that guard on
  the revision they read, a patch preview that validates without saving, the
  canonical permission capability registry, selective skill synchronisation,
  project elaboration, and modelled scenarios exported as fixtures a repository
  test can run against the code, whose results come back into the index.
- Typography takes any named role beside heading, body and mono, so a product's
  own type scale survives in the generated screens.
- The behaviour engine is `unspaghettit` 0.24.0, which is what makes a criterion
  carry its standing and its relations, and keeps what verifies a criterion with
  its status.
- First steps: the user menu links to the getting-started guide on
  get.lyriks.io, one entry before Documentation, opened in a new tab. The
  link carries this installation's address as a URL fragment, which stays in
  the browser, so the guide's shortcuts and its MCP address point back at
  this installation without the host ever seeing it.

### Changed

- Experience writes are per screen: one screen or component is built or rebuilt
  at a time, and the rest is edited in place. Replacing a whole Experience could
  not be verified change by change.
- A large MCP answer stays readable instead of being cut: it degrades to a shape
  with a hint naming the argument that narrows it, and an error stays short.
- Implementation coverage reads what a sync located, never an index the engine
  found on its own, so a percentage says what was actually proven.
- Reading an evolution request through the MCP gives the counts and the
  features it touches, not the rows behind them: the fields, the proposals and
  the readings are read one list at a time, narrowed to one touched feature
  with `leaf` and paged with `offset`/`limit`, like the impact and the report
  already were. A request touching seventeen features answered 59 KB, over the
  cap an AI client reads through, so the entry point to a real dossier came
  back as a stub and the client could not even tell which fields to fill.

### Removed

- Supervision and FinOps are retired. They governed AI members, policies and
  spending inside a workspace, which this product does not manage. The retirement
  covers the navigation, the capability help, the schemas, the section reads and
  writes, the gateway endpoints, the composition and repositories, the optional
  policy and budget adapter, the MCP registration and the build skill; hiding a
  menu entry alone would have left callable functionality behind. Baselines,
  approvals, specification generation, audit records and the work queue remain,
  and no historical data is purged.

### Fixed

- A leaf id another project already holds is refused when it is claimed. Two
  projects could name the same feature id, and the behaviour engine addresses a
  feature by its id across projects, so one project's model could answer for
  another's.
- A request to `/mcp` or its sign-in routes that carries `Expect: 100-continue`
  is served. It answered `502 mcp_unavailable` while the gateway was up: the
  header was forwarded to a `fetch` that refuses it. Windows PowerShell sets it
  on every POST, so a registration tried by hand from there looked like an
  outage.
- A malformed expression operand is refused before it is stored, and a domain
  payload is no longer read as an expression.
- A criterion gap stays a criterion gap instead of being reported as something
  else, and an interaction that was never rendered cannot be planned.
- Project discovery and multi-term operation references are paged, so a large
  portfolio answers in full instead of being cut.


## [0.9.30] - 2026-09-18

### Security

- Dependencies flagged by the advisory feeds are updated: `hono` 4.13.8 in the
  MCP gateway (`parseBody()` memory exhaustion on nested keys, query parsing
  after the URL fragment), `devalue` 5.9.2, and the build and test tooling
  (`vite`, `vitest`, `postcss`), which never ships in an image.
- Every published image is scanned, including its system packages, and an
  image carrying a fixable high or critical finding is not published. The
  images themselves carry none.

## [0.9.29] - 2026-09-17

### Fixed

- An `/api/*` request answers 503, not 401, while the account service cannot
  be reached. The guard runs before the route, so 0.9.27's own 503 never
  answered on a real install: the MCP gateway read the guard's 401 as a dead
  session and sent every client back to a browser window.

## [0.9.28] - 2026-09-17

### Security

- The images apply the Debian security updates published after their base
  image was built (libpcre2 and liblzma), which the base image does not carry
  yet.

## [0.9.27] - 2026-09-17

### Fixed

- AI clients stay signed in when Lyriks cannot check an account for a
  moment (a restart, an update, a slow account service). The MCP gateway
  used to read that as a signed-out user: every client process discarded
  its tokens and opened a browser window on the login page, two per incident
  with Claude Desktop, which runs one process for chat and one for Cowork
  and Code. The session check now answers 503 when it has no verdict; a tool
  call is retried, a renewal is kept, and the sign-in page asks to reload
  instead of logging in again. A renewal presented again within 30 seconds
  by another process of the same client is honoured too.
- `wire_element` is listed again in Claude clients: one of its fields
  serialized to a JSON Schema the Anthropic API refuses, which dropped the
  whole tool.

## [0.9.26] - 2026-09-11

### Fixed

- An AI client that checks a stale MCP registration before opening the
  browser (mcp-remote) is now sent on to the sign-in like a browser when its
  callback is on the user's computer, and signs in once under the id it
  holds. 0.9.25 answered `invalid_client` there, on which mcp-remote
  registered again but kept waiting on the sign-in it had already started,
  browser unopened, until its next restart. A callback elsewhere still gets
  the OAuth error.

## [0.9.25] - 2026-09-11

### Fixed

- An AI client whose MCP registration this install no longer recognises (one
  issued before 0.9.23, or under another secret) reconnects without anyone
  deleting its cache by hand. A client that checks its registration before
  opening the browser (mcp-remote) is told `invalid_client` in the OAuth
  format and registers again by itself; a browser sent by a client waiting on
  the user's own computer goes on to the sign-in and the consent like any
  other client, on a consent page that says the client is unregistered.
  Bouncing such a client back to its callback with an error, as 0.9.23 did,
  made it retry, one browser window per try.

### Added

- The appliance smoke test proves both recoveries: a stale registration is
  told `invalid_client` when the client asks for JSON, and still reaches the
  sign-in when a browser brings it with a callback on the user's computer.

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
