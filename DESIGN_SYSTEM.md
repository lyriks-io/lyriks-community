# Lyriks: Design System

Paper and ink. A cream page, sand blocks, black ink, square corners, hard shadows that say what can
be pressed, and three brand hues. Taken from the "Repasse Lyriks" design (version 1793632397-b1a3,
2026-11-02), codified as **Tailwind v4 design tokens** in [`src/app.css`](src/app.css) and a small set
of **primitives and recipes** in [`src/lib/ui/design-system/`](src/lib/ui/design-system/).

> **One rule:** components compose **tokens only** (`bg-surface`, `text-ink-900`, `border-line`,
> `shadow-press`…). No raw hex in components. Re-theming = editing `@theme` in `app.css`, nothing else.

The design system is the look, not the layout: page structure, columns and positions live in the
pages and the shell, and change separately.

---

## 1. Principles

- **Paper, not white.** The page is paper (`#F7F4EC`); content sits in sand blocks (toner `#E5DECB`)
  that carry no shadow. There is no pure white or black: `white` resolves to paper (the page, and
  text on ink), `black` to ink.
- **Square.** Every radius token is 0. Only a true circle stays round (`rounded-full` on a spinner,
  a progress wheel, a radio button).
- **The shadow means "press me".** A hard ink shadow (`3px 3px 0`) marks a button; under the pointer
  it lifts a pixel, pressed it sinks into the place its shadow held. Labels, tags and blocks never
  wear a shadow. Menus and dialogs float on a 4px hard shadow.
- **Three brand hues, each with a meaning.** Blue = Product (and the action colour), violet =
  Coherence, orange = Business (and the launching action, counts). Green says validated, red an
  error or a major point, magenta a regression.
- **Mono for what is read as data.** Kickers, labels, tags, counts, codes and numbers use IBM Plex
  Mono, uppercase and spaced for labels; everything else is IBM Plex Sans.
- **No gradient.** What wore one wears a flat fill.

---

## 2. The palette

Defined once at the top of `@theme`; every role below resolves to these values.

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F7F4EC` | the page; text on ink |
| `toner` | `#E5DECB` | a block on the page |
| `toner-1` | `#EFEADC` | a field, a tile inside a block |
| `toner-2` | `#D6CDB4` | the empty part of a gauge, a chip on a block |
| `line` | `#C9C0A8` | rules between rows, borders |
| `ink` | `#111114` | text, the app bar, what is on |
| `ink-2` / `ink-3` / `ink-4` | `#3A3A40` / `#55555C` / `#8A8A92` | body / secondary / muted on ink |
| `night` | `#2A2A31` | rules and borders on ink |
| `blue` / `blue-ink` / `blue-tint` | `#0066FF` / `#0047B3` / `#D6E3F7` | Product, the action colour |
| `violet` / `violet-ink` / `violet-tint` | `#BB46F5` / `#8A1FC4` / `#EBDDF3` | Coherence, the LLM's voice |
| `orange` / `orange-ink` / `orange-tint` | `#FFA101` / `#8A5500` / `#F5E3BE` | Business, counts, minor points |
| `green` / `green-ink` / `green-tint` | `#1FA98A` / `#0F6650` / `#D3E8DC` | validated |
| `red` / `red-ink` / `red-tint` | `#E63946` / `#B3202C` / `#F3D5CF` | error, major point |
| `magenta` / `magenta-ink` | `#FA5FB2` / `#B3237A` | regression |
| `red-on-ink` / `blue-on-ink` | `#FF7A7F` / `#6EA4FF` | the colour as text on ink |

A hue is used three ways: the hue itself for marks, bars and borders; its `-ink` for text and filled
actions (AA on paper and toner); its `-tint` as a background.

---

## 3. Roles

The components were written against role tokens; each now resolves to the palette.

