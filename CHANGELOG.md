# Changelog

All notable changes to Lyriks Community are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow the platform's semantic version.

## [Unreleased]

## [0.9.39] - 2026-09-25

Evolution becomes optional, and what agents reported from the field is fixed.

### Changed

- Evolution is optional. The binding block, the per-prompt hook and the skills
  sent every change to an existing product through an Evolution dossier, with no
  threshold, and a dossier for a two-line fix cost more than the fix. A change is
  now made directly: the spec first through the section tools, then the code,
  then the index sync. A dossier is opened when the person asks for one or wants
  a change qualified before it is decided. The module itself is unchanged.
- An implementation report judges the change, not the feature it lands in. The
  first freeze of a request records what the touched features already hold; a
  line on one of those elements is `inherited`, shown apart and marked on the
  page, and only the request's own lines hold the report open.
- The board answers the requests first; leaves and sources are counted there and
  read one list at a time (`part=leaves`, `part=sources`).

### Added

- An amendment can be a delta: criteria retired or reworded by id, and the
  description patched by an exact passage or appended to, each checked against
  the feature when the draft is made and applied at the freeze.
- `register_source` registers a documents register row inside the batch that
  cites it.
- A request is named by any unique prefix of four characters or more.
- Searching the knowledge graph for features also matches their criteria,
  actions and rules, and `matchedVia` names what matched.
- Helper scripts: `index-file.mjs upsert` and `remove` edit `.unspa.json`
  without reformatting it; the sync refuses to run when the index names another
  project than the binding block; `ingest-results.mjs` records a criterion's
  `verification.lastResult`; the hook says when the Lyriks MCP stopped answering;
  `sync_skills` sends a helper script only when it changed.

### Fixed

- The summary lines an AI client reads for an impact walk agree with the rows:
  a feature the change only reaches is to be read again, not edited, and an
  empty report says why.
- A proposal missing what was read or what was inferred is refused when it is
  proposed, not when someone tries to accept it; the summary groups the blocked
  proposals by their reason.
- An amendment and the feature it amends are one feature for the maturity: a
  value typed on the amendment counts as filled, and the gate into Verify no
  longer refuses a request whose every field is filled.
- Settings > Versions names the release the install runs (for example
  2026.09-62) beside the channel it follows, and Lyriks-back reports its real
  version instead of 0.4.1.
- Engine 0.25.2: a surface marked `partial` in the index resolves its states and
  invariants instead of reporting them all missing, and a behavior batch names
  every id it minted and every state it renamed.

## [0.9.38] - 2026-09-24

The dossier of an evolution request reads as one answer, and says where to act.

### Changed

- The impact report is one reading, not three hypotheses. It used to print three
  columns, "if we add it / change it / remove it", and leave the reader to pick,
  although the request already says what it does. On a request that both adds and
  amends, none of the three columns described it. Each row now carries the verb of
  the draft behind it, and a node the walk only reached carries what the request
  does overall.
- A row says what it rests on. The "knock-on" chip is gone; a row two links out
  now names the thing it depends on, for example rests on "Model the behavior".
- A row says the work to do instead of "re-check": walk it again, replay it, set
  who may, read it again, check the shape holds, write it, edit it, delete it. A
  removal still reads "may break", the one case that is a risk and not a task.
- A row of the impact report says what is true of it. A feature the change only
  reaches is never told to be written or deleted, the line under a row says in
  plain words what joined it to the change, a node reached from an amended
  feature reads as a change even when the request also adds something, and the
  sentence on top counts exactly the rows shown.
- A dossier reads once per feature. An amendment and the feature it stands for
  are one row, a draft is shown by its name, and a proposal on an existing value
  shows what it adds, what it removes and how many lines it keeps.
- Every place a person acts on is a link. The request, a field, a proposal, the
  next gate, a report line and a refused result carry the address of the page
  opening on that exact place, and an AI client hands it over as a link.

- A glossary flag warns and never blocks. It names the agreed term the word
  stands in for, a word between quotation marks is never flagged, and a person
  can keep the wording by saying which sense they meant, which is recorded
  beside the value. An AI client can take back a proposal nobody has decided.
- The dossier opens on what is owed: the questions to answer and the values to
  sign come first, answers already given are folded, and the maturity says how
  many of its answers were given in the request and how many the features
  already held.
- The impact report runs the walks the request asks for, and what it would cost
  to take the change back out is a separate reading, asked when wanted. A
  report that reached nothing says why.

### Fixed

- Ticking a feature on a dossier could take a draft out of its own request.

## [0.9.37] - 2026-09-24

### Fixed

- The engine moves with the platform. The platform runs the engine's own
  mcp-server, not only the behaviour dashboard does, so a fix shipped in the
  engine reached the dashboard and not the answers the platform itself gives. The
  dependency now moves with the release, which is how the corrected hint on an
  orphan index key actually arrives. Caught on the release candidate, where the
  new answer and the old hint came back in the same response.

## [0.9.36] - 2026-09-24

Eight things that made the tool argue with the person using it.

### Fixed

