import type { FeatureMaturityScorerPort } from './ports';
import { isAuxFeatureId } from './projection/aux-feature-ids';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

/**
 * A read-only, MAP-safe summary of a project's persisted behavior, folded from the
 * canonical Unspaghettit-format kernel (the `BehaviorPort` read side). Pure and
 * framework-free: it counts what is authored — surfaces, actions, rules,
 * invariants, effects, scenarios, events, … — and takes the maturity scorer the
 * Behavior Maturity reading uses, so both report the same signal. No network:
 * the Functional page renders real project behavior with the unspa advisor and
 * DPO turned off.
 */
export interface BehaviorFeatureSummary {
	featureId: string;
	name: string;
	surfaceCount: number;
	actionCount: number;
	/** Surface rules + action rules. */
	ruleCount: number;
	/** Feature + surface + action invariants. */
	invariantCount: number;
	effectCount: number;
	/** State definitions declared across this feature's surfaces. */
	stateCount: number;
	scenarioCount: number;
	eventCount: number;
	entityCount: number;
	personaCount: number;
	/** 0–100; 0 when the feature has no authored shell. */
	maturity: number;
	/** Any behavior authored at all. */
	authored: boolean;
	/** Past unspa's "hold in head" size cap — a coherence risk worth splitting. */
	overCap: boolean;
}

export interface BehaviorTotals {
	surfaces: number;
	actions: number;
	rules: number;
	invariants: number;
	effects: number;
	transitions: number;
	stateDefinitions: number;
	scenarios: number;
	events: number;
	entities: number;
	personas: number;
	resources: number;
	reachabilityGoals: number;
}

