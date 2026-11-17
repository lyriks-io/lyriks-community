import { error } from '@sveltejs/kit';
import {
	featureIdCollisionMessage,
	featureIdCollisions,
	requireBehaviorFeatureAccess
} from '$lib/server/behavior-feature-access.server';
import { adoptionJson } from '$lib/server/adoption-endpoint.server';
import { withStagedCandidates } from '$application/retrospec/staged-candidates';
import type {
	CandidateSpanInput,
	ElementSpanInput,
	FlagConflictInput,
	ResolveConflictInput
} from '$application/ports';
import type { RequestHandler } from './$types';

/** The element types the engine stages a candidate as (its proposedKind). */
const CANDIDATE_KINDS = ['surface', 'action', 'rule', 'invariant', 'transition', 'effect', 'state', 'event', 'entity'] as const;

/**
 * The tracing half of code → spec: pin each modeled element to the span it was
 * extracted from, park the spans not modeled yet, record the contradictions the
 * sources disagree on, and finally close the analysis.
 *
 * One endpoint with an `op` discriminator rather than seven near-identical
 * routes: they share the same authorization, the same feature scope and the same
 * answer shape, and differ only in the payload the engine wants. Splitting them
 * would duplicate the guard seven times — the thing that must never drift.
 *
 * `finalize` is the gate that makes adoption trustworthy: the engine refuses
 * while any element is untraced, so nothing reaches the spec that isn't in the
 * code. That refusal comes back as `ok:false` with the offending elements named.
 */

type AnalysisOp =
	| 'record_spans'
	| 'stage_candidates'
	| 'dispose_candidate'
	| 'flag_conflict'
	| 'resolve_conflict'
	| 'finalize'
	| 'reset';

const OPS: readonly AnalysisOp[] = [
	'record_spans',
	'stage_candidates',
	'dispose_candidate',
	'flag_conflict',
	'resolve_conflict',
	'finalize',
	'reset'
];

const isOp = (value: unknown): value is AnalysisOp =>
	typeof value === 'string' && (OPS as readonly string[]).includes(value);

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	if (!isOp(body?.op)) error(400, `op must be one of: ${OPS.join(', ')}`);

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');
	// A globally addressed write on an id another project also claims would land
	// in their record; refuse while it is still a message.
	const clashes = await featureIdCollisions(event.locals.services, projectId, featureId);
	if (clashes.length > 0) error(409, featureIdCollisionMessage(projectId, featureId, clashes));
	const adoption = event.locals.services.codeAdoption;
	const sourceId = typeof body.sourceId === 'string' ? body.sourceId : undefined;

	switch (body.op) {
		case 'record_spans': {
			const spans = Array.isArray(body.spans) ? (body.spans as ElementSpanInput[]) : null;
			if (!spans?.length) error(400, 'spans must be a non-empty array');
			return adoptionJson(await adoption.recordElementSpans(featureId, spans, sourceId));
		}
		case 'stage_candidates': {
			const candidates = Array.isArray(body.candidates)
				? (body.candidates as CandidateSpanInput[])
				: null;
			if (!candidates?.length) error(400, 'candidates must be a non-empty array');
			const untyped = candidates.findIndex((c) => !CANDIDATE_KINDS.includes(c?.kind as (typeof CANDIDATE_KINDS)[number]));
			if (untyped >= 0) error(400, `candidates[${untyped}].kind must be the element type the behaviour would become: ${CANDIDATE_KINDS.join(', ')}`);
			// The ids of what was staged lead the answer, each beside what was sent for it (criterion 65c8df6d).
			return adoptionJson(withStagedCandidates(await adoption.stageCandidates(featureId, candidates, sourceId), candidates, sourceId));
		}
		case 'dispose_candidate': {
			const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
			if (!candidateId) error(400, 'candidateId is required');
			return adoptionJson(
				await adoption.disposeCandidate({
					featureId,
					candidateId,
					...(typeof body.disposition === 'string' ? { disposition: body.disposition } : {}),
					...(typeof body.rationale === 'string' ? { rationale: body.rationale } : {}),
					...(typeof body.elementId === 'string' ? { elementId: body.elementId } : {})
				})
			);
		}
		case 'flag_conflict': {
			const summary = typeof body.summary === 'string' ? body.summary : '';
			if (!summary) error(400, 'summary is required');
			return adoptionJson(
				await adoption.flagConflict({
					featureId,
					summary,
					...(Array.isArray(body.statements)
						? { statements: body.statements as FlagConflictInput['statements'] }
						: {}),
					...(Array.isArray(body.affectedElements)
						? { affectedElements: body.affectedElements as string[] }
						: {})
				})
			);
		}
		case 'resolve_conflict': {
			const conflictId = typeof body.conflictId === 'string' ? body.conflictId : '';
			const resolution = typeof body.resolution === 'string' ? body.resolution : '';
			const status = body.status;
			if (!conflictId || !resolution) error(400, 'conflictId and resolution are required');
			if (status !== 'resolved' && status !== 'accepted_ambiguity') {
				error(400, 'status must be resolved or accepted_ambiguity');
			}
			return adoptionJson(
				await adoption.resolveConflict({
					featureId,
					conflictId,
					status: status as ResolveConflictInput['status'],
					resolution,
					...(typeof body.resolvedInFavorOf === 'string'
						? { resolvedInFavorOf: body.resolvedInFavorOf }
						: {})
				})
			);
		}
		case 'finalize':
			return adoptionJson(await adoption.finalizeAnalysis(featureId));
		case 'reset':
			return adoptionJson(await adoption.resetAnalysis(featureId));
	}
};
