---
name: lyriks-design
description: "Non-negotiable design discipline for authoring Lyriks Experience screens through the MCP — component-first composition, responsive-by-default layout, and a product-derived visual identity (every theme lever set from the product; never the default theme, never the reflex dark+green look). Load this before authoring builder.theme and before ANY build_screen / wire_element / patch_section on the experience builder, whether creating a new screen or updating an existing one. Invoked by lyriks-build at the scaffold and screen-building steps, and usable standalone when only touching design."
---

# /lyriks-design

The two design rules that every Experience-Builder edit MUST satisfy. They are
**not style preferences** — they are hard constraints. Apply them on a fresh
build AND on every update to an existing screen. If an edit would break either,
restructure until it doesn't.

## Rule 0, overriding all others: faithful transcription of an existing product

**If the product being specified already exists (a retro-spec, a code adoption, a
redesign brief, the transcription of a live app), the Experience MUST be a faithful
copy of what the end user actually experiences. NEVER, under any circumstance, ship
a design different from the one the real user lives in.** This rule OVERRIDES
Rule 3: "distinct identity" applies only to products that do not exist yet.

Before the first `build_screen`:

- **Read the real design source, not your taste.** Design-system docs
  (`DESIGN_SYSTEM.md`, `app.css` tokens, brand files), real screenshots and the
  actual UI routes/components are the authority. Extract the exact palette,
  surfaces, typography roles, radii and screen anatomy (top bar, rails, cards,
  bottom bars) and reproduce them in `builder.theme` plus group `appearance`.
- **The codebase is the source of truth; a running instance is comparison
  evidence only.** A live instance renders the chrome THROUGH whatever demo
  project happens to be loaded, so its screenshots mix two things: the
  product's chrome (authoritative, transcribe it) and the loaded project's
  DATA (not the product - never transcribe it). Project names, personas,
  cores, feature lists, counts, scores and verdicts seen in a screenshot
  belong to that demo project, not to the product being specced: model data
  from the specced product itself (or your own demo rows), and keep every
  score/verdict pair consistent with the product's real thresholds (a 72
  ring cannot read "At risk" when 67+ means "Strong").
- **Copy the real information architecture.** Screen names, nav items and their
  order, page titles, eyebrows, button labels, empty states, in the product's own
  language. Do not translate, rename, merge or "improve" pages the user knows.
- **Model the screens the user actually visits**, with their real entry screen and
  navigation paths, not an idealized flow. If the real product has a portfolio
  board, a dark rail and a gradient top bar, the prototype has them too.
- **When a renderer limit prevents an exact copy** (for example no gradient
  support), approximate as closely as possible with the dominant color and record
  the gap in the screen description; never substitute a different design language.

Self-check before moving on: *"Would the product's daily user recognize this screen
instantly as THEIR product?"* If not, stop and transcribe before building anything.
The `lyriks-retrospec` skill carries the full retro-spec procedure; this rule is
its design half.

## Rule 0.5, the build order: Russian-doll, top-down, content-complete at every pass

**Rebuilding or transcribing screens is NEVER done in random order.** Work like
nesting dolls, from the highest-level container to the lowest, and read the real
sources in that same order before building each level:

1. **Theme** (tokens, palette, radii, font) before any node: extracted from the
   real product per Rule 0, or derived from the product per Rule 3. Never left
   at defaults.
2. **Shared chrome components** (top bar, sidebar/rails, row templates) built
   once, before any screen that references them.
3. **Every screen's skeleton** (eyebrow, H1, subtitle, chrome references) plus
   the navigation between screens, so the whole surface is reachable early.
4. **Per page, its real tab set** (only if the real page is tabbed).
5. **Per tab, its real section cards**, in the real order.
6. **Per card, the fields and elements**, wired and validated.

Two hard clauses:

- **Content-complete first pass.** A level is only done when it carries its
  ESSENTIAL REAL CONTENT: the real labels, the real values, the real bindings.
  Never ship a structure-only pass with placeholder or missing content to "fill
  in later"; that is how invented interfaces and empty screens happen.
- **Finish the level before descending.** Do not build one page down to its
  fields while sibling pages have no skeleton; breadth first across a level,
  then descend one level everywhere.


### Path-depth-first for existing products (overrides breadth-first here)

When transcribing an EXISTING product, do not spread thin across every screen:
pick ONE user path (one journey, entry screen included), and take it as deep as
the front-end goes - exact chrome geometry (single-row bars that never wrap,
real button variants, real row styling on dark rails), real sub-tabs and
section cards, real states - before touching the next path. The screens of the
CURRENT path are the design base; a globally wide but visually wrong prototype
is a defect, a narrow but pixel-faithful path is progress. Verify each path
VISUALLY (render or screenshot the run) before declaring it done - a headless
flow check proves reachability, never design.

