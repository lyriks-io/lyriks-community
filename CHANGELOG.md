# Changelog

All notable changes to Lyriks Community are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow the platform's semantic version.

## [Unreleased]

## [0.9.52] - 2026-11-27

An AI says on the person's pages what it waits on, a click wakes it, one box
per person is the way to validate everywhere, a Mismatch run's validated
changes are written by Lyriks itself, and a licence key can limit how many
projects are active.

### Added

- An AI working through the MCP that ends its turn on a question, or stops
  for any other reason, says so on the person's pages: the conversation
  opens in Ask my AI as Needs you (`update_evolution_session` with `ask` or
  `stopped`). The end-of-turn hook `sync_skills` installs for Claude Code
  holds a turn once until it has.
- A click in the app wakes the person's AI when none is in session: a small
  local program (`.lyriks/tools/wake-ai.mjs`, started once) launches the AI
  command line the person already uses (Claude Code, Codex, Gemini or
  Copilot) without a window, and the woken AI opens its session and answers
  the click. Nothing runs until the person starts it.
- What a specification leaves out reads on the Overview: an "N out of scope"
  link while a person has not approved it, a Scope drawer listing what is in
  and out by group with its reason, and Approve, which only a person can
  click. Once approved, the scope reads as a row of the Reverse-Specification
  History. Sign-offs are retired.
- A feature page reads its action journeys first, the loose actions in rows
  under them, and the AI suggests journeys unasked. An action's card shows
  its description on hover; dropping a card on another links the two
  actions, and each arrow says what kind of link it is.
- A licence key can state how many projects are active at once: the most
  recently saved ones are active, and when every place is taken a dialog
  asks which active project to set aside. A Community key keeps one project;
  an Enterprise key without the number keeps every project.
- One box per person is the validation control everywhere (Knowledge, the
  changes of a request, Mismatch, Ask my AI proposals): the reader's own box
  validates or withdraws after a confirmation, a colleague's pending box
  sends a reminder, and the cross refuses. A project names who validates it;
  a new project starts with its creator as the only validator, and a Team
  step follows its creation.
- Several jobs per person on a project, each job validating the topics its
  workspace chose; the lead can be changed at any time.
- A page the AI cites in an Ask my AI conversation is a link to that page.

### Changed

- A Mismatch run that holds its changes never writes in the specification:
  the AI lists each difference with what it would write, a person validates,
  and Lyriks writes the validated changes itself (Write the validated
  changes). A writing that stops at one change leaves it out and goes on
  with the others.
- A validated specification refuses what an AI client writes in it, in the
  sections and in the behaviour; a person's own edits and the change
  requests still go through.
- A validated step of a change request shows who stands behind each block,
  with nothing left to validate and no note from Lyriks.
- Mismatch says in words what is happening: no mismatch, the code matches,
  or what the counts expect.
- Pages no link led to are retired (Traceability, Generate, Kickoff, the
  behaviour editor inside the app); what they held moved to the pages that
  are reached.
- A baseline keeps a name, a moment and the Health score; the Versions
  panel and the frozen copies of the documents are gone.
- A project's Settings sit among its own pages; Members, Team,
  Notifications and Home read on white surfaces with one accent.
- The Build of a change request waits only on the proofs of its own
  features that a run on its commit can take again.
- The behaviour engine's own editor is no longer served by the application at
  `/behavior` and no longer runs with the stack. It is opened on demand from a
  terminal on the host (`docker compose --profile editor run --rm --no-deps
  --service-ports dashboard`, or `./lyriks editor` with the appliance kit), on
  the host's loopback only (`LYRIKS_UNSPA_DASHBOARD_PORT`, default 3003), and
  reached through an SSH tunnel: it has no login of its own. It writes feature
  files named by id, like the platform, and refuses state deletions, which are
  done in Lyriks. `LYRIKS_UNSPA_URL` and `PUBLIC_UNSPA_DASHBOARD_URL` are no
  longer used. Update with `docker compose --profile editor pull` so its image
  comes along.

### Fixed

