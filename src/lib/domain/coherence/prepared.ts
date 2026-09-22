import type { CoherenceAnalysis, Gap, PreparedDecision, ProjectCoherenceDraft } from './draft';
import type { DecisionVerdict } from './decisions';

/**
 * Decisions prepared for a person to take. Pure.
 *
 * The register only moves when somebody decides, and deciding belongs to a
 * person: `canSettle` refuses everything else, at every door. That refusal is
 * only half an answer. A client that has just read thirteen findings, and can
 * argue each one, is told no and offered nothing, so it reports the same
 * thirteen next session. Preparing is what it may do instead: name the
 * disposition, write the why, change no score, and leave the call to whoever
 * answers for it.
 *
 * Rules:
 *   - a preparation never settles anything: it is not a decision;
 *   - one per gap, replaced rather than stacked;
 *   - it is kept only while its gap is open and non-blocking, because a
 *     preparation nobody can take is noise on the card;
 *   - no reason, no preparation: the reason IS the work being handed over.
 */

export interface PreparationInput {
	gapId: string;
	gapTitle: string;
	status: PreparedDecision['status'];
	reason: string;
	by: { id: string; kind: 'person' | 'ai_client' };
}

/** Whether a decision may be prepared for this gap. */
export function canPrepare(gap: Pick<Gap, 'blocking'> | undefined, reason: string): DecisionVerdict {
	if (!gap) return { ok: false, why: 'This gap is not open; there is no decision to prepare.' };
	if (gap.blocking)
		return { ok: false, why: 'A blocking gap is fixed, not decided: nothing to prepare.' };
	if (reason.trim() === '')
		return { ok: false, why: 'A prepared decision without a reason gives the person nothing to weigh.' };
	return { ok: true };
}

/** The preparation standing for a gap, if any. */
export function preparedFor(
	draft: Pick<ProjectCoherenceDraft, 'prepared'>,
	gapId: string
): PreparedDecision | undefined {
	return draft.prepared.find((p) => p.gapId === gapId);
}

/** Add or replace the preparation for a gap. */
export function prepareDecision(
	draft: ProjectCoherenceDraft,
	input: PreparationInput,
	id: string,
	now: string
): ProjectCoherenceDraft {
	const prepared: PreparedDecision = {
		id,
		gapId: input.gapId,
		gapTitle: input.gapTitle,
		status: input.status,
		reason: input.reason.trim(),
		preparedById: input.by.id,
		preparedByKind: input.by.kind,
		preparedAt: now
	};
	return { ...draft, prepared: [...draft.prepared.filter((p) => p.gapId !== input.gapId), prepared] };
}

/** Drop the preparation for a gap: taken, dismissed, or no longer applicable. */
export function dropPreparation(
	draft: ProjectCoherenceDraft,
	gapId: string
): ProjectCoherenceDraft {
	if (!draft.prepared.some((p) => p.gapId === gapId)) return draft;
	return { ...draft, prepared: draft.prepared.filter((p) => p.gapId !== gapId) };
}

/**
 * Keep only the preparations a person could still act on.
 *
 * A gap that was fixed, or settled some other way, takes its preparation with
 * it; a gap that turned blocking loses it too, because the answer to a blocking
 * finding is a fix and never a disposition. Applied on save so a stale card
 * cannot offer a decision the endpoint would refuse.
 */
export function keepActionablePreparations(
	prepared: readonly PreparedDecision[],
	analysis: Pick<CoherenceAnalysis, 'gaps'>
): PreparedDecision[] {
	const open = new Map(analysis.gaps.map((g) => [g.id, g]));
	return prepared.filter((p) => {
		const gap = open.get(p.gapId);
		return gap !== undefined && !gap.blocking && p.reason.trim() !== '';
	});
}
