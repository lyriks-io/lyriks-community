import { mintUuid } from '../shared';
import type { CoreTone } from './enums';
import type { ActionJourneys } from './action-journeys';

/* ── Entities — mirror of Unspaghettit feature 1e95b087 ─────────────── */

export interface Core {
	readonly id: string;
	name: string;
	description: string;
	tone: CoreTone;
}

export interface Family {
	readonly id: string;
	name: string;
	coreId: string;
	parentFamilyId: string | null;
	description: string;
}

/**
 * Leaf node. id == unspaghettitFeatureId by construction; the duplicate field
 * makes the binding first-class for downstream readers (Step 05+) and lets a
 * future schema version decouple if needed.
 */
export interface Feature {
	readonly id: string;
	name: string;
	coreId: string;
	parentFamilyId: string | null;
	description: string;
	readonly unspaghettitFeatureId: string;
}

/** One acceptance criterion on a leaf feature — plain text so authors can write
 *  a bullet or a Given/When/Then line, keyed by id for stable list editing. */
export interface AcceptanceCriterion {
	readonly id: string;
	text: string;
}

/**
 * Lyriks-owned authoring decoration for a single leaf feature, keyed by
 * feature id. Persists through the features RESIDUE blob (see
 * `features-projection.ts`) — NOT the unspa kernel schema — so it is additive
 * and optional: existing saved data with no `leafMeta` parses unchanged. Every
 * field is optional and empty strings are meaningful (an explicitly cleared
 * authoring note), so consumers must not coalesce `''` away.
 */
export interface LeafMeta {
	/** Manual maturity stage override, 1 Idea to 5 Complete. When unset, the
	    stage derives from the engine maturity score. */
	stage?: number;
	objective?: string;
	expectedEffect?: string;
	problem?: string;
	value?: string;
	code?: string;
	/** Testable acceptance criteria for this feature (requirements backbone). */
	acceptanceCriteria?: AcceptanceCriterion[];
	/** Ids of other leaf features this one depends on. */
	dependsOn?: string[];
	/** Stable ids from the project Documents & Sources register. */
	sourceIds?: string[];
	/** Legacy or free-form citation kept for backwards compatibility. */
	sourceLink?: string;
}

/**
 * The persisted content of Step 04. `features` is the LEAF SET — every entry
 * here is also an Unspaghettit Feature shell on disk (same id). Cores and
 * Families are organizational only.
 */
export interface ProjectFeaturesDraft {
	projectId: string;
	cores: Core[];
	families: Family[];
	features: Feature[];
	/** Per-leaf authoring decoration, keyed by feature id. Optional so
	 * pre-existing drafts parse unchanged; persisted via the features residue. */
	leafMeta?: Record<string, LeafMeta>;
	/** When each core feature and feature first entered the spec (criterion 2a6bff42). Kept by the save, never by an edit. */
	firstSeenAt?: Record<string, string>;
	/** The journeys each feature's actions are arranged in, keyed by feature id. Lyriks-owned residue: a person's are kept by every save. */
	actionJourneys?: ActionJourneys;
	lastSavedAt: string | null;
}

export function createEmptyFeaturesDraft(projectId: string): ProjectFeaturesDraft {
	return {
		projectId,
		cores: [],
		families: [],
		features: [],
		leafMeta: {},
		actionJourneys: {},
		lastSavedAt: null
	};
}

function newId(): string {
	return mintUuid();
}

export function createAcceptanceCriterion(text = ''): AcceptanceCriterion {
	return { id: newId(), text };
}

export function createCore(overrides: Partial<Core> = {}): Core {
	return { id: newId(), name: '', description: '', tone: 'custom', ...overrides };
}

export function createFamily(
	coreId: string,
	parentFamilyId: string | null,
	overrides: Partial<Family> = {}
): Family {
	return { id: newId(), name: '', coreId, parentFamilyId, description: '', ...overrides };
}

export function createFeature(
	coreId: string,
	parentFamilyId: string | null,
	overrides: Partial<Omit<Feature, 'unspaghettitFeatureId'>> = {}
): Feature {
	const id = overrides.id ?? newId();
	const base: Feature = {
		id,
		name: '',
		coreId,
		parentFamilyId,
		description: '',
		unspaghettitFeatureId: id
	};
	// Apply overrides but keep id + unspaghettitFeatureId in lockstep.
	return { ...base, ...overrides, id, unspaghettitFeatureId: id };
}