## Rule 1 — Component-first (a repeated/reusable cluster is a component)

**A single element is not a component. Two or more elements that form a reusable
unit ARE a component — build it once and reference it, never inline it twice.**

Before you call `build_screen` on a screen, list the clusters on it. A cluster is
a component (build via `build_screen` on a `components[]` id, reference via a group
`componentId`) when EITHER holds:

- **It repeats.** The same ≥2-element structure appears on 2+ screens (app sidebar,
  top bar, footer, a card, a list row, a stat tile, a form block, an empty-state).
  Author it **once**; reference it everywhere. Duplicating it inline is a defect.
- **It is a self-contained reusable unit of ≥2 elements**, even if used once today
  (a booking form, a filter bar, a media card). Make it a component so the next
  screen reuses it instead of re-inlining.

Consequences you must honor:

- **Screens are thin compositions.** A screen root should read as a handful of
  component references plus a little page-specific glue — not a wall of 15 inline
  elements. If a screen has more than ~6 inline leaf elements that aren't page-unique,
  you have missed components: extract them.
- **Build the component first, then the screens that use it.** `build_screen` on the
  component id materialises its tree once; each screen references it by `componentId`.
- **Navigation/actions inside a component count** for reachability and verification
  (a sidebar's links make their targets reachable) — so shared nav belongs in ONE
  component, not copied per screen.
- A row-template for a bound `list` is itself a component — build the row once and
  attach it via the list's `componentId`.

Self-check before moving on: *"Did I inline any ≥2-element structure that another
screen also needs, or that is a nameable reusable unit?"* If yes → extract it.

## Rule 2 — Responsive by default (reflows, never overflows)

**Every layout must reflow gracefully from a wide desktop down to a phone — on the
first build and on every later update.** Never ship a layout that overflows or
forces horizontal scroll on a narrow viewport.

- **Rows wrap.** The renderer force-wraps `direction:'row'` groups, but you still
  own the structure: a row of tiles/cards/actions must read fine stacked. Keep rows
  to a sane count of children and don't rely on a fixed side-by-side.
- **Cap reading width.** Forms, chat threads, plan/detail columns, modals → put them
  in a group with `maxWidth:'sm'|'md'|'lg'` (caps AND centres). Never let prose or a
  form stretch edge-to-edge on a wide page.
- **Relative, not fixed.** Prefer `appearance.width:'full'` and `maxWidth` over fixed
  pixel widths. Images are already fluid (`width:100%`); don't fight that.
- **App shell = a wrapping row of [sidebar component] + [main col].** On desktop they
  sit side by side; on a phone the main column wraps below. Structure it so that
  stacked order still makes sense (nav first, then content).
- **On UPDATES, preserve responsiveness.** When you `wire_element` or `patch_section`
  an existing screen, do not introduce a fixed-width or nowrap structure that breaks
  small screens. If the existing design was already non-responsive, improve it while
  you're there (wrap the row, add a `maxWidth` to the reading column).

Self-check before moving on: *"At ~375px wide, does every row stack readably, does
nothing overflow, and is every reading column width-capped?"* If not → restructure.

## Rule 3 — Distinct identity (no two products look the same)

**Every project gets its own visual identity, derived from the product and set
BEFORE the first `build_screen`. Shipping a default look, or the same look twice,
is a defect.** Two failure modes are banned by name:

- **The untouched default**: `builder.theme` left at the stock light-purple
  values (accent `#6d28d9` on plain gray neutrals) because nothing chose
  otherwise.
- **The AI-slop reflex**: dark background + green/emerald/teal accent (or any
  "dark dashboard with a neon accent" combo) picked out of habit instead of out
  of the product. This combo is acceptable ONLY when the product itself demands
  it (a terminal tool, a brand whose real identity is green-on-dark) and the
  reason is recorded with the theme rationale. If you cannot name a
  product-specific reason, the theme is wrong: rederive it below.

### Derive the theme from the product (mandatory, before any node)

Work from the project's foundation/identity (audience, domain, tone), never from
habit. Record the outcome as a one-sentence rationale in the experience section
(its description, next to the theme), then author `builder.theme` using EVERY
lever it offers:

1. **Three brand adjectives.** Write them down ("clinical, calm, trustworthy";
   "playful, loud, teen"; "dense, expert, industrial"). Every choice below must
   trace back to one of them.
2. **Light or dark surfaces.** Light is the default for most products (SaaS,
   commerce, health, admin, content). Go dark only when the product's real usage
   lives in the dark: developer/terminal tooling, media and streaming,
   monitoring walls, gaming, creative tools with a dark canvas. "Dashboards look
   better dark" is not a reason.
3. **Accent hue from the domain, not from the last build.** A product with a
   known brand color uses it (Rule 0 territory). Otherwise pick the hue family
   that encodes the domain: warm red/orange (food, hospitality), amber/bronze
   (craft, artisanal), emerald (sustainability, agriculture), teal/cyan
   (health, science), blue/azure (finance, B2B trust), indigo/violet (AI and
   developer platforms), fuchsia/pink (social, creator tools), slate plus one
   sharp accent (legal, enterprise ops). Then compare with the previous project
   you themed: same hue family twice in a row means take the second-best fit.
4. **Neutrals are tinted, never default gray.** Pull `bg`, `surface` and
   `border` toward the accent's temperature (warm accent, warm paper; cool
   accent, cool gray) and derive `ink`/`muted` from the same family. Set all
   SEVEN colors (`accent`, `onAccent`, `surface`, `bg`, `ink`, `muted`,
   `border`) explicitly, and check `onAccent` still contrasts on the accent.
