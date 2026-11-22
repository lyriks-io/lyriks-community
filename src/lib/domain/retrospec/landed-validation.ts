import type { RetrospecAct } from './acts';
import { currentRun, type PersonRef, type RetrospecDocument } from './document';
import { specState, type SpecElement } from './spec-validation';

/**
 * What a landed change request validates in Knowledge (EVO-002): every element
 * its landing wrote whose code proved it all the way, through the request,
 * the moment it lands. Pure: the elements, their proof and the document arrive read.
 */

/** One element the landing wrote, as the landing reads it. */
export interface LandedElement {
	readonly id: string;
	/** The element as the specification holds it now; absent once it left the specification. */
	readonly element: SpecElement | undefined;
	/** Every line of the Verification report it stands on is proved in the code, or it holds nothing for the code. */
	readonly proved: boolean;
}

/** The request that landed, as Knowledge records it. */
export interface LandedRequest {
	readonly requestId: string;
	readonly requestKey: string;
	readonly approvedBy: readonly PersonRef[];
	readonly at: string;
}

/** The refusals of "Validate an element a landed request delivered", one per rule. */
export const LANDED_REFUSALS = {
	specValidated: 'The specification is validated: the landing validates nothing element by element.',
	notInSpec: 'This element is no longer in the specification.',
	notProved: 'A line of this element is not proved in the code: it stays to review.',
	changeRequested: 'A change was requested on this element: it waits on its people.',
	alreadyGiven: 'This request already gave its validation to this element.'
} as const;

/** Why the landing does not validate this element, or null when it does. */
export function landedValidationRefusal(doc: RetrospecDocument, requestId: string, landed: { readonly id: string; readonly inSpec: boolean; readonly proved: boolean }): string | null {
	// Once the specification is the reference, its elements are no longer validated one by one (rule a5f1d7b5).
	if (specState(doc) === 'validated') return LANDED_REFUSALS.specValidated;
	// A validation of something no longer there would stand for nothing (rule 2f7be7dc).
	if (!landed.inSpec) return LANDED_REFUSALS.notInSpec;
	// Only what was really implemented all the way is validated (rule fdac7020).
	if (!landed.proved) return LANDED_REFUSALS.notProved;
	const run = currentRun(doc);
	// Validating an element whose change was requested is a person's explicit decision (rule 8a28a126).
	if (run?.verdicts[landed.id]?.flag?.kind === 'rejected') return LANDED_REFUSALS.changeRequested;
	// The landing happens once: a validation a person withdrew is never given again by the same request (rule 4fe153c9).
	if (run?.throughRequests?.[landed.id]?.requestId === requestId) return LANDED_REFUSALS.alreadyGiven;
	return null;
}

/** What one landing does in Knowledge: the acts it records and what the success dialog counts. */
export interface LandingInKnowledge {
	readonly acts: readonly RetrospecAct[];
	/** Elements validated through the request. */
	readonly validated: readonly string[];
	/** Elements the landing wrote that read To review: a line not proved, or a change requested on them. */
	readonly toReview: readonly string[];
	/** The specification is validated definitively: the landing validated nothing element by element. */
	readonly specValidated: boolean;
}

/**
 * The landing of one request read against Knowledge: each element it wrote is
 * validated through the request unless a rule refuses it. An element that left
 * the specification, or that the request already validated once, is counted nowhere.
 */
export function landingInKnowledge(doc: RetrospecDocument, request: LandedRequest, elements: readonly LandedElement[], tab: string, total?: number): LandingInKnowledge {
	const acts: RetrospecAct[] = [];
	const validated: string[] = [];
	const toReview: string[] = [];
	let specValidated = false;
	for (const landed of elements) {
		const refusal = landedValidationRefusal(doc, request.requestId, { id: landed.id, inSpec: landed.element !== undefined, proved: landed.proved });
		if (refusal === LANDED_REFUSALS.specValidated) specValidated = true;
		else if (refusal === LANDED_REFUSALS.notProved || refusal === LANDED_REFUSALS.changeRequested) toReview.push(landed.id);
		if (refusal !== null || !landed.element) continue;
		validated.push(landed.id);
		acts.push({
			op: 'validate_through_request',
			itemId: landed.id,
			title: landed.element.title,
			tab,
			validation: { ...request, fingerprint: landed.element.fingerprint ?? '' },
			...(total !== undefined ? { total } : {})
		});
	}
	return { acts, validated, toReview, specValidated };
}
