import { describe, expect, it } from 'vitest';
import { withPendingStep, withPendingVerdict } from './optimistic-verdict';

const answer = (trail: Record<string, unknown>, openQuestion = false) => ({ path: '00-need.situation', value: 'Bags are never picked up.', filled: true, openQuestion, trail: { versionCount: 1, ...trail } as never });

describe('an act on an answer reads on its card at once [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	it('reads nothing new while nothing is pending', () => {
		const a = answer({ validation: 'unvalidated' });
		expect(withPendingVerdict(a, null, 'bo', 1)).toBe(a);
	});

	it('validates at once when one validation is enough, the reader among those who stand behind it', () => {
		expect(withPendingVerdict(answer({ validation: 'unvalidated' }), { act: 'validate' }, 'bo', 1).trail).toMatchObject({ validation: 'validated', validatedBy: ['bo'] });
	});

	it('counts the reader but waits for the others when the request asks for more', () => {
		expect(withPendingVerdict(answer({ validation: 'unvalidated', validatedBy: ['ada'] }), { act: 'validate' }, 'bo', 3).trail).toMatchObject({ validation: 'unvalidated', validatedBy: ['ada', 'bo'] });
		const named = answer({ validation: 'unvalidated', validatedBy: [], expected: ['bo', 'ada'], counted: 0 });
		expect(withPendingVerdict(named, { act: 'validate' }, 'bo', 1).trail).toMatchObject({ validation: 'unvalidated', counted: 1 });
	});

	it('shows a refusal with its reason, and a validation given after it standing', () => {
		expect(withPendingVerdict(answer({ validation: 'unvalidated' }), { act: 'refuse', reason: 'Too vague' }, 'bo', 1).trail).toMatchObject({ validation: 'refused', refusedBy: 'bo', refusalReason: 'Too vague' });
		const refused = answer({ validation: 'refused', refusedBy: 'ada', refusalReason: 'Too vague' });
		const after = withPendingVerdict(refused, { act: 'validate' }, 'bo', 1).trail as Record<string, unknown>;
		expect(after).toMatchObject({ validation: 'validated', validatedBy: ['bo'] });
		expect(after.refusedBy).toBeUndefined();
	});

	it('removes the reader\'s own verdict when they take it back, and nobody else\'s', () => {
		expect(withPendingVerdict(answer({ validation: 'validated', validatedBy: ['bo'] }), { act: 'withdraw' }, 'bo', 1).trail).toMatchObject({ validation: 'unvalidated', validatedBy: [] });
		expect(withPendingVerdict(answer({ validation: 'refused', refusedBy: 'bo', refusalReason: 'x' }), { act: 'withdraw' }, 'bo', 1).trail).toMatchObject({ validation: 'unvalidated' });
		expect(withPendingVerdict(answer({ validation: 'refused', refusedBy: 'ada', refusalReason: 'x' }), { act: 'withdraw' }, 'bo', 1).trail).toMatchObject({ validation: 'refused', refusedBy: 'ada' });
	});

	it('counts the reader as a person behind the answer for the step lock, their AI\'s mark gone', () => {
		const byAi = answer({ validation: 'validated', validatedBy: ['bo'], validatedByAi: ['bo'] });
		expect(withPendingVerdict(byAi, { act: 'validate' }, 'bo', 1).trail).toMatchObject({ humanValidated: true, validatedByAi: [] });
		// Taking it back leaves a person behind it only if one still is.
		const two = answer({ validation: 'validated', validatedBy: ['ada', 'bo'], humanValidated: true, validatedByAi: ['ada'] });
		expect(withPendingVerdict(two, { act: 'withdraw' }, 'bo', 1).trail).toMatchObject({ humanValidated: false, validatedBy: ['ada'] });
		const people = answer({ validation: 'validated', validatedBy: ['ada', 'bo'], humanValidated: true });
		expect(withPendingVerdict(people, { act: 'withdraw' }, 'bo', 1).trail).toMatchObject({ humanValidated: true });
	});

	it('shows the answer postponed at once, and answered again', () => {
		expect(withPendingVerdict(answer({ validation: 'unvalidated' }), { act: 'postpone' }, 'bo', 1).openQuestion).toBe(true);
		expect(withPendingVerdict(answer({ validation: 'unvalidated' }, true), { act: 'resume' }, 'bo', 1).openQuestion).toBe(false);
	});
});

describe('every Validate reads at once, before the server answers [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	const step = { step: 'functional_spec', validatedBy: ['ada'], validated: false };

	it('puts the reader behind a step validated as a whole, and takes them out again', () => {
		expect(withPendingStep(step, { act: 'validate' }, 'bo', 2)).toMatchObject({ validatedBy: ['ada', 'bo'], validated: true });
		expect(withPendingStep(step, { act: 'validate' }, 'bo', 3)).toMatchObject({ validated: false });
		expect(withPendingStep({ ...step, validatedBy: ['ada', 'bo'], validated: true }, { act: 'withdraw' }, 'bo', 2)).toMatchObject({ validatedBy: ['ada'], validated: false });
	});

	it('reads the step as the server said once nothing is pending, the save done or failed', () => {
		expect(withPendingStep(step, null, 'bo', 1)).toBe(step);
		expect(withPendingStep(step, { act: 'postpone' }, 'bo', 1)).toBe(step);
	});
});