export interface BehaviorOverview {
	/** Whether a canonical project snapshot exists at all. */
	hasProject: boolean;
	/** Non-aux, product-level behavior features. */
	features: BehaviorFeatureSummary[];
	/** The aux "Data Model" + "Experience" features (shared behavior). */
	shared: BehaviorFeatureSummary[];
	totals: BehaviorTotals;
	/** Cheap, engine-free findings worth a nudge. */
	attention: { unauthored: number; overCap: number };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// unspa's "hold it all in head" rule of thumb: 1–15 surfaces, up to ~100 actions.
const SURFACE_CAP = 15;
const ACTION_CAP = 100;

/** Everything a single surface contributes, folded once so the per-feature
    summary and the deduplicated project totals count the same way. */
interface SurfaceCounts {
	actions: number;
	rules: number;
	invariants: number;
	effects: number;
	transitions: number;
	stateDefinitions: number;
	emittedEvents: number;
	scenarios: number;
}

function countSurface(sRaw: unknown): SurfaceCounts {
	const s = (sRaw ?? {}) as Record<string, unknown>;
	const actions = arr(s.actions);
	const c: SurfaceCounts = {
		actions: actions.length,
		rules: arr(s.rules).length,
		invariants: arr(s.invariants).length,
		effects: 0,
		transitions: arr(s.transitions).length,
		stateDefinitions: arr(s.stateDefinitions).length,
		emittedEvents: 0,
		scenarios: 0
	};
	for (const aRaw of actions) {
		const a = (aRaw ?? {}) as Record<string, unknown>;
		c.rules += arr(a.rules).length;
		c.invariants += arr(a.invariants).length;
		c.effects += arr(a.effects).length;
		c.transitions += arr(a.transitions).length;
		c.emittedEvents += arr(a.emittedEvents).length;
		c.scenarios += arr(a.scenarios).length;
	}
	return c;
}

/**
 * Per-feature counts fold the feature's OWN snapshot, exactly like the maturity
 * score does — a leaf whose behavior lives on a surface that the Experience aux
 * feature also carries must not read "0 surfaces · 0 actions" next to a real
 * score. Deduplication of those shared surfaces happens in the project totals,
 * where double-counting would actually mislead.
 */
function summarizeFeature(
	featureId: string,
	snap: UnspaFeatureSnapshot | null,
	maturityScorer: FeatureMaturityScorerPort
): BehaviorFeatureSummary {
	const f = (snap?.feature ?? {}) as Record<string, unknown>;
	const surfaces = arr(f.surfaces);
	let actionCount = 0;
	let ruleCount = 0;
	let invariantCount = arr(f.featureInvariants).length;
	let effectCount = 0;
	let stateCount = 0;
	let scenarioCount = arr(f.scenarios).length + arr(f.acceptanceCriteria).length;
	let eventCount = arr(f.events).length;
	for (const sRaw of surfaces) {
		const c = countSurface(sRaw);
		actionCount += c.actions;
		ruleCount += c.rules;
		invariantCount += c.invariants;
		effectCount += c.effects;
		stateCount += c.stateDefinitions;
		scenarioCount += c.scenarios;
		eventCount += c.emittedEvents;
	}
	const surfaceCount = surfaces.length;
	const entityCount = arr(f.entities).length;
	const personaCount = arr(f.personas).length;
	return {
		featureId,
		name: str(f.name) || featureId,
		surfaceCount,
		actionCount,
		ruleCount,
		invariantCount,
		effectCount,
		stateCount,
		scenarioCount,
		eventCount,
		entityCount,
		personaCount,
		maturity: maturityScorer.score(snap),
		authored:
			surfaceCount > 0 || actionCount > 0 || entityCount > 0 || scenarioCount > 0,
		overCap: surfaceCount > SURFACE_CAP || actionCount > ACTION_CAP
	};
}

const ZERO_TOTALS: BehaviorTotals = {
	surfaces: 0,
	actions: 0,
	rules: 0,
	invariants: 0,
	effects: 0,
	transitions: 0,
	stateDefinitions: 0,
	scenarios: 0,
	events: 0,
	entities: 0,
	personas: 0,
	resources: 0,
	reachabilityGoals: 0
};

/** The all-zero totals shape — for page servers that need an empty overview. */
export const EMPTY_BEHAVIOR_TOTALS: Readonly<BehaviorTotals> = ZERO_TOTALS;

/**
 * Project totals, counting each surface ONCE by id. Journey surfaces exist both
 * on the Experience aux feature and (historically, via the Core-bridge mirror)
 * on every leaf they serve — summing per-feature counts would credit the same
 * authored work several times and report the project as bigger than it is.
 */
function foldTotals(
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>
): BehaviorTotals {
	const totals = { ...ZERO_TOTALS };
	const seenSurfaceIds = new Set<string>();
	for (const { snapshot } of featureSnapshots) {
		const f = (snapshot?.feature ?? {}) as Record<string, unknown>;
		totals.invariants += arr(f.featureInvariants).length;
		totals.scenarios += arr(f.scenarios).length + arr(f.acceptanceCriteria).length;
		totals.events += arr(f.events).length;
		totals.entities += arr(f.entities).length;
		totals.personas += arr(f.personas).length;
		totals.resources += arr(f.resources).length;
		totals.reachabilityGoals += arr(f.reachabilityGoals).length;
		for (const sRaw of arr(f.surfaces)) {
			const id = str(((sRaw ?? {}) as Record<string, unknown>).id);
			if (id) {
				if (seenSurfaceIds.has(id)) continue;
				seenSurfaceIds.add(id);
			}
			const c = countSurface(sRaw);
			totals.surfaces += 1;
			totals.actions += c.actions;
			totals.rules += c.rules;
			totals.invariants += c.invariants;
			totals.effects += c.effects;
			totals.transitions += c.transitions;
			totals.stateDefinitions += c.stateDefinitions;
			totals.scenarios += c.scenarios;
			totals.events += c.emittedEvents;
		}
	}
	return totals;
}

export function summarizeBehavior(
	project: UnspaProjectSnapshot | null,
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>,
	maturityScorer: FeatureMaturityScorerPort
): BehaviorOverview {
	const all = featureSnapshots.map(({ featureId, snapshot }) =>
		summarizeFeature(featureId, snapshot, maturityScorer)
	);
	const totals = foldTotals(featureSnapshots);
	const features = all.filter((f) => !isAuxFeatureId(f.featureId));
	const shared = all.filter((f) => isAuxFeatureId(f.featureId));
	return {
		hasProject: project !== null,
		features,
		shared,
		totals,
		attention: {
			unauthored: features.filter((f) => !f.authored).length,
			overCap: all.filter((f) => f.overCap).length
		}
	};
}
