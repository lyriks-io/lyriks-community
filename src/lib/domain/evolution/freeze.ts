import type { Actor, EvolutionRequest, ImplementationFinding } from './draft';
import { canCrossToImplementation } from './gate';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * Freezing the specification into a numbered version.
 *
 * Crossing from Challenge into Verify freezes the spec under an incremented
 * version number, recorded with its date. From then on what was built is
 * compared against that number: an implementation report names the version it
 * was built against, and one naming another version is refused at the door,
 * never read. Amending the spec after a freeze reopens Challenge; the next
 * crossing produces the next version, and every frozen version stays readable.
 */

/** Freezing is the act of one crossing, and needs what that crossing needs. */
export function canFreeze(
	request: EvolutionRequest,
	input: { canEdit: boolean; criticalEmptyCount: number }
): Guarded {
	return firstRefusal(
		guard(
			!input.canEdit,
			'You can read this request but not move it.',
			'Freezing is a write on the request.'
		),
		guard(
			request.stage !== 'coherence',
			'Freezing happens when crossing from Challenge to Verify.',
			'The freeze is the act of that one crossing.'
		),
		canCrossToImplementation(request, input.criticalEmptyCount)
	);
}

/** The next version, frozen and dated. The caller has passed `canFreeze` or holds a waiver. */
export function freeze(request: EvolutionRequest, actor: Actor, at: string): EvolutionRequest {
	const version = request.specVersion + 1;
	return {
		...request,
		specVersion: version,
		frozen: true,
		frozenVersions: [...request.frozenVersions, { version, at, by: actor.id }]
	};
}

/** Amending applies to a frozen spec only; without a freeze it is plain editing. */
export function canAmend(request: EvolutionRequest, canEdit: boolean): Guarded {
	return firstRefusal(
		guard(!canEdit, 'You can read this request but not amend it.', 'Amending is a write on the request.'),
		guard(
			!request.frozen,
			'Nothing is frozen; edit the spec directly.',
			'Amending is the act of unfreezing; without a freeze it is plain editing.'
		)
	);
}

/**
 * The spec moves again. The frozen version stays readable; the report of the
 * iteration stays readable too, but no longer judges the current spec.
 */
export function amend(request: EvolutionRequest): EvolutionRequest {
	return { ...request, frozen: false };
}

/**
 * A report is received only against a frozen spec, and only when it names that
 * version. Both numbers travel with the refusal.
 */
export function canReceiveReport(request: EvolutionRequest, reportSpecVersion: number): Guarded {
	return firstRefusal(
		guard(
			!request.frozen,
			'There is no frozen version to report against.',
			'A report needs a fixed reference.'
		),
		guard(
			reportSpecVersion !== request.specVersion,
			`The report names spec version ${reportSpecVersion}; the frozen spec is version ${request.specVersion}.`,
			'A report against the wrong version is refused, not read.'
		)
	);
}

/**
 * The lines an incoming save would add to the current iteration of a request:
 * a report deposited by the coding agent. Lines already stored are not judged
 * again, so a re-save of an accepted report never trips over its own version.
 */
export function incomingReportLines(
	stored: EvolutionRequest | undefined,
	incoming: EvolutionRequest
): ImplementationFinding[] {
	const known = new Set((stored?.implementationFindings ?? []).map((l) => l.id));
	return incoming.implementationFindings.filter(
		(l) => l.iteration === incoming.iteration && !known.has(l.id)
	);
}

/**
 * Every refusal an incoming evolution draft earns on its reports, request by
 * request. The stored request is the authority on what is frozen: an incoming
 * draft cannot freeze and report in the same breath.
 */
export function refusedReports(
	stored: readonly EvolutionRequest[],
	incoming: readonly EvolutionRequest[]
): { requestId: string; reason: string }[] {
	const refusals: { requestId: string; reason: string }[] = [];
	for (const request of incoming) {
		const before = stored.find((r) => r.id === request.id);
		const lines = incomingReportLines(before, request);
		if (lines.length === 0) continue;
		const reference = before ?? request;
		for (const version of new Set(lines.map((l) => l.specVersion))) {
			const allowed = canReceiveReport(reference, version);
			if (!allowed.ok) refusals.push({ requestId: request.id, reason: allowed.reason });
		}
	}
	return refusals;
}

/** Verify implies a frozen spec. */
export function verifyImpliesFrozen(request: EvolutionRequest): boolean {
	return request.stage !== 'implementation' || request.frozen;
}
