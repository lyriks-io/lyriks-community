import type { EvolutionRequest } from './draft';
import type { ImpactHypothesis } from './enums';
import { currentLines } from './implementation';

/**
 * What the platform computes on its own for a request as it stands
 * (ac-evo-imp-7, ac-evo-coh-8, ac-evo-impl-9).
 *
 * A reading a click would only trigger, with nothing for the person to choose,
 * is a click taken from them: the impact and the coherence check are due when
 * the request stands at the Impact analysis and its drafts changed since they
 * last ran; the report is due when the request stands at Build without one, or
 * with one built against an older version than the one frozen now.
 * The index sync asks for the report on its own, since only it changes what the
 * report reads.
 */
export interface DueReadings {
	/** The walks to run, one per kind of draft the request carries, and the coherence check with them. */
	readonly impact: readonly ImpactHypothesis[];
	readonly report: boolean;
}

export const NOTHING_DUE: DueReadings = { impact: [], report: false };

/** The walks a request asks for: one per kind of draft it carries, a change when it drafts nothing. */
export function askedWalks(request: Pick<EvolutionRequest, 'drafts'>): ImpactHypothesis[] {
	const kinds = new Set<ImpactHypothesis>(
		request.drafts.map((d) => (d.kind === 'add' ? 'add' : d.kind === 'remove' ? 'remove' : 'change'))
	);
	return kinds.size > 0 ? [...kinds] : ['change'];
}

/** When the drafts last changed, read off the timeline; null when they never did. */
function lastDraftChange(request: Pick<EvolutionRequest, 'history'>): string | null {
	let latest: string | null = null;
	for (const entry of request.history) {
		if (entry.type === 'draft_change' && (latest === null || entry.recordedAt > latest)) latest = entry.recordedAt;
	}
	return latest;
}

export function dueReadings(request: EvolutionRequest): DueReadings {
	if (request.status !== 'open') return NOTHING_DUE;
	if (request.stage === 'coherence') {
		const changed = lastDraftChange(request);
		const stale = (ranAt: string | null) => ranAt === null || (changed !== null && ranAt < changed);
		return stale(request.impactReport.ranAt) || stale(request.coherenceReport.ranAt) ? { impact: askedWalks(request), report: false } : NOTHING_DUE;
	}
	if (request.stage === 'implementation') {
		const iteration = request.iterations.find((i) => i.number === request.iteration);
		const closed = iteration?.reportStatus === 'closed';
		const lines = currentLines(request);
		const outdated = lines.some((l) => l.specVersion !== request.specVersion);
		return { impact: [], report: !closed && (lines.length === 0 || outdated) };
	}
	return NOTHING_DUE;
}