- A change blocked because it came from another address names both
  addresses and says what to do, instead of a bare refusal.
- The appliance kit logs in to the images' registry before every pull, and
  says what a refusal needs.
- `./lyriks editor` leaves no editor running however it ends.
- A confirmation asked from a drawer opens on top of it.
- The project filter of Home fits the window and scrolls on its own.
- A session that ended elsewhere is sent to sign in, never told it is a
  viewer.

## [0.9.51] - 2026-11-23

Pages answer sooner and the first pages after an update no longer wait, an
AI writes a change request's text where the person reads it, and the
commands an AI runs stay signed in through a restart.

### Added

- Once a project's code is linked, a change request goes through a commit:
  the freeze into the Build waits for the deployment branch, by hand, on the
  last validation and under a waiver alike. An AI pre-fills the card Code on
  its branch with the branch it read from git, a person saves it or tells
  their AI to, and the card shows on Implementation before the freeze.
- A comment of a change request names a member with @: a list under the box
  offers the project's members, the writer aside, a click or Enter writes the
  name, and the member named is notified and reads it marked.
- The requirements of a change request mark what changed since their last
  validation: a line the validated version did not hold reads New with its
  author, a line dropped reads struck through as Removed, until the next
  validation.
- After a start, Lyriks reads ahead the first pages of the projects written
  last, the coherence analysis every project page reads, and what the app bar
  reads of every project, one reading at a time, and names in its log those
  that took long (`LYRIKS_WARM_UP=0` turns it off). The database pool keeps
  four connections open (`LYRIKS_PG_POOL_MIN`).

### Changed

- An AI writes the text of a step at its place, as a version the person
  validates or refuses, alone or in a team; a comment is plain words and never
  carries a text to accept.
- Rewording a suggestion and asking members to look at it (tag_reviewers) are
  retired: name the member with @ in a comment instead.
- Changing a password asks for the new one twice, and the sign-in and
  settings forms carry the fields browsers' password managers read.
- A click in a change request no longer rebuilds the whole-project evidence
  behind Project health: the evidence follows only the sections it is read
  from.
- The pages of the Specification 360° read the latest baseline once per
  change of the baselines instead of the whole document on every page, copy
  what they read from storage faster, and list a project's behaviour folder
  once per moment.
