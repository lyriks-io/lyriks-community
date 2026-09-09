# Lyriks — Design System

Reverse-engineered from the Step 01 mockup, codified as **Tailwind v4 design tokens** in
[`src/app.css`](src/app.css) and a small set of headless-ish **primitives** in
[`src/lib/ui/design-system/`](src/lib/ui/design-system/).

> **One rule:** components compose **tokens only** (`bg-surface`, `text-ink-900`, `rounded-card`,
> `shadow-card`…). No raw hex in components. Re-theming = editing `@theme` in `app.css`, nothing else.

---

## 1. Visual anatomy of the screen

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOP BAR — full width, brand gradient, h-14                            │  ← chrome
├───────────────┬────────────────────────────────────────────────────-─┤
│  SIDEBAR      │  MAIN (canvas, scrolls)                                │
│  dark rail    │   eyebrow · H1 · subtitle                              │
│  w-64         │   ┌── SectionCard (surface, rounded-card, shadow) ──┐  │
│               │   │  field label · control                          │  │
│  · project    │   └─────────────────────────────────────────────────┘ │
│  · nav items  │   …more section cards…                                 │
│  · readiness  │                                                        │
│               ├────────────────────────────────────────────────────-─┤
│               │  BOTTOM BAR — surface, sticky: nav · coherence · save  │  ← chrome
└───────────────┴────────────────────────────────────────────────────-─┘
```

Three regions: **chrome** (top bar + sidebar + bottom bar) frames a single scrolling **canvas** of
stacked **section cards**. Step 01 has 6 content sections (see the feature spec).

---

## 2. Color tokens

All colors live under `@theme` and generate `bg-*`, `text-*`, `border-*` utilities.

### Brand — violet→pink (identity, primary actions, active state)
Aligned to the the v3 mockup palette (the Tailwind violet/pink family).
| Token | Hex | Used for |
|---|---|---|
| `brand-50…300` | `#f5f3ff`→`#c4b5fd` | chips, soft fills, focus ring |
| `brand-400` | `#a78bfa` | soft accents on dark |
| `brand-500` | `#7c3aed` | **the violet** — gradient start, primary solid |
| `brand-600` | `#6d28d9` | hover |
| `brand-700` | `#5b21b6` | pressed |
| `magenta-500` | `#ec4899` | **the pink** — gradient end |

`bg-brand-gradient` → the signature **`linear-gradient(135deg, #7C3AED 0% → #EC4899 100%)`**
(via `brand-500 → magenta-500`). Applied to the **top bar**, the **active sidebar item**, the
**avatar**, and the **primary button** (which also carries `shadow-brand`, the violet glow).
`gradient-warm` (amber→pink) and `glass` (dark blur panel) mirror the mockup's secondary utilities.

### Accent — blue (selection affordance)
The Form-Factor tiles select with **blue** (`#3b82f6`, mockup blue-500), deliberately distinct from
brand violet so "selected" never reads as "primary action". `accent-50` fill + `accent-400` border
+ `accent-500` dot/text.

### Surfaces
| Token | Hex | Role |
|---|---|---|
| `canvas` | `#f8fafc` | app background (mockup lightmode) |
| `surface` | `#ffffff` | cards, top of bottom bar |
| `surface-sunken` | `#f1f5f9` | inset/secondary fields |
| `sidebar` | `#0b0b14` | left rail (mockup ink-900) |
| `sidebar-soft` | `#16161f` | hovered rail item (mockup ink-800) |
| `sidebar-line` | `#1f1f2c` | rail dividers (mockup ink-700) |

Ink text and lines use the **slate** ramp (`ink-900 #0f172a` … `ink-400 #94a3b8`,
`line #e2e8f0`), matching the mockup's lightmode content colors.

### Ink (text) — a 4-step ramp + 2 on-dark
`ink-900` headings · `ink-700` body · `ink-500` muted · `ink-400` labels/hints ·
`ink-on-dark` / `ink-on-dark-muted` for the sidebar.

