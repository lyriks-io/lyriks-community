# Score vocabulary (MR 8)

One canonical name per metric, used across Portfolio, Sidebar, Control Center, docs,
API responses and MCP descriptions. Do not invent synonyms.

| Canonical name | Field | Meaning | 0–100? |
|---|---|---|---|
| **Coverage** | `ProjectCard.coverageScore` (`coverageScoreOf`) | Structural breadth — how filled the dimensions are (presence/completeness), maturity excluded | yes |
| **Behavior Maturity** | `ProjectCard.maturityScore` (`maturityScoreOf`) | The behavior-maturity dimension, read as a TRL (1 = idea … 9 = proven) | yes (TRL 1–9 underneath) |
| **Build Readiness** | `ProjectCard.readinessScore` (`analysis.readinessScore`) | Structural coverage and behavior maturity combined — the implementation gate | yes |
| **Coherence** | `ProjectCard.coherenceScore` (`coherenceScoreOf`) | Correctness — 100 minus the gain locked in unfixed incoherences | yes |

**Feature count** — the number of leaf features (`leafFeatures(...).length`,
`ProjectCard.featureCount` / `DomainWithProjects.featureTotal`). This is a **feature**
count and must be labelled "Features", never "Components". "Components" is reserved for
the Experience section's reusable UI blocks, which are a different thing.

## Applied

- `componentCount`/`componentTotal` → `featureCount`/`featureTotal`; portfolio labels
  "Components"/"N components" → "Features"/"N features".
- The home rollup tile "Avg production" → "Avg generation" → **removed**: the legacy
  Contract & Generation sections are gone, so `productionPct` / `avgProduction` no longer
  exist. The home rollup shows Active projects, Build Readiness, Coherence and Features.
- The Sidebar labels its composite score **Build Readiness** and opens the project
  **Control Center**. The Control Center and Project Health dashboard now expose Coverage,
  Coherence, Build Readiness and Behavior Maturity as distinct readings; only Behavior
  Maturity is converted to TRL.

## Separate acceptance-model work

The three acceptance concepts — requirement **acceptance criteria**, risk/edge **scenarios**,
executable **acceptance tests** — and which of them `verify_experience`, traceability and
generation consume, are specified in the shipped unspaghettit acceptance-criteria work
(feature-level `acceptanceCriteria`, engine 0.9.0+) and overlap MR 7.
Not part of this vocabulary pass.