- The team reads (the people a discussion can notify, the validation team,
  the project's roles) ask the account service their independent questions
  together.
- `assess_behavior_feature` lists a feature's implementation gaps from the
  last report or index sync; on a server it always listed none.
- A write to the behaviour of a large project no longer holds the server for
  a second or more while Lyriks links the data model's fields by itself.

### Fixed

- The waiting command of a live session waits through a restart of Lyriks:
  it opens its connection again and waits on for up to ten minutes, and its
  ticket still signs in after a restart of the MCP gateway. A refused
  sign-in still ends it at once.
- The sync command of an index keeps its sign-in through a restart of the
  MCP gateway, as narrow as before.
- A statement that found no database connection in time, in the burst of
  the first pages after a start, is tried once more instead of failing the
  page.
- In the Build, Reject shows only on a feature the request drafts.
- A change whose draft removes a state lands whole.
- Typing @ and a few letters in a functional requirement of a change request
  offers the product's features, screens, rules and glossary terms to cite
  again; the one picked reads as a link.
- A feature the behaviour engine could not finish checking in its time now
  counts among the features not checked yet and is checked again on the next
  pass, instead of reading as clean until it changed.

## [0.9.50] - 2026-11-22

Several AIs work on one project at once, the next Reverse-Specification runs
from Mismatch with your AI, and a change request reaches its landing with
fewer gestures.

### Added

- Several AIs of one person stay connected to the same project at once:
  opening a session no longer ends another. A click goes to the AI already
  holding what it touches, else to the free AI opened most recently, else it
  waits; an AI that leaves hands its untreated clicks back. Ask my AI lists
  each AI in session with its state, what it does and its own End, and an AI
  can read its person's other sessions and ask one of them a question.
- Mismatch offers the next Reverse-Specification at its head: Full, Delta or
  Resume analysis, the default following one rule (no specification: Full; a
  run closed before its final check: Resume; otherwise Delta). Run it with my
  AI hands the run to the AI in session, or copies its prompt without one.
  While it runs, a preview replaces the waiting card, with Resume it with my
  AI when the run pauses.
- An element of the specification can be disabled: it stays readable, says
  who disabled it and why, and no reading takes it into account. Each action
  shows a closed line of its scenarios, N scenarios and how many are proven
  against the code.
- Sign-up asks the password twice and lets the browser offer one.
- For AI clients, the index sync finds which feature and unit hold index
  keys, moves located lines without replacing any report, guards every write
  on the index revision, and hands out a sync command that signs in by itself.
- Change requests (Enterprise): a landed request validates in Knowledge what
  its code proved; the Simulation lists what a request touches without a
  validation and asks for it; when a request lands, every open request that
  shares a feature or a table with it is told and read again, overlapping
  requests land in the order set at their freeze, and declaring one live
  before its turn asks for a reason.

### Changed

- Withdrawing one's own validation in Knowledge takes a click and a
  confirmation instead of resting the pointer on the check, and a refused
  withdrawal says why.
- The control that validates a whole section reads Validate the whole
  section wherever a section is validated at once; Validate all stays on a
  step's foot and on the Mismatch report.
- On Community, a locked capability reads as an offer with a View plans link,
  and Ask my AI is reachable: the MCP keeps the session tools.
- The roadmap is gone: a feature's delivery status comes from its code
  coverage, and the release tiers are removed.
- Change requests (Enterprise): before the Impact analysis only the Need and
  the description of the Solution are owed, and a request whose texts are
  written enters it on its own; the build waits for the Specification alone;
  the freeze follows the last validation of a person, and a settled build
  enters Approval on its own; a frozen version is corrected in the Build
  without going back to Specify.
- Pages answer faster: a tab out of sight waits and refreshes once it shows
  again, the journeys diagram shows each change at once and saves it behind,
  and an AI waiting in session no longer rewrites the change requests every
  30 seconds.
- Dependencies: the collaboration relay runs from @y/websocket-server
  (y-websocket 3), mermaid 12 keeps the dagre layout and ships without ELK,
  the Anthropic SDK 1.12 uses the connected key as its only credential,
  unspaghettit 0.30.0.

### Fixed

- An installation behind a proxy that runs in a container works, and says
  so; a refused install with --with-proxy puts LYRIKS_WITH_PROXY back.
- Validation stamps read the reader first, then who is awaited, then who
  validated, and a fourth person shows as initials instead of +1.
- The Home card of a stopped Reverse-Specification copies its resume prompt
  before opening it.
- A section check names one element in the singular correctly (1
  technology).
- Change requests (Enterprise): the criteria a request brings are read as its
  own and hold its Build until proven, and a draft whose criteria live in its
  behaviour model is no longer reported as having none.

### Security

- Runtime packages with published advisories are raised to their first
  patched version, as floors rather than exact pins so later fixes are
  picked up: hono 4.13.19, @hono/node-server 2.1.9, fast-uri 3.1.9,
  ip-address 10.7.6, qs 6.17.1, protobufjs 7.6.6 in the MCP gateway; SvelteKit
  2.70.4, cookie 0.7.2 and source-map-js 1.2.2 in the app.

## [0.9.49] - 2026-11-19

The Changes board no longer waits on the behaviour engine.

### Fixed

- Moving an entity, a resource or a persona into the project library now
  checks, in the behaviour engine too, that the feature it comes from belongs
  to the project: the platform runs engine 0.27.2, which refuses a move that
  would take a definition from another project's feature.
- The Changes board reads the requests alone: it no longer computes the
  readings of every request nor walks any draft in the behaviour engine, and
  the page receives what it shows (16 KB instead of 1.66 MB on a project with
  five requests). A request's page computes its own readings only.
- A draft's walk is kept per base feature, model and engine version, and
  survives a restart: a write to another feature, a comment or an answer no
  longer sends every draft back to the engine.

## [0.9.48] - 2026-11-19

Changes no longer recomputes every draft on each load.

### Fixed

- The Changes board, a request's graph and a draft feature's behaviour no
  longer replay every draft in the behaviour engine on each load: the walk of
  a draft is computed once per model and project state, and readers asking
  for the same draft at the same time share one computation. A project with
  six drafts took seven to nine seconds to open Changes; it now answers from
  memory after the first load. Nothing else changes in what the board shows.

## [0.9.47] - 2026-11-18

The key in force decides what an installation opens, and an install pulled
with docker login alone says so.

### Changed

- On the Enterprise images, the key in force decides what opens: a Community
  key opens Community (one user, one active project, every project still
  listed) and an Enterprise key opens Enterprise. The Community images open
  Community whatever key they hold. A Community key is no longer refused on
  the Enterprise images, so the end of a time-limited Enterprise key falls
  back to Community instead of walling the installation. No setting has to
  change.
- The activation page, the Plans dialog and the documentation say what a key
  changes on each kind of installation.

### Fixed

- The installer records exported registry credentials
  (LYRIKS_REGISTRY_USERNAME and LYRIKS_REGISTRY_PASSWORD) in .env, and warns
  after the pull when the images came through docker login alone, naming the
  two lines to add: without them Settings, Versions could never reach the
  registry.

## [0.9.46] - 2026-11-17

An installation is told about a new version, can check on demand, and says
how to update.

### Added

- Settings, Versions groups everything about updates in one band: Check now
  asks the registry at once, Last checked gives the date and time to the
  second, and How to update opens a guide with the steps, the command to
  copy, the way back and the offline update. The update notice links to the
  same guide.
- With the automatic check off, Check now asks once after a confirmation
  that says what leaves the installation; the check stays off and the
  confirmed check is written to the audit trail.
- When no version can be offered, Versions says why: the check is off, the
  running release has no name to compare, the registry did not answer (with
  the pull credentials it needs), or it holds no release of this kind.

### Fixed

- A Community appliance compared itself with the image of the other edition
  and read Up to date forever: the check now reads the image the
  installation runs.

## [0.9.45] - 2026-11-17

What a new user reads now says what the product does, and a sign-off keeps
who gave it.

### Fixed

- An approval keeps who set its status and when: the card reads <Status> by
  <name> after a reload, and saving the worklist again no longer erases it.
- On the Reverse page, a live update during an analysis never interrupts a
  page being opened.
- The Documentation says a licence key grants an edition, Community or
  Enterprise, and that switching plan also takes a change of the
  installation's configuration; it describes the band's Validate all section
  for the page on screen.
- No text promises a design.md file any more: the playbooks, the MCP and the
  Experience help name the design system an AI client reads with
  `get_design_system`.

## [0.9.44] - 2026-11-17

Health says where each problem lies and keeps the fixes to confirm apart,
Knowledge validates a whole page from its band, and the guards of validation,
Evolution and projects hold on every door.

### Added

- Each point Lyriks noticed says where the problem lies: in the product, in
  the specification or in Lyriks's records. A point fixed but not confirmed
  yet reads Fix to confirm, apart from the others, with Confirm the fix and
  Reopen, and the points are listed by what they cost.

### Changed

- The band at the top of Knowledge offers one Validate all section, counted
  on what the page on screen shows: a view of Technology & data, one profile,
  Who can do what, or a whole tab. It is offered to every reviewer the page
  waits on, editing rights or not. The check with a count in the head of
  Features, which repeated it, and the band's count of the whole
  specification are gone.
- The help, the dialogs and the public texts say what the product does today.
- Mismatch names the step that writes what is validated, and accepting a code
  change says what it really does.
- Refusing to delete a core feature that still holds features says what can
  be done instead.
- The roadmap is reached from Changes, and Why it exists starts in the Edit
  mode.
- Entering a licence key says truthfully what it changes; removing the stored
  key asks first and keeps the previous one.
- MCP: `flag_conflict` takes the two sides of a disagreement, and
  `finalize_analysis` says what it checks.

### Fixed

- The guards of Knowledge's validation also hold on the door a run validates
  through.
- An Evolution request keeps its lifecycle guards on every door, and accepting
  a Briefing suggestion respects the freeze.
- Saving a section never writes the generated documents.
- Each security question keeps its own answered mark.
- Tying a data field to the behavior records who really did it.
- Sign-offs read honestly and baselines cannot be changed once captured.
- Writing the users as a whole keeps a profile another part still names.
- Importing a project is refused to a viewer, as creating one is.
- A disagreement's two sides reach the engine as the claims it reads.
- Both Claude Code hooks recognise a Lyriks server by the same rule.
- The kit's preflight checks every port the stack publishes.

### Removed

- The six API routes and the MCP tools of the retired screen prototype.

## [0.9.43] - 2026-11-17

The Community edition gets its own scope and the four plans of lyriks.io, a
feature's actions read as journeys, and an Evolution waits for one validation
only: the Solution's, before the build.

### Added

- Community holds one active project. The others stay readable as inactive,
  any of them can be made the active one, and every paid plan opens them all
  again. Creating, importing or duplicating past that limit is refused with the
  plan that opens it.
- The account menu's Plans dialog lists the four offers of lyriks.io/pricing:
  Community Edition, Solo Builder, Team and Enterprise. What Community does not
  include reads locked, naming the plan that opens it, and Switch to <plan>
  leads to the activation page.
- On Community the MCP gateway offers only the tools the edition answers: the
  Evolution and roadmap tools are not listed.
- A feature's actions can be arranged in journeys and read as a flowchart; an
  action opened from it reads its rules and the data it touches.
- Each project's menu offers Duplicate and Export (.zip).
- Ask my AI is a private chat per person.
- Health says a formal proof is in progress and shows its verdict in place.
- The window says Saving until every change is confirmed or refused.
- Settings, Proofs (Enterprise): the solver is off on a new installation and an
  administrator turns it on there, without a restart. The section reads the
  machine's processors and memory and suggests a larger machine below 8
  processors or 16 GB.

### Changed

- Validating an Evolution is optional until the build: the Specification can be
  written and read before anyone validated it, and the freeze waits for the
  Solution's validation only.
- A click on someone's initials asks first, before validating or sending a
  reminder; your own initials read YOU and come first.
- Product and technical rules read as separate framed blocks, folded until
  opened.
- The TRL readout and the Readiness score are retired in favour of the
  maturity stages.
- The live session's waiting command signs in by itself.

### Fixed

- Validate all on Mismatch validates any number of changes in one save.
- A change saved under a revision that moved meanwhile is retried, then
  reported, never lost in silence.
- The engine recomputes its readings when the model moves instead of on a
  short timer, and orphaned engine and solver processes are reaped.
- Navigation no longer reruns the whole application frame on every click.
- A request the proxy sends on a connection the server had just closed no
  longer fails with a 502.
- Sign-ins survive a temporary outage of the account service.
- A later Reverse-Specification reads the project with a tool that exists.

## [0.9.42] - 2026-11-10

A later Reverse-Specification writes nothing before a person validates it, and
Mismatch is where that is decided.

### Added

- A first configuration right after the password, asking for every way out of
  the installation, and an update check that reads dated releases.
- Mismatch launches the next analysis, a delta or the whole product according
  to what can be read.
- An administrator reads the history of every action taken on Mismatch and by
  the runs it reports. A decision taken back and a run cancelled stay in it.
- Evolutions picked from the list read their concurrent impact in one report.

### Changed

- A later run holds what it finds. Each difference is decided on Mismatch beside
  what the specification reads today: validated, it is written by the person's
  AI; reverted, the code goes back; rejected, the person says what must change
  and the AI reworks it.
- The list of what a later run changed is read place by place, each rule under
  the action it belongs to.
- A run can be relaunched once its analysis is over. One not validated closes
  and stays in the history.
- A feature's page lists its actions with their rules inline.
- Health is one page, and Home reads 20 cards, then the older ones on scroll.
- The engine no longer holds a solver: proving is a module of its own, in
  Enterprise only.

### Fixed

- The marks of a hand edit and the Code drift band read the hand edits again.
- A product never rebuilt reads no Reverse-Specification, and a check with
  nothing to check is not passed.
- A model too large for the engine budget stops holding it, and project pages
  carry less.

## [0.9.41] - 2026-11-09

A new look for the whole app, a Specification 360 read and validated in place,
and a Reverse-Specification page that keeps every run.

### Changed

- The interface is redesigned: a flat navigation, a Home that lists what needs
  you and then a journal by day, a top bar chip that only reports what your AI
  is doing, and a new visual style (paper and ink, square corners, IBM Plex).
- The Specification 360 replaces the old Foundation and Features tabs. Every
  page of the spec (overview, features, data, users and permissions,
  architecture) reads in plain words, shows the sources it rests on, and can be
  edited, discussed and validated in place. A discussion opens at the foot of
  the block it is about.
- One Project health counts every point Lyriks noticed, the same on the
  Overview, the notices and the Reverse page. The Control Center is gone; the
  points are listed in What Lyriks noticed, one folded line per type.
- A permission is access or no access, set per action.
- An Evolution request has a key like a ticket number, is filled question by
  question, carries its changes as drafts until the freeze, and follows the
  code from its branch to its merge.
- Old project addresses redirect to the page that holds them now.

### Added

- Reverse-Specification of an existing product: one page with every run, a
  later run that reads what changed or the whole product and erases nothing, a
  run that can be cancelled, and a run whose AI went quiet reads as paused.
- Ask my AI on every page hands the page's question to the reader's own AI
  session; one session covers the whole project, and a link to a conversation
  lands on its message.
- The bell reads as a feed, and a toast says what just happened.
- Rules read as EARS requirements and scenarios as Given/When/Then; everything
  Lyriks writes about a spec follows the one language its project declares.
- The data map says what each field accepts, how tables relate and what a
  deletion does; the data model's rules reach the behavior engine.
- Enterprise: rules and data rules are proved by the engine's native Z3 solver.
- An admin sets each member's job in Settings > Members, and a new product can
  start without AI.
- Agent playbooks are installed from the server by a shipped script, and a
  routine sync sends only what changed.
- Engine 0.26.0: an action says which channels it is reachable through, a
  feature can be simulated step by step without saving, and the engine proves
  what the examples cannot reach.

### Fixed

- The server no longer stops when the infrastructure page is rendered on the
  server.
- A large project opens at once; its health is read in the background.
- Closing a dialog no longer breaks the app's tooltips.
- The installer no longer warns that a licence key needs credentials when the
  first visitor's claim activates the product, and never prints the key whole.
- `./lyriks doctor --http-port <port>` checks the port the install will use.

### Security

- `.env`, which holds every secret of the appliance and the licence key, is
  readable by its owner only (mode 600), on a new install and after an update.
- An install no longer leaves the template address `admin@example.com` in the
  administrator allowlist: the licence holder who claims it administers it.
- Dependencies move past every fixable critical and high advisory: dompurify
  3.4.17, @modelcontextprotocol/sdk 1.32.2, zod 4.6.7 and body-parser 2.4.0.

## [0.9.40] - 2026-10-12

Cursor can connect to a Lyriks install that requires sign-in.

### Fixed

- Clicking Allow access on the MCP consent page did nothing in Cursor: the
  browser reported that sending the form violated the page's Content Security
  Policy. The page allowed the form to reach only Lyriks and the client's
  callback origin, browsers apply that rule to every redirect after the click,
  and Cursor's callback on www.cursor.com redirects to cursor.com. The rule is
  gone from the consent page; scripts stay off, every value is escaped and the
  page cannot be framed.

### Security

- Dependencies move past fixable high-severity advisories:
  @modelcontextprotocol/sdk 1.31.0, fast-uri 3.1.7, proxy-addr 2.0.8 and
  devalue 5.9.3.

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
