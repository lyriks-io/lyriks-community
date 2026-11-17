/**
 * Proven against code: how much of the modeled behavior a passing run against
 * the code has proven (spec: feat-control-center, "Measure what is proven
 * against the code", criteria 82b11e20, be565996, ffce2d32, 540ac34e, 6a0ee223).
 *
 * WHY THIS EXISTS. Audit, coherence and green scenarios prove that the MODEL
 * agrees with itself, never that the code does. A retro-spec bench read audit
 * 100, coherence 77 and 264 passing scenarios while four of its rules
 * contradicted the code, and no reading on the screen could have said so. The
 * proof already exists in the implementation index: an action whose entry
 * carries the `verifiedAt` stamp a passing scenario run leaves is proven, and a
 * criterion carries its last recorded result. This turns them into one reading.
 *
 * Kept OUT of the coherence score on purpose: a new dimension in that average
 * would move every project's score the day it ships. It is read beside the
 * headline, never inside it.
 *
 * Pure: the per-feature coverage rows in, the reading out.
 */

/** The sentence the mark's tooltip shows, and the one an agent is handed with the numbers. */
export const CONFORMANCE_MEANS =
	'Share of modeled behavior proven by a passing run against the code; coherence and audit only prove the model is consistent.';

/**
 * What the mark says. `no_code_linked` when the index locates nothing in the
 * code; `no_action_located` when it locates entries but not one action, so no
 * run could have proven anything yet; `measured` otherwise.
 */
export type ConformanceReading = 'no_code_linked' | 'no_action_located' | 'measured';

/** Active acceptance criteria by their last recorded result. */
export interface CriteriaResults {
	readonly total: number;
	readonly verified: number;
	readonly failing: number;
}

/** One feature's coverage row, as the implementation-coverage read folds it. */
export interface ConformanceRow {
	/** Spec elements the index located in the code. */
	readonly found: number;
	/** Per-action slices: the elements each action expected, and its proof stamp. */
	readonly actions?: Readonly<
		Record<
			string,
			{
				readonly elements?: readonly { readonly kind: string; readonly location: unknown }[];
				readonly provenAt?: string;
			}
		>
	>;
	/** Absent when the engine does not report criteria. */
	readonly criteria?: CriteriaResults;
}

export interface Conformance {
	readonly reading: ConformanceReading;
	/** False when nothing is located in the code: nothing to measure, never 0 %. */
	readonly linked: boolean;
	/** Proven actions over located actions, 0 to 100; null when no action is located. */
	readonly percent: number | null;
	readonly actions: { readonly proven: number; readonly located: number };
	/** Null when the engine reports no criteria: unknown, never zero. */
	readonly criteria: CriteriaResults | null;
	/** Spec elements the index located in the code, over the whole project. */
	readonly entriesLocated: number;
	/** What the mark reads: "0% proven", "No code linked". */
	readonly label: string;
	/** What it means, word for word as the tooltip shows it. */
	readonly means: string;
	/** The counts behind the share, as the tooltip lists them under `means`. */
	readonly detail: string;
}

/**
 * The share, rounded, where 0 % and 100 % are earned: one proven action reads at
 * least 1 %, one unproven action keeps it at 99 % at most. Null without a
 * located action, since a share of nothing is a verdict on code nobody linked.
 */
export function provenShare(proven: number, located: number): number | null {
	if (located <= 0) return null;
	if (proven <= 0) return 0;
	if (proven >= located) return 100;
	return Math.min(99, Math.max(1, Math.round((100 * proven) / located)));
}

const LABEL: Record<Exclude<ConformanceReading, 'measured'>, string> = {
	no_code_linked: 'No code linked',
	no_action_located: 'No action located'
};

/** Proven against code for a project, from its features' coverage rows. */
export function conformanceOf(rows: readonly ConformanceRow[]): Conformance {
	let entriesLocated = 0;
	let located = 0;
	let proven = 0;
	let criteria: { total: number; verified: number; failing: number } | null = null;
	for (const row of rows) {
		entriesLocated += row.found;
		for (const action of Object.values(row.actions ?? {})) {
			// Located means the index found the action ITSELF in the code, not one of its rules.
			const isLocated = (action.elements ?? []).some((e) => e.kind === 'action' && e.location !== null);
			if (!isLocated) continue;
			located += 1;
			if (action.provenAt) proven += 1;
		}
		if (row.criteria) {
			criteria ??= { total: 0, verified: 0, failing: 0 };
			criteria.total += row.criteria.total;
			criteria.verified += row.criteria.verified;
			criteria.failing += row.criteria.failing;
		}
	}
	const reading: ConformanceReading =
		entriesLocated === 0 ? 'no_code_linked' : located === 0 ? 'no_action_located' : 'measured';
	const percent = reading === 'measured' ? provenShare(proven, located) : null;
	const counts = { reading, actions: { proven, located }, criteria };
	return {
		reading,
		linked: reading !== 'no_code_linked',
		percent,
		actions: counts.actions,
		criteria,
		entriesLocated,
		label: reading === 'measured' ? `${percent}% proven` : LABEL[reading],
		means: CONFORMANCE_MEANS,
		detail: conformanceDetail(counts)
	};
}

/**
 * The counts behind the share, one clause each, for the tooltip and for a
 * reader outside the screen: "0 of 214 located actions proven · 0 of 21
 * criteria verified". Failing criteria are named apart, never averaged away.
 */
export function conformanceDetail(c: Pick<Conformance, 'reading' | 'actions' | 'criteria'>): string {
	if (c.reading === 'no_code_linked') return 'No implementation index entry is located in the code.';
	const parts = [`${c.actions.proven} of ${c.actions.located} located action${c.actions.located === 1 ? '' : 's'} proven`];
	if (c.criteria) {
		parts.push(`${c.criteria.verified} of ${c.criteria.total} criteri${c.criteria.total === 1 ? 'on' : 'a'} verified`);
		if (c.criteria.failing > 0) parts.push(`${c.criteria.failing} failing`);
	}
	return parts.join(' · ');
}