5. **Shape, type, motion and density carry identity too; set every one.**
   - `font`: `serif` reads editorial/premium, `rounded` reads consumer/friendly,
     `mono` reads developer/data, `sans` is a deliberate neutral (choose it,
     never fall into it).
   - `radii` per type (`button`/`input`/`card`): sharp (`none`/`sm`) reads
     pro/technical, `lg`/`xl` reads friendly SaaS, `full` buttons read playful
     consumer. Vary the three (for example `xl` cards, `full` buttons, `md`
     inputs); one value everywhere is a tell.
   - `hover` per type: `lift`/`grow` feel tactile/consumer, `darken`/`lighten`
     feel dense/pro, `underline` fits editorial links.
   - `density`: `compact` for data-heavy ops, `cozy` for standard apps,
     `comfortable` for content and marketing.
6. **Presets are starting points, never the theme.** `builder.theme.preset`
   ("light"|"dark"|"midnight"|"paper"|"forest") fills the seven colors in one
   shot; ALWAYS override at least the accent and the neutral tint afterwards, or
   two preset-born products ship as twins.

### Push the identity into the screens

- **Group-level `appearance`** (background/color/radius/border on a whole
  group) makes a dark sidebar, a colored hero band or a tinted banner: set it in
  the build_screen spec or via `patch_section builder.nodes.<groupId>.appearance`.
- **Element `appearance` for hierarchy**: hero numbers (fontSize 24 to 32,
  fontWeight 800, accent color), pill badges (`variant:"pill"`), muted metadata
  (fontSize 12). A screen where every text renders at the same size has no
  design.
- **Row templates carry the identity too**: status pills and typography live in
  the row components, so lists look like the product, not like a generic table.

Self-check: *"Would a screenshot of this screen be mistaken for my last project,
or for a generic AI mock (dark canvas, glowing green buttons, same-size gray
text)?"* If yes, restyle before moving on. Positive check: *"Can I say which
brand adjective each of accent, font, radii and density traces back to?"*

### Existing product: Rule 3 does not apply

When the screens transcribe a product that already exists (retro-spec, clone,
rebuild), the identity is not yours to design, it is theirs to extract: Rule 0
overrides this rule entirely. Verify side by side (`verify_experience` frames
against the real screens) and fix any divergence in the same pass.

## Verify design, not just flows

After building, `simulate_experience` proves the flow; but also sanity-check the
design rules: no duplicated inline clusters (Rule 1) and no overflow when narrow
(Rule 2). The visual loop (`scripts/*-shots.mjs`, Playwright) renders real device
frames — read those PNGs to confirm reflow and that components render once.

## New design primitives (2026-07-21 — use them, they beat the fakes)
- **`el:"icon"`** — bundled lucide icon; the **label is the icon name** ("zap", "settings", "bar-chart-3"…). Size via `appearance.fontSize` (px), color via `appearance.color` or the group cascade. Catalog = `describe_section experience` → enums `icon names`; unknown names render a placeholder dot. Sidebars, list rows and stat tiles want these.
- **`el:"text"` + `variant:"pill"`** — real badge/chip (accent-tinted by default; `appearance.background/color` override). Stop faking pills with radius:999 padding stacks.
- **`el:"meter"`** — progress bar (label = value 0–100, interpolatable `"{usage.pct}"`); `variant:"ring"` = circular gauge; `appearance.color` = fill. Usage rings, success-rate bars, quota meters.
- **Group color cascade** — a group's `appearance.color` now recolors descendant headings/text/icons (it re-points the ink/muted vars). One patch styles a dark sidebar; per-element color overrides still win.
- **`builder.theme.preset`** — `"light" | "dark" | "midnight" | "paper" | "forest"` fills all seven theme colors at once (explicit colors still win). Dark products should start dark, then override accent and neutral tint per Rule 3 so no two preset-born products ship as twins.