### Lines
`line` (`#e9e9ee`) default borders · `line-strong` (`#d7d7df`) emphasized / hovered.

### Semantic (status) — each ships a `-500` ink and a `-50` soft background
| Token | Meaning in the UI |
|---|---|
| `success-500` / `success-50` | "Auto-saved", success criteria, readiness "Strong" |
| `warning-500` / `warning-50` | coherence "At risk", project label accent |
| `danger-500` / `danger-50` | failure criteria, coherence "Critical" |

**Score → color** mapping (coherence ring, readiness ring) is centralized in
[`scoreTone()`](src/lib/ui/design-system/tone.ts): `<34` danger · `34–66` warning · `≥67` success.

---

## 3. Typography

Font: **Inter** with a system fallback (`--font-sans`). Roles used across the screen:

| Role | Tailwind | Notes |
|---|---|---|
| Eyebrow (`STEP 01 · INITIALIZATION`) | `text-xs font-semibold uppercase tracking-[0.14em] text-brand-500` | |
| Page title (H1) | `text-3xl font-bold text-ink-900 tracking-tight` | |
| Subtitle | `text-sm text-ink-500` | |
| Field label | `text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400` | |
| Card value / section title | `text-lg font-semibold text-ink-900` | |
| Body | `text-sm text-ink-700` | |
| Help / hint | `text-xs text-ink-500` | |

---

## 4. Shape, elevation, spacing

- **Radii:** `rounded-field` (`0.625rem`) inputs & tiles · `rounded-card` (`1rem`) section cards ·
  `rounded-pill` chips/buttons-as-pills.
- **Elevation:** `shadow-card` (cards: hairline + soft ambient) · `shadow-pop` (menus/dialogs).
- **Focus:** every interactive element gets `shadow-focus` (3px `brand-200` halo) via a base rule —
  no per-component focus styling needed.
- **Spacing rhythm:** cards `p-6`→`p-7`, `gap-4` grids, `space-y-6` between section cards, content
  column maxed at `max-w-5xl`.

---

## 5. Primitives (`src/lib/ui/design-system/`)

Small, composable Svelte 5 components. Each is a thin, typed wrapper over tokens.

| Component | Purpose |
|---|---|
| `Button.svelte` | `variant: primary \| ghost \| outline \| danger`, `size`, gradient primary |
| `Card.svelte` | surface + `rounded-card` + `shadow-card` + border |
| `SectionCard.svelte` | `Card` with eyebrow icon, title, subtitle slot + content |
| `Field.svelte` | label + control wrapper + optional counter/error |
| `TextInput.svelte` / `Textarea.svelte` | tokenized inputs with char counters |
| `Select.svelte` | native select styled as the mockup dropdown |
| `Chip.svelte` | pill; `tone: brand \| neutral \| success \| warning \| danger` |
| `TagInput.svelte` | add/remove string tags (pain points, criteria) |
| `ToggleTile.svelte` | multi-select tile w/ accent-blue selected state (form factors, sizes) |
| `ScoreRing.svelte` | SVG ring for coherence / readiness, colored by `scoreTone()` |
| `Icon.svelte` | inline SVG set used by chrome + sections |

Primitives are **presentation only** — no data fetching, no domain logic. They receive props and
emit callbacks, keeping the dependency arrow pointing inward (UI → application → domain).

---

## 6. How to extend / re-theme

1. **New color or scale:** add a `--color-*` token in `@theme`. Utilities are generated instantly.
2. **New status:** add `--color-x-500` + `--color-x-50`, extend `Chip` tone + `scoreTone()`.
3. **Brand refresh:** change `brand-*` / `magenta-*` — the gradient, buttons, active nav, focus ring,
   and avatar all follow because they reference the tokens, not literals.
4. **New control:** build it from existing primitives/tokens; never reach for raw hex.