| Role tokens | Resolves to |
|---|---|
| `brand-50…700` | the blue ramp: `brand-400` = blue, **`brand-500` = blue-ink (the filled action, a link)** |
| `accent-*`, `info-*` | the same blue ramp (a selection, information) |
| `canvas` / `evo-page` | paper |
| `surface`, `surface-card` | toner (cards, lists, panels, menus) |
| `surface-sunken`, `evo-sunken` | toner-1 (a field, a tile inside a block) |
| `ink-900` / `700` / `500` | ink / ink-2 / ink-3; `ink-400` = `#5F5F66` (labels, AA on paper and toner) |
| `ink-200` / `ink-100` | toner-2 / toner-1 |
| `sidebar*`, `ink-on-dark*` | ink, night, paper, ink-4 |
| `success-*` / `warning-*` / `danger-*` | green / orange / red ramps (`-100` = tint, `-500` = hue, `-700`/`-600` = ink) |
| `evo-violet*` | the action blue (blue-ink fill, blue-tint chip, blue dashes for an AI proposal) |
| `evo-plum*` | violet (the LLM's editorial note) |
| `evo-line`, `evo-control` | line, ink-3 (field and secondary button borders) |
| `evo-track`, `evo-canvas`, `evo-canvas-dot` | toner-2, toner-1, toner-2 (gauges, the dotted diagram ground) |

`scoreTone()` in [`tone.ts`](src/lib/ui/design-system/tone.ts) still maps a score to danger,
warning or success.

---

## 4. Typography

IBM Plex only, vendored in `static/fonts` (400 to 700, Latin subsets, SIL OFL): `font-sans`,
`font-display` and `font-evo` are Plex Sans; `font-mono` and `font-evo-mono` are Plex Mono.

| Role | Look |
|---|---|
| Kicker, label (`SPECIFICATION 360°`) | Mono, 11 to 12px, uppercase, `tracking-[0.08em]`, ink-3 |
| Page title | Sans bold, tight (`tracking-[-0.03em]`), ink |
| Section title | Sans bold, `tracking-[-0.02em]`, ink |
| Body | Sans 14 to 15px, ink-2 |
| Button label | Sans bold 12px, uppercase, `tracking-[0.07em]` |
| Count, number, code | Mono bold |

---

## 5. Shape, elevation, focus

- **Radii:** every radius token (`field`, `card`, `pill`, `evo-card`, `evo-btn`, and Tailwind's
  `sm` to `4xl`) is 0.
- **Shadows:** `shadow-press` (3px, a button at rest), `shadow-lift` (4px, under the pointer),
  `shadow-pop` (4px, a menu or a dialog), `shadow-press-paper` (a button on ink),
  `shadow-offset-blue` / `shadow-offset-orange` (the signature offset box). `shadow-card` and
  Tailwind's `sm` and below are flat; `md` to `2xl` are hard ink shadows.
- **Pressable:** the `pressable` utility gives a control the press shadow, the lift on hover and
  the sink on press. A hand-drawn filled action (`bg-evo-violet`, `bg-brand-500` on a button or link)
  wears the press shadow by a component-layer rule in `app.css`.
- **Focus:** every interactive element shows a 2px blue-ink outline 3px off its edge.
- **Other utilities:** `pressable-paper` (the same press on ink, paper border and shadow), `quiet` (`.ly-quiet`: the
  light action beside a filled one, an uppercase word on a thick ink underline), `gauge-cells` (`.ly-gauge`: cuts a bar
  and its fill into 8px cells).

---

## 6. Primitives and recipes

| Where | What |
|---|---|
| `Button.svelte` | `.ly-btn`: square, 1.5px ink border, bold uppercase label, `pressable`. `primary` = blue-ink fill, `outline` = unfilled, `danger` = red-ink fill, `soft` = blue-tint, `ghost` = no border, no shadow |
| `Chip.svelte` | `.ly-tag`: square, 1.5px border in the tone's colour, no shadow |
| `Card.svelte`, `SectionCard.svelte` | a toner block on a line border, flat; the title is a mono label |
| `field.ts` | `.ly-input`: toner-1 fill, ink-3 border, blue on focus, square |
| `Logo.svelte`, `static/favicon.svg` | the mark: three flat bars (blue, violet, orange), each with a hard offset outline in the current text colour |
| `static/brand/lyriks-logo-on-ink.png`, `…-on-paper.png` | the full logo (mark and pixel wordmark), for ink and for paper |
| `spec360/page/look.ts` | the Specification 360° type and the design's components as class recipes: list block, `BTN` / `BTN_MAIN`, `LINK`, `META`, the `TAG_*` family, `SEV_*`, `BANNER`, `QUIET`, `CHIP`, `KV_*`, `POINT`, `AVATAR`, `MODULE`, `POP`, `DIALOG`, `COUNT`, `WAIT` |
| `evolution/evo-look.ts` | the Evolution card, the 44/48px buttons, the editors |

Primitives are **presentation only**: no data fetching, no domain logic.

**Not the design system:** the Experience builder, the simulator and the brand previews render the
*customer's* product with its own brand (`--sim-*` variables); they never take Lyriks tokens.

---

## 7. How to extend / re-theme

1. **New colour:** add it to the palette block, then point a role at it. Never use a hex in a component.
2. **New status:** add a `-50…700` ramp on a palette hue, extend `Chip` tones and `scoreTone()`.
3. **A new pressable control:** compose `pressable` with a 1.5px ink border; anything that is not
   pressed (a tag, a block, a label) stays flat.
4. **Brand refresh:** change the palette; every role, button, focus mark and the app bar follow.
