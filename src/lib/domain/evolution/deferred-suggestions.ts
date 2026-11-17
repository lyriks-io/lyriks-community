import type { EvolutionRequest, ImplementationFinding } from './draft';
import { currentLines, isRequestLine } from './implementation';
import { requestKeyOf } from './request-ref';
import { isDataChangeRequirement, requirementParts } from './report-requirement';

/**
 * The omissions a person deferred to a future evolution, read as suggestions
 * on the Evolutions list (criteria 35991202, 03b7eacf).
 *
 * A suggestion is derived from the decision on its line and never stored:
 * nothing is created when it appears, nothing is deleted when it goes, so it
 * takes no request number and cannot outlive the choice that made it.
 */
export interface DeferredSuggestion {
	readonly lineId: string;
	readonly title: string;
	/** What the spec asks for, as the report words it. */
	readonly statement: string;
	/** The feature the line was read on, when the report knows it. */
	readonly leafId: string | null;
	readonly fromRequestId: string;
	readonly fromKey: string | null;
}

type Requests = readonly EvolutionRequest[];

/** The person chose to defer this omission. A validated line on a table says the opposite: a person confirmed the code holds it. */
export const isDeferredLine = (line: Pick<ImplementationFinding, 'verdict' | 'decision' | 'requirement'>): boolean =>
	line.verdict === 'missing' && line.decision === 'validated' && !isDataChangeRequirement(line.requirement);

const isLive = (request: EvolutionRequest): boolean => request.status !== 'cancelled';

/** The evolution started from this line, unless it was cancelled: its suggestion then comes back. */
export const carrierOfLine = (requests: Requests, lineId: string): EvolutionRequest | null =>
	requests.find((r) => isLive(r) && r.deferredFrom?.lineId === lineId) ?? null;

export function deferredSuggestions(requests: Requests): DeferredSuggestion[] {
	return requests.filter(isLive).flatMap((request) =>
		currentLines(request)
			.filter((line) => isRequestLine(line) && isDeferredLine(line) && !carrierOfLine(requests, line.id))
			.map((line) => ({
				lineId: line.id,
				title: requirementParts(line.requirement).title,
				statement: line.specStatement || line.requirement,
				leafId: line.leafId ?? null,
				fromRequestId: request.id,
				fromKey: requestKeyOf(requests, request.id)
			}))
	);
}

/** The evolutions that carry the lines of this request, by line: what the Verification names on them. */
export function deferredCarriers(requests: Requests, request: EvolutionRequest): Record<string, { readonly id: string; readonly key: string | null }> {
	const carried: Record<string, { readonly id: string; readonly key: string | null }> = {};
	for (const line of currentLines(request).filter(isDeferredLine)) {
		const carrier = carrierOfLine(requests, line.id);
		if (carrier) carried[line.id] = { id: carrier.id, key: requestKeyOf(requests, carrier.id) };
	}
	return carried;
}
