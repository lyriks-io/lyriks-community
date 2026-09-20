import type { Actor, EvolutionRequest, FieldSignature } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * Co-signing a field: several people can stand behind one value, by name and
 * date, and each takes back only their own signature.
 *
 * A signature is an annotation on a VALUE, never a lock on the control. The
 * field stays editable whatever the signatures on it; an edit voids them all,
 * visibly, and the history keeps who had signed what. So a signature shown as
 * standing always refers to the value on screen: it is the receipt of the exact
 * text that was signed, compared with what the owning section holds now.
 *
 * Signing a human-typed value needs no source: the citations belong to the
 * value. Accepting a model proposal keeps its own source and reasoning
 * requirement, in `proposals.ts`.
 */

/** The signatures that stand on the value currently shown for one field home. */
export function standingSignatures(
	request: EvolutionRequest,
	key: string,
	currentValue: string
): FieldSignature[] {
	return request.fieldSignatures.filter(
		(s) => s.key === key && s.voidedAt === null && s.signedValue === currentValue
	);
}

/** Whether this actor's own signature stands on the value shown. */
export function signedBy(
	request: EvolutionRequest,
	key: string,
	currentValue: string,
	actorId: string
): boolean {
	return standingSignatures(request, key, currentValue).some((s) => s.signerId === actorId);
}

/**
 * Signing is a person's act, scoped by the review right on the capability
 * that owns the field, once per person per value, and only on a value that
 * exists: an empty field or an open question has nothing to stand behind.
 */
export function canSign(
	actor: Actor,
	input: { canReview: boolean; alreadySignedByMe: boolean; filled: boolean; openQuestion: boolean }
): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'An AI client cannot sign. Signing is a person\'s act.',
			'A signature is the human accountability the whole feature exists for.'
		),
		guard(
			!input.canReview,
			'You do not hold the review right on the section that owns this field.',
			'Signing is scoped by the owning capability, like every write.'
		),
		guard(
			input.openQuestion,
			'An open question is not signed. Answer it first.',
			'There is no value to stand behind on a declared unknown.'
		),
		guard(
			!input.filled,
			'Nothing to sign yet: the field is empty.',
			'A signature refers to a value; an empty field has none.'
		),
		guard(
			input.alreadySignedByMe,
			'You already signed this value.',
			'One signature per person per value.'
		)
	);
}

/** A signature is withdrawn only by the person who gave it. */
export function canWithdrawSignature(signedByMe: boolean): Guarded {
	return guard(
		!signedByMe,
		'You have not signed this value. Nobody removes someone else\'s signature.',
		'A signature is withdrawn only by the person who gave it.'
	);
}

/** Editing needs write access and nothing else: a signature never freezes a field. */
export function canEditSignedField(canEdit: boolean): Guarded {
	return guard(
		!canEdit,
		'You can read this request but not write on it.',
		'Editing needs write access; the number of signatures is never a reason to refuse.'
	);
}

/** Append a signature on the exact value shown. The caller has passed `canSign`. */
export function sign(
	request: EvolutionRequest,
	input: { id: string; key: string; actor: Actor; at: string; signedValue: string }
): EvolutionRequest {
	const signature: FieldSignature = {
		id: input.id,
		key: input.key,
		signerId: input.actor.id,
		signedAt: input.at,
		signedValue: input.signedValue,
		voidedAt: null,
		voidedBy: null
	};
	return { ...request, fieldSignatures: [...request.fieldSignatures, signature] };
}

/** Take back one's own standing signature on the value shown; the others stay. */
export function withdraw(
	request: EvolutionRequest,
	key: string,
	currentValue: string,
	actorId: string
): EvolutionRequest {
	return {
		...request,
		fieldSignatures: request.fieldSignatures.filter(
			(s) =>
				!(s.key === key && s.voidedAt === null && s.signedValue === currentValue && s.signerId === actorId)
		)
	};
}

/**
 * The value moved on: every signature that stood on the previous value is
 * voided, visibly, and the history keeps who had signed which value. Returns
 * how many were voided so the editor can be told.
 */
export function voidSignaturesOnEdit(
	request: EvolutionRequest,
	key: string,
	newValue: string,
	actor: Actor,
	at: string
): { request: EvolutionRequest; voided: number } {
	let voided = 0;
	const fieldSignatures = request.fieldSignatures.map((s) => {
		if (s.key !== key || s.voidedAt !== null || s.signedValue === newValue) return s;
		voided += 1;
		return { ...s, voidedAt: at, voidedBy: actor.id };
	});
	return { request: { ...request, fieldSignatures }, voided };
}

/** Signatures stand on the current value or not at all. */
export function signaturesStandOnCurrentValue(
	request: EvolutionRequest,
	key: string,
	currentValue: string
): boolean {
	return request.fieldSignatures
		.filter((s) => s.key === key && s.voidedAt === null)
		.every((s) => s.signedValue === currentValue);
}
