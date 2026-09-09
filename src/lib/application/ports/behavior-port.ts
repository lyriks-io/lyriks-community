import type { UnspaFeatureSnapshot, UnspaProjectSnapshot, UnspaTag } from '$lib/unspa-schema';

/**
 * The ONE boundary to the behavior kernel — the single canonical, content-id-keyed
 * Unspaghettit-format model the platform owns. Read side is a projection source
 * (whole project + one feature); write side is `apply(ops)`, the single path every
 * mutation funnels through (wizard UI, MCP, AI, and — eventually — DPO apply_rule
 * merges). This replaces the scattered `sync-*-to-unspaghettit` use-cases.
 *
 * MAP-critical: an adapter of this port MUST be able to read AND write with the
 * unspa engine and the DPO turned OFF (a pure local store). The engines are
 * optional analyzers layered over the kernel, never required to persist an edit.
 *
 * See docs/architecture/unify-unspa-kernel-phase-0-1.md.
 */
/**
 * Non-fatal outcome of an `apply` — currently the merge-loss warnings: engine-only
 * surfaces/actions a projection op dropped because no Lyriks structure produces
 * them (deletions propagate by design, but never silently).
 */
export interface BehaviorApplyReport {
	warnings: string[];
}

export interface BehaviorPort {
	/** Canonical project snapshot (featureIds + tags), or null if none yet. */
	readProject(projectId: string): Promise<UnspaProjectSnapshot | null>;
	/** One feature snapshot addressed by its content-id, or null if absent. */
	readFeature(projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null>;
	/** Fold a batch of ops into the kernel and persist atomically — the one write path. */
	apply(projectId: string, ops: BehaviorOp[]): Promise<BehaviorApplyReport>;
	/** Absolute store root, surfaced in the UI (cd + `unspa dashboard`). */
	workspaceRoot(): string;
}

/**
 * The closed write vocabulary. Phase 0 covers what the Features flip (Phase 1)
 * needs; later phases extend the union as their section flips. Keeping it a small
 * tagged union — not free-form snapshot writes — is what makes the single write
 * path auditable and lets any producer (UI/MCP/AI/DPO) speak the same language.
 */
export type BehaviorOp =
	/** Create or update a leaf feature shell (behavior facet), preserving anything a
	 *  later wizard step already authored (surfaces, createdAt, …). */
	| {
			kind: 'upsertFeatureShell';
			featureId: string;
			name: string;
			description: string;
			tags: UnspaTag[];
	  }
	/** Replace a feature's membership tags (core/family/mvp/phase). */
	| { kind: 'setFeatureTags'; featureId: string; tags: UnspaTag[] }
	/** Rename a feature (and optionally its description). */
	| { kind: 'renameFeature'; featureId: string; name: string; description?: string }
	/** Delist a feature from the project (the file is left in place, mirroring today). */
	| { kind: 'removeFeature'; featureId: string }
	/** Set the project's ordered leaf-id list. */
	| { kind: 'setProjectFeatureIds'; featureIds: string[] }
	/** Append an id to the project's feature list if absent (aux features: Data Model, Experience). */
	| { kind: 'ensureProjectFeatureId'; featureId: string }
	/** Replace the project-level tags. */
	| { kind: 'setProjectTags'; tags: UnspaTag[] }
	/** Patch the project's name/description. */
	| { kind: 'setProjectMeta'; name?: string; description?: string }
	/** Upsert the central "Data Model" aux feature — its behavior facet IS the entity
	 *  + resource set. Preserves anything else authored on it (surfaces,
	 *  featureInvariants, createdAt); replaces entities + resources. */
	| {
			kind: 'upsertDataModelFeature';
			featureId: string;
			name: string;
			description: string;
			tags: UnspaTag[];
			entities: Record<string, unknown>[];
			resources: Record<string, unknown>[];
	  }
	/** Mirror the entities/resources a leaf feature consumes onto its shell (the
	 *  Core-bridge enrichment). Patches an EXISTING feature only — never creates —
	 *  replacing its entities and merging resources by id. No-op if absent. */
	| {
			kind: 'mirrorFeatureData';
			featureId: string;
			entities: Record<string, unknown>[];
			resources: Record<string, unknown>[];
	  }
	/** Upsert the central "Experience" aux feature — its behavior facet IS the
	 *  journeys→workflow-surfaces + builder-screens graph. MERGES surfaces/personas
	 *  with what's on disk (preserving engine-authored depth: rules, invariants,
	 *  parameters, scenarios, state defs — the "detail a feature in unspa" facet),
	 *  and replaces the Lyriks-owned events. Surfaces the projection no longer
	 *  produces are dropped (Lyriks owns which journeys/screens exist). */
	| {
			kind: 'upsertExperienceFeature';
			featureId: string;
			name: string;
			description: string;
			tags: UnspaTag[];
			surfaces: Record<string, unknown>[];
			personas: Record<string, unknown>[];
			events: Record<string, unknown>[];
	  }
	/** Mirror the surfaces/personas/events of the journeys under a leaf's Core onto
	 *  that leaf's shell. Patches an EXISTING feature only — never creates — merging
	 *  surfaces/personas (preserving the leaf's Step-07 entities/resources and any
	 *  engine-authored depth) and replacing events. No-op if absent. */
	| {
			kind: 'mirrorFeatureBehavior';
			featureId: string;
			surfaces: Record<string, unknown>[];
			personas: Record<string, unknown>[];
			events: Record<string, unknown>[];
	  }
	/** Mirror the Lyriks-owned acceptance criteria (Step-06 edge cases → prose
	 *  Given/When/Then) onto a feature. Patches an EXISTING feature only — never
	 *  creates — merging `acceptanceCriteria` by id: the Lyriks-owned `ac-edge-*`
	 *  rows are replaced, any others (authored in the unspa dashboard) are kept.
	 *  No-op if the feature is absent. Needs unspaghettit ≥ 0.9.0 (the feature-level
	 *  `acceptanceCriteria` field); on older stores it just writes an ignored key. */
	| {
			kind: 'mirrorFeatureAcceptance';
			featureId: string;
			acceptanceCriteria: Record<string, unknown>[];
	  };