## Newer primitives (2026-08-15): aside nav + clickable anything

- **`presentation:"sidebar"`** on a group renders an ASIDE NAVIGATION PANEL: same
  child-groups-are-panels contract as `tabs` (active index at `tabsKey`), but shown
  as a vertical menu (panel labels = menu items, active item accent-highlighted)
  beside the active panel. **Tabs where a real product would use an aside nav is a
  design smell**: settings areas, admin consoles, and multi-section detail pages get
  `presentation:"sidebar"`, not `presentation:"tabs"`. Drive it headlessly with a
  `simulate_experience` action carrying `tab:<N>`, same as tabs.
  Distinguish the two sidebar situations: cross-SCREEN navigation is still the app-shell
  component (a column of links with `nav:` targets, reused via `componentId`);
  `presentation:"sidebar"` is for the in-screen sectioned area those screens contain.
- **Clickable badges/tiles/icons are real.** ANY element with click behavior (a
  `nav:`/`on:` transition, a click scenario, or an action/event `bind:`) is a live
  click target in Run mode and gets the theme's hover affordance, so put the action
  directly ON the pill, icon or stat tile instead of adding a redundant button next
  to it. The design canvas marks every wired element with a small bolt chip, so an
  unwired "button-looking" element is visibly dead: wire it or demote it to text.
- **`presentation:"menu"`** on a group renders an ANCHORED DROPDOWN: same
  `visibleWhen` open/close contract as `overlay`, but no scrim, dropping below the
  group's slot, right-aligned by default (`appearance.align:"start"` opens
  rightward). Clicking outside, or picking an item, dismisses it automatically, so
  no authored close button is needed. The canonical header-right user menu is:
  an icon/avatar trigger with `on:[{toggle:"menu.open"}]`, immediately followed by
  `{presentation:"menu", visibleWhen:{path:"menu.open"}, children:[...]}` as the
  LAST child of the header-right cluster. A modal where a real product would use a
  dropdown (user menu, "..." row actions, filter popover) is a design smell.

## Rule 4 — Interactive by default (a screen with no state is a mockup)

**Every decision the screen presents must exist in run state, and every list that
represents choosable things must be actionable per row.** A screen that only
displays seeded rows is not a prototype — it is a picture, and the simulator will
never tell you the spec is missing.

- **Per-row actions live in the row template.** Author the row component once; any
  element inside it acts on the row it is rendered in. Use
  `on:[{trigger:"click", selectRecord:"<statePrefix>"}]` to publish the clicked
  record (readable anywhere as `{prefix.field}`, and `{prefix}` = the row id), and
  interpolate `{Field}` in a `setState` value or a label. A screen-level "Connect
  this app" button under a list is a defect — it cannot know which row you meant.
- **Per-row conditions.** A `visibleWhen`/`when` path naming a ROW FIELD is
  evaluated against that row: "Reconnect" only where `status = expired`,
  "Recommended" only on the featured tier, no "Choose" on the current plan.
- **Cards, not stacked table rows, when the rows are choices.** A bound list takes
  `rowLayout:"stack"|"grid"|"cards"` + `rowColumns:1-4`. Pricing tiers, app
  catalogs and tile dashboards are `cards`; they wrap responsively, so never
  hand-duplicate one card per record.
- **Real form controls.** `el:"select"` (with `options` or, better,
  `optionsFrom:{collection,field[,filterField,filterPath]}` for choices read live
  from the data — the dependent-picker case: "only the connections of the chosen
  app"), `el:"checkbox"` (boolean, so `truthy`/`falsy` guards read it),
  `el:"textarea"`. Inside a row template each row keeps its own value.
- **Wire the search box.** An unwired search input is a lie: bind it to a state
  path and set the list's `filterStatePath` to the same path.
- **A `call` that can only succeed is not a test.** If the data models a failure
  (an expired connection, a 401 in a run log), author the `outcome:"error"` branch
  and the state that blocks the next step.

Self-check: *"Can I prove, with `simulate_experience`, every choice this screen
offers — including a per-row one (`rowIndex:<N>`) and at least one negative path
(`expectError:true`)?"* If not, the screen is under-specified, not just under-built.
