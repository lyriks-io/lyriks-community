---
name: lyriks-design
description: "Write a product's design system through the Lyriks MCP: what a coding agent reads with get_design_system to build the UI on-brand. Derive the identity from the product (never the default look, never the reflex dark+green), or extract it from the real product when one exists, and author it as the Experience brand sources (identity, colors, typography, spacing, markers, examples) the design system is read from. Load this before any patch_section on the experience `brand` sub-tree. Invoked by lyriks-build at the design step and by lyriks-retrospec for an existing product; usable standalone."
---

# /lyriks-design

The Experience capability no longer draws screens: there is no screen prototype,
no builder and no simulator. What it keeps of design is the **design system**: the
`brand` sub-tree of the experience section, which a coding agent reads through
`get_design_system` to build the product's UI and which Knowledge shows on its
Experience page. Your job is to make those sources precise, true to the
product and distinct.

The design system is only as good as its sources. An empty source leaves its part out
(nothing is invented for it), so a thin brand gives a thin design system. Read the
current one with `get_design_system`, in the app (Knowledge, Experience: Colors,
Typography, Corners and spacing, Shadows and breakpoints), or from
`get_section experience paths:["brand"]`.

## What to author, and where

All through `patch_section` on the `experience` section (merge or append by id;
`describe_section experience` gives every list's item shape):

| Source | Path | What a coding agent needs from it |
|---|---|---|
| Identity | `brand.identity` | name, baseline, mission, three tone adjectives, do say / don't say, visual personality |
| Colors | `brand.colors.tokens[]`, `brand.colors.semantic` | every token with a value AND a usage; the semantic map (background, surface, text, muted, border, success, warning, error, info) |
| Typography | `brand.typography.families`, `.roles[]`, `.scale[]`, `.weights[]` | real font stacks with fallbacks, one role per use (display, body, mono...), the size scale with line heights |
| Spacing and shape | `brand.foundation.space[]`, `.radius[]`, `.shadow[]`, `.breakpoints[]` | the actual steps, each with its usage |
| Design markers | `brand.markers` | corner style, density, shadow, border, motion, case, icon style, contrast, accent level |
| Logo | `brand.logo` | variants and the rules (clear space, allowed and forbidden backgrounds) |
| Examples | `brand.examples[]` | good versus bad, with the WHY: empty states, errors, primary actions, tables |
| Components, pages | `brand.components[]`, `brand.pages[]` | token mapping, variants, states, dos and don'ts per component; principles and density per page type |

Every token carries a `usage`. A value without its usage is a guess for the
agent that reads it.

## Rule 1: existing product, extract and never invent

When the product exists (retro-spec, adoption, rebuild), the identity is not
yours to design. Read it from the source: the CSS variables or theme file, the
tailwind config, the font imports, the logo files, the component library. Copy
values exactly (hex, px, font stacks) and name tokens the way the code names
them. A value you could not find stays empty and is reported, never filled with
a plausible one. Rule 2 does not apply.

## Rule 2: new product, a distinct identity derived from the product

Shipping a default look, or the same look twice, is a defect. Two failure modes
are banned by name:

- **The untouched default**: a stock purple accent on plain gray neutrals
  because nothing chose otherwise.
- **The AI-slop reflex**: dark background with a green, emerald or teal accent
  (any "dark dashboard with a neon accent") picked out of habit. Acceptable only
  when the product itself demands it (a terminal tool, a brand whose real
  identity is green on dark), with the reason written in `visualPersonality`.

Derive it from the foundation (audience, domain, tone), never from habit:

1. **Three brand adjectives** in `identity.toneAdjectives` ("clinical, calm,
   trustworthy"; "playful, loud, teen"; "dense, expert, industrial"). Every
   choice below traces back to one of them.
2. **Light or dark surfaces.** Light is the default for most products. Go dark
   only when real usage lives in the dark (developer tooling, media, monitoring
   walls, gaming, creative canvases). "Dashboards look better dark" is not a
   reason.
3. **Accent hue from the domain.** A known brand color wins. Otherwise: warm
   red or orange (food, hospitality), amber or bronze (craft), emerald
   (sustainability, agriculture), teal or cyan (health, science), blue (finance,
   B2B trust), indigo or violet (AI and developer platforms), fuchsia or pink
   (social, creators), slate with one sharp accent (legal, enterprise ops). Same
   hue family as the last product you themed: take the second-best fit.
4. **Tinted neutrals, never default gray.** Pull background, surface and border
   toward the accent's temperature and derive text and muted from the same
   family. Fill the whole semantic map and check the text on the accent still
   contrasts.
5. **Shape, type, motion and density carry identity too.** Serif reads
   editorial or premium, rounded reads consumer, mono reads developer or data,
   sans is a deliberate neutral. Sharp radii read technical, large radii read
   friendly; vary them per element type. Compact density for data-heavy ops,
   comfortable for content. Set every marker on purpose.

Self-check: *"Could this design system describe my last project, or a generic AI
mock?"* If yes, rederive. Positive check: *"Can I name the adjective each of
accent, font, radius and density traces back to?"*

## Rule 3: examples teach more than tokens

Write at least the examples a coding agent gets wrong by default: the empty
state, the error message, the one primary action per view, the dense table. Each
example says what to do, what not to do, and why, in the product's own words
(Glossary terms, never invented ones).

## Seeing is part of the job, and its absence is reportable

Through the MCP alone there is no render. When you extract from a running
product, say what you looked at (files, URLs, screenshots); when you could not
look, say so in your report and ask for a screenshot or the theme file. A
design system reported as faithful when nothing was compared is the one move this
skill exists to prevent.

## Done when

- Identity, colors (tokens and semantic), typography and markers are filled,
  every token with its usage.
- At least three examples, each with its why.
- The design system `get_design_system` answers, and the Experience page of
  Knowledge shows, reads as this product and no other, and your report lists
  any source you could not find.
