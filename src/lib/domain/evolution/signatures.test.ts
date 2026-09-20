import { describe, expect, it } from 'vitest';
import {
	canEditSignedField,
	canSign,
	canWithdrawSignature,
	createEvolutionRequest,
	sign,
	signaturesStandOnCurrentValue,
	signedBy,
	standingSignatures,
	voidSignaturesOnEdit,
	withdraw,
	type Actor
} from './index';

/**
 * The scenarios the specification declares on "Co-sign a field"
 * (feat-evo-field-signature), transcribed.
 */

const noa: Actor = { id: 'noa', kind: 'person', role: 'member' };
const nour: Actor = { id: 'nour', kind: 'person', role: 'member' };
const aiClient: Actor = { id: 'mcp-1', kind: 'ai_client', role: 'member' };
const KEY = '02-problem.value@feat-a';
const VALUE = 'Four key-account deals hinge on this.';
const ok = { canReview: true, alreadySignedByMe: false, filled: true, openQuestion: false };

const signedOnce = () =>
	sign(createEvolutionRequest(), {
		id: 's1',
		key: KEY,
		actor: noa,
		at: '2026-09-03T09:00:00Z',
		signedValue: VALUE
	});

describe('co-signing a field', () => {
	// edea831e: a second reviewer co-signs.
	it('lets a second reviewer co-sign, and both names stand on the value', () => {
		expect(canSign(nour, ok).ok).toBe(true);
		const twice = sign(signedOnce(), {
			id: 's2',
			key: KEY,
			actor: nour,
			at: '2026-09-03T10:00:00Z',
			signedValue: VALUE
		});
		expect(standingSignatures(twice, KEY, VALUE).map((s) => s.signerId)).toEqual(['noa', 'nour']);
		expect(signedBy(twice, KEY, VALUE, 'nour')).toBe(true);
	});

	// 901fd1d8: an AI client cannot sign.
	it('refuses an AI client', () => {
		expect(canSign(aiClient, ok).ok).toBe(false);
	});

	// d38f4375: no double signature.
	it('refuses a second signature by the same person on the same value', () => {
		expect(canSign(noa, { ...ok, alreadySignedByMe: true }).ok).toBe(false);
	});

	it('refuses to sign without the review right, an empty field, or an open question', () => {
		expect(canSign(noa, { ...ok, canReview: false }).ok).toBe(false);
		expect(canSign(noa, { ...ok, filled: false }).ok).toBe(false);
		expect(canSign(noa, { ...ok, openQuestion: true }).ok).toBe(false);
	});

	// b6ed4398: withdrawing leaves the other signatures standing.
	it('withdraws only your own signature; the others stay', () => {
		const twice = sign(signedOnce(), {
			id: 's2',
			key: KEY,
			actor: nour,
			at: '2026-09-03T10:00:00Z',
			signedValue: VALUE
		});
		expect(canWithdrawSignature(true).ok).toBe(true);
		const after = withdraw(twice, KEY, VALUE, 'nour');
		expect(standingSignatures(after, KEY, VALUE).map((s) => s.signerId)).toEqual(['noa']);
		expect(signedBy(after, KEY, VALUE, 'nour')).toBe(false);
	});

	// 1530036b: nobody removes someone else's signature.
	it('refuses to withdraw a signature you did not give', () => {
		expect(canWithdrawSignature(false).ok).toBe(false);
	});

	// e0ca9d52: a field signed by three people is still editable, and the edit voids the signatures.
	it('stays editable however many signed, and the edit voids every signature', () => {
		let r = signedOnce();
		r = sign(r, { id: 's2', key: KEY, actor: nour, at: '2026-09-03T10:00:00Z', signedValue: VALUE });
		expect(canEditSignedField(true).ok).toBe(true);
		const edited = voidSignaturesOnEdit(r, KEY, 'A new value', noa, '2026-09-03T11:00:00Z');
		expect(edited.voided).toBe(2);
		expect(standingSignatures(edited.request, KEY, 'A new value')).toHaveLength(0);
		// The history keeps who had signed which value: nothing is removed.
		expect(edited.request.fieldSignatures).toHaveLength(2);
		expect(edited.request.fieldSignatures.every((s) => s.voidedBy === 'noa')).toBe(true);
		// Even the editor must sign again.
		expect(signedBy(edited.request, KEY, 'A new value', 'noa')).toBe(false);
	});

	// 100a3414: a reader without write access cannot edit, signed or not.
	it('refuses an edit to a reader without write access', () => {
		expect(canEditSignedField(false).ok).toBe(false);
	});

	it('signatures stand on the current value or not at all', () => {
		const r = signedOnce();
		expect(signaturesStandOnCurrentValue(r, KEY, VALUE)).toBe(true);
		// The owning section moved the value under the signature: it no longer stands.
		expect(standingSignatures(r, KEY, 'moved elsewhere')).toHaveLength(0);
		expect(signaturesStandOnCurrentValue(r, KEY, 'moved elsewhere')).toBe(false);
		const settled = voidSignaturesOnEdit(r, KEY, 'moved elsewhere', nour, '2026-09-03T12:00:00Z');
		expect(signaturesStandOnCurrentValue(settled.request, KEY, 'moved elsewhere')).toBe(true);
	});
});