- A value signed by a person is the value the feature carries. It used to lose to
  the text typed on the draft, so two of four signed values reached nothing, with
  nothing on screen saying which of the two had been kept. A signed list of
  acceptance criteria now replaces the typed one instead of joining it, which is
  what put two wordings of the same criterion side by side.
- A value carried by a draft counts as filled. The maturity read only the owning
  section, so it reported four critical fields empty on a draft that held them,
  and asked a person to sign values that already existed.
- A reasoning is judged in any language. The separation of what was read from what
  was inferred was guessed by searching the text for the English words "read" and
  "infer", so a reasoning written in French said exactly that and was told it did
  not, which no rewording could fix. It is now two named fields, judged on being
  filled.
- An addition never crosses its own gates. A feature the product does not have yet
  has no neighbours, so the impact walk finds nothing, and that silence was read as
  "nothing follows": a drafted capability crossed both gates alone, froze a version
  and wrote itself into the tree with nobody deciding anything.
- A refused field path names the path it received and the paths it accepts, instead
  of pointing at another tool for a list the caller already holds.
- The dossier page shows every value whole. A criterion longer than 160 characters
  was displayed cut in mid-word, ending in three dots, because the page was served
  the excerpt a tool answer needs to stay one size.
- The freeze says, per written feature, how many of the draft's acceptance criteria
  that feature already carried word for word, and which therefore keep the
  identifier the feature gave them.
- Registering a source says which of the two registers is meant: the project's
  evidence register that proposals cite, or the engine's attachments an analysis
  read.

## [0.9.35] - 2026-09-23

A signature that survives, and two screens that say what they mean.

### Changed

- The Versions panel opens on the versions and folds the machine away. What
  runs is one sentence anyone can read, and a single gesture copies the whole
  panel, hardware included, for a bug report. The machine's figures used to be
  the first thing the page showed, to a reader who had come for a version
  number.

### Fixed

- A value signed on a draft feature now reaches the specification. It was
  written on a line whose key names a draft rather than an existing feature, so
  the next write of the features section pruned it, and the freeze read the
  draft object instead of the signed line. Signed values were lost with no
  alarm while the dossier went on counting the field as decided. The freeze also
  merges acceptance criteria now instead of replacing them, which had erased
  seven criteria of an existing feature.
- A lone option is a tick box, not a radio dot. A single choice drawn as a radio
  button cannot be unticked, so a reader who had turned it on had no way back.

## [0.9.34] - 2026-09-22

Who decides what leaves a score, and readings that disagreed with the screen.

### Added

- A coherence finding can be settled **by design**: the finding is correct and
  the choice was deliberate, so nothing is at risk. The only exits until now all
  asserted that something was wrong, and an author with a deliberate choice to
  record left the finding open instead, which is how a register fills with
  things already decided.
- A client can PREPARE a decision on a finding: it names the disposition and
  writes the reason, changes no score and takes nothing off the list. The person
  reads it on the finding itself and takes it in one click, or turns it down.
  Refusing a client the decision without offering it anything meant the same
  findings came back, unargued, the next session.
- The coherence section read carries the headline the panel prints: the score,
  the word beside it, how many findings block, how many are severe, and the five
  that weigh most on the number. A client that could not read it summarised the
  list on its own, against thresholds it had guessed, and contradicted the
  screen the person was looking at.
- A change request carries what it PROPOSES: a draft feature to add, an existing
  one in its amended form, or one marked for removal. The impact report, the
  coherence check and the readings all run with those drafts laid over the
  specification, so the impact walk starts from the change itself. Nothing
  reaches a section before the crossing into Verify.
- A journey reports how many actions it was authored with and whether it
  exercised any. One verified without executing a single interaction is named in
  the advisories instead of passing for a proof.

### Changed

- The coherence score weights a finding by WHO says so: one the author declared
  costs 40 percent of one the engine detected. Charged the same, the reading
  rewarded an empty register and taught every author to say nothing.
- The COHERENCE verdict follows what the list holds, not how long it is.
  "Critical" is kept for something blocking or of high severity; a register of
  low and medium findings with nothing severe is a queue of decisions.
- Deciding on a coherence finding is now refused to anything but a person at
  every way in, and reopening is refused the same way, because it supersedes a
  decision somebody took.
- The authoring skills say to read every headline the product shows before
  writing a number, to read their own work back before reporting on it, and to
  say so plainly when they cannot see a screen instead of letting it pass.

### Fixed

- A finding could be settled by an AI client and recorded, and signed, as a
  person's decision: the endpoint built its author without asking who was
  calling, and the whole section could be written with decisions inside it,
  author kind included. Both doors now read the caller from the request.
- A step lost the actions it had been authored with when the journeys were read
  back, and every later save wrote the loss down. The check that should have
  caught it reported a successful run on a journey that executed nothing.
- A permission row naming a capability that no longer exists no longer wedges
  the access matrix shut. A stored dead grant is dropped on the next save and
  named in the answer; one being introduced is still refused, with the canonical
  id suggested.
- A source citation resolves to the source on every surface, the Evolution
  dossier included, instead of printing a bare title or a raw id with nothing to
  click.

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
