import type { GapKind, GapProvenance } from './draft';

/**
 * THE catalogue of coherence checks: one declared entry per thing the product
 * verifies, so the Control Center can say "N checks ran, M pass" instead of
 * only listing what failed, and so every gap names the check it came from.
 *
 * A check is a property the spec should hold, phrased so a reader knows what
 * passing means. The emitters in the two checker layers reference these ids
 * (`Gap.checkId`) and report which ids actually RAN (`CoherenceAnalysis.checksRun`):
 * a check that ran and emitted nothing passed; a check that did not run (engine
 * offline, tier not entitled) is neither passed nor failed and is never counted
 * as a pass.
 */
export type CheckLayer = 'coverage' | 'declared' | 'formal' | 'semantic' | 'behavior';

export interface CheckDef {
	/** Stable key; also what a gap carries as `checkId`. */
	id: string;
	/** The property, in the reader's words ("Every feature is granted to a role"). */
	label: string;
	kind: GapKind;
	provenance: GapProvenance;
	/** Capability (registry id / source step) where a failure is fixed. */
	capability: string;
	layer: CheckLayer;
}

const coverage = (id: string, label: string, kind: GapKind, capability: string): CheckDef => ({
	id,
	label,
	kind,
	provenance: 'detected',
	capability,
	layer: 'coverage'
});

export const CHECKS: readonly CheckDef[] = [
	// ── Features ──
	coverage('features.has-leaf', 'At least one leaf feature exists', 'missing', 'features'),
	coverage('features.maturity', 'Features carry authored behavior', 'missing', 'features'),
	coverage('features.kernel-record', 'Every feature keeps its behavior record', 'dangling', 'features'),
	coverage('features.core-journey', 'Every core with features has a journey', 'orphan', 'experience'),
	// ── Users & permissions ──
	coverage('users.feature-reachable', 'Every feature is granted to at least one role', 'missing', 'users'),
	coverage('users.roles-granted', 'Every role holds at least one capability', 'orphan', 'users'),
	coverage('users.grants-resolve', 'Every grant names an existing role', 'dangling', 'permissions'),
	// ── Experience ──
	coverage('experience.has-journey', 'A journey maps the product experience', 'missing', 'experience'),
	coverage('experience.actors-resolve', 'Journey actors are existing roles', 'dangling', 'experience'),
	coverage('experience.state-types', 'A state keeps one type across screens', 'misalignment', 'experience'),
	coverage('experience.plan.entry', 'The prototype has an entry screen', 'missing', 'experience'),
	coverage('experience.plan.screen-empty', 'Every screen renders something', 'missing', 'experience'),
	coverage('experience.plan.journey-unlinked', 'Every journey runs on a screen', 'step-without-action', 'experience'),
	coverage('experience.plan.core-uncovered', 'Every core is prototyped on a screen', 'orphan', 'experience'),
	coverage('experience.plan.role-unused', 'Every role has a presence in the prototype', 'orphan', 'experience'),
	coverage('experience.plan.entity-unused', 'Every entity is exercised by the prototype', 'orphan', 'experience'),
	coverage('experience.plan.dead-action', 'Every action does something', 'step-without-action', 'experience'),
	coverage('experience.plan.nav-broken', 'Every navigation targets an existing screen', 'dangling', 'experience'),
	coverage('experience.plan.orphan-screen', 'Every screen is reachable from the entry', 'orphan', 'experience'),
	// ── Rules ──
	{
		id: 'rules.open-issues',
		label: 'No open issue stands in the declared rules',
		kind: 'missing',
		provenance: 'declared',
		capability: 'rules',
		layer: 'declared'
	},
	// ── Data ──
	coverage('data.tables-modeled', 'Every table a journey touches has a schema', 'missing', 'data'),
	coverage('data.fields-modeled', 'Every field a journey reads is in its entity', 'missing', 'data'),
	coverage('data.entities-unique', 'Entity names are unique', 'duplicate', 'data'),
	coverage('data.entities-placed', 'Every entity lives on a database', 'orphan', 'data'),
	coverage('data.relations-resolve', 'Every relation targets an existing entity', 'dangling', 'data'),
	// ── Architecture & glossary ──
	coverage('architecture.references', 'Every tech choice cites an official reference', 'dangling', 'architecture'),
	coverage('glossary.defined', 'Every governed term has a definition', 'missing', 'glossary'),
	coverage('glossary.approved', 'Every governed term is approved', 'missing', 'glossary'),
	// ── Formal (DPO engine) ──
	{ id: 'formal.type-compat', label: 'Values match the type of the state they write', kind: 'misalignment', provenance: 'proven', capability: 'experience', layer: 'formal' },
	{ id: 'formal.lca-bus', label: 'A state bus stays within its declared type', kind: 'misalignment', provenance: 'proven', capability: 'experience', layer: 'formal' },
	{ id: 'formal.gluing', label: 'A change keeps what other parts depend on', kind: 'dangling', provenance: 'proven', capability: 'experience', layer: 'formal' },
	{ id: 'formal.other', label: 'No other formal violation', kind: 'misalignment', provenance: 'proven', capability: 'experience', layer: 'formal' },
	// ── Semantic review ──
	{ id: 'semantic.review', label: 'The consistency review agrees with the spec', kind: 'misalignment', provenance: 'reviewed', capability: 'coherence', layer: 'semantic' },
	// ── Behavior model-check ──
	{ id: 'behavior.model-check', label: 'The behavior model verifies', kind: 'misalignment', provenance: 'behavior', capability: 'features', layer: 'behavior' }
];

const BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

export function checkById(id: string): CheckDef | undefined {
	return BY_ID.get(id);
}

export function checkIdsOfLayer(layer: CheckLayer): string[] {
	return CHECKS.filter((c) => c.layer === layer).map((c) => c.id);
}

/** Every check the local (engine-free) checker runs on each analysis. */
export const LOCAL_CHECK_IDS: readonly string[] = [
	...checkIdsOfLayer('coverage'),
	...checkIdsOfLayer('declared')
];

/** How many checks ran, and how many of them pass. */
export interface CheckTally {
	run: number;
	passing: number;
	failing: number;
}

/**
 * Tally from the ids that ran and the gaps emitted: a check fails when at least
 * one gap names it. Gaps without a check id (legacy or engine-relayed) count
 * against nothing, and never make a check pass.
 */
export function tallyChecks(
	checksRun: readonly string[],
	gaps: readonly { checkId?: string }[]
): CheckTally {
	const run = new Set(checksRun);
	const failing = new Set<string>();
	for (const g of gaps) if (g.checkId && run.has(g.checkId)) failing.add(g.checkId);
	return { run: run.size, passing: run.size - failing.size, failing: failing.size };
}
