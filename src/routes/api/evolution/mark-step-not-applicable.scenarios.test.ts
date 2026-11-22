import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unvalidatedSpecSteps } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, NOW, OUTSIDE, VIEWER, act, given, mia, owedWritten, stored, validatedBy } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Mark a step not applicable" (feature
 * feat-lyriks-copy-a52881-34, surface c91b0321, action 6446be32) run through
 * the real door POST /api/evolution with mark_step_not_applicable, the
 * operation the AI client and the API send (no page marks a step).
 */

beforeEach(() => forgetShortMemos());

const mark = (step: string, reason: string) => ({ op: 'mark_step_not_applicable', step, reason });
const lift = (step: string) => ({ op: 'mark_step_not_applicable', step, notApplicable: false });
const notApplicable = (step: string) => stored().skippedSteps.some((s) => s.step === step);
/** A step marked earlier, with its reason. */
const markedEarlier = (step: 'need' | 'functional_spec' | 'technical_spec') => ({ step, reason: 'Marked earlier.', by: mia.id, at: NOW });
const ONLY_TWO = 'Only Functional spec and Technical spec can be marked not applicable.';

describe('Mark a step not applicable (6446be32)', () => {
	it('The Technical spec does not apply [unspa:c91b0321:6446be32:c0d83602]', async () => {
		const run = await act(given(), owedWritten(), [mark('technical_spec', 'Only wording changes.')]);
		expect(run.status).toBe('success');
		expect(stored().skippedSteps).toMatchObject([{ step: 'technical_spec', reason: 'Only wording changes.', by: mia.id }]);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(3);
	});

	it('Marking the last step that waited lets the request move on [unspa:c91b0321:6446be32:a26ad9ef]', async () => {
		const waitingOne = owedWritten({ stepValidations: [validatedBy('need'), validatedBy('solution'), validatedBy('technical_spec')] });
		const run = await act(given(), waitingOne, [mark('functional_spec', 'No new behaviour.')]);
		expect(run.status).toBe('success');
		expect(unvalidatedSpecSteps(stored())).toEqual([]);
	});

	it('The mark is lifted [unspa:c91b0321:6446be32:cc192711]', async () => {
		const run = await act(given(), owedWritten({ skippedSteps: [markedEarlier('functional_spec')] }), [lift('functional_spec')]);
		expect(run.status).toBe('success');
		expect(notApplicable('functional_spec')).toBe(false);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(4);
	});

	it('A step does not apply without a reason [unspa:c91b0321:6446be32:bd2a2da0]', async () => {
		const run = await act(given(), owedWritten(), [mark('technical_spec', '')]);
		expect(run.refusal?.message).toBe('Say why this step does not apply.');
		expect(notApplicable('technical_spec')).toBe(false);
	});

	it.each([
		['Solution is never', 'a0ec24df', 'solution'],
		['Need is not', '219533e1', 'need']
	] as const)('The %s marked not applicable [unspa:c91b0321:6446be32:%s]', async (_name, _scenario, step) => {
		const run = await act(given(), owedWritten(), [mark(step, 'x')]);
		expect(run.refusal?.message).toBe(ONLY_TWO);
		expect(notApplicable(step)).toBe(false);
	});

	it('A Need marked earlier is lifted [unspa:c91b0321:6446be32:c5f36b45]', async () => {
		const run = await act(given(), owedWritten({ skippedSteps: [markedEarlier('need')] }), [lift('need')]);
		expect(run.status).toBe('success');
		expect(notApplicable('need')).toBe(false);
	});

	it('In a team an AI marks no step [unspa:c91b0321:6446be32:1fdc0266]', async () => {
		const run = await act(given({}, AI_CLIENT), owedWritten(), [mark('technical_spec', 'x')]);
		expect(run.refusal?.message).toBe('An AI client cannot mark a step not applicable.');
		expect(notApplicable('technical_spec')).toBe(false);
	});

	it('A viewer marks no step [unspa:c91b0321:6446be32:617e4247]', async () => {
		const run = await act(given({}, VIEWER), owedWritten(), [mark('technical_spec', 'x')]);
		expect(run.refusal?.status).toBe(403);
		expect(notApplicable('technical_spec')).toBe(false);
	});

	it('Outside the workspace the mark answers not found [unspa:c91b0321:6446be32:6adde001]', async () => {
		const run = await act(given({}, OUTSIDE), owedWritten(), [mark('technical_spec', 'x')]);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it.each([
		['deleted', '631e1701', 'This request is deleted.'],
		['closed', '98731d7a', 'This request is closed.'],
		['cancelled', 'ea3db3ff', 'This request is cancelled: reopen it first.']
	] as const)('A %s request keeps its steps [unspa:c91b0321:6446be32:%s]', async (status, _scenario, message) => {
		const run = await act(given(), owedWritten({ status }), [mark('technical_spec', 'x')]);
		expect(run.refusal?.message).toBe(message);
		expect(notApplicable('technical_spec')).toBe(false);
	});

	it('Without sign-in the change still refuses a viewer the mark [unspa:c91b0321:6446be32:ed09bb9b]', async () => {
		const run = await act(given({ 'installation.signInRequired': false }, VIEWER), owedWritten(), [mark('technical_spec', 'x')]);
		expect(run.refusal?.message).toBe('A viewer cannot mark a step not applicable.');
	});
});
