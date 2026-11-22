import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldValidationOf, isStepValidated, unvalidatedSpecSteps, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, NOW, OUTSIDE, VIEWER, act, given, mia, owedWritten, send, seed, stored, type State } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Take back my verdict on an answer" (feature
 * feat-lyriks-copy-a52881-34, surface c91b0321, action 74c6e74a) run through
 * the real door POST /api/evolution with withdraw_field_verdict, the
 * operation the section's "click to withdraw" and the AI client send. Every
 * verdict taken back was given through the same door first.
 */

beforeEach(() => forgetShortMemos());

const SITUATION = '00-need.situation';
const OBJECTIVES = '00-need.objectives';
const withdraw = { op: 'withdraw_field_verdict', fieldPath: OBJECTIVES };
const refuse = { op: 'refuse_field', fieldPath: OBJECTIVES, reason: 'The objectives are not measurable.' };
const answer = () => fieldValidationOf(stored(), OBJECTIVES);
const myVerdicts = () => stored().fieldValidations.filter((v) => v.key === OBJECTIVES && v.by === mia.id);
const delegated = (over: Partial<EvolutionRequest> = {}) => owedWritten({ aiDelegations: [{ personId: mia.id, at: NOW }], ...over });

/** The caller refused the objectives on an open request; the scenario's Given then holds over it. */
async function refusedThen(s: State, over: Partial<EvolutionRequest> = {}) {
	expect((await act(given(), owedWritten(), [refuse])).status).toBe('success');
	seed(s, { ...stored(), ...over });
	return send([withdraw]);
}

describe('Take back my verdict on an answer (74c6e74a)', () => {
	it('A designer takes back their validation [unspa:c91b0321:74c6e74a:886ba848]', async () => {
		expect((await act(given(), owedWritten(), [{ op: 'validate_field', fieldPath: SITUATION }, { op: 'validate_field', fieldPath: OBJECTIVES }])).status).toBe('success');
		expect(isStepValidated(stored(), 'need')).toBe(true);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(3);
		const run = await send([withdraw]);
		expect(run.status).toBe('success');
		expect(myVerdicts()).toEqual([]);
		expect(answer().validations).toHaveLength(0);
		expect(answer().status).not.toBe('validated');
		expect(isStepValidated(stored(), 'need')).toBe(false);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(4);
	});

	it('A designer takes back their refusal [unspa:c91b0321:74c6e74a:9a56cf13]', async () => {
		const run = await refusedThen(given());
		expect(run.status).toBe('success');
		expect(myVerdicts()).toEqual([]);
	});

	it('Nothing to take back without a verdict [unspa:c91b0321:74c6e74a:4a760999]', async () => {
		const run = await act(given(), owedWritten(), [withdraw]);
		expect(run.refusal?.message).toBe('You gave no verdict on this answer.');
	});

	it("A delegated AI cannot take back its person's own validation [unspa:c91b0321:74c6e74a:0ceeb576]", async () => {
		expect((await act(given(), delegated(), [{ op: 'validate_field', fieldPath: OBJECTIVES }])).status).toBe('success');
		seed(given({}, AI_CLIENT), stored());
		const run = await send([withdraw]);
		expect(run.refusal?.message).toBe('Only the person takes back a verdict they gave themselves.');
		expect(answer().status).toBe('validated');
	});

	it('A delegated AI takes back what it validated [unspa:c91b0321:74c6e74a:a0230926]', async () => {
		expect((await act(given({}, AI_CLIENT), delegated(), [{ op: 'validate_field', fieldPath: OBJECTIVES }])).status).toBe('success');
		expect(myVerdicts()).toMatchObject([{ byKind: 'ai_client', delegated: true }]);
		const run = await send([withdraw]);
		expect(run.status).toBe('success');
		expect(answer().status).not.toBe('validated');
	});

	it('In a team an AI takes back nothing on its own account [unspa:c91b0321:74c6e74a:1000f9dc]', async () => {
		expect((await act(given(), owedWritten(), [{ op: 'validate_field', fieldPath: OBJECTIVES }])).status).toBe('success');
		seed(given({}, AI_CLIENT), stored());
		const run = await send([withdraw]);
		expect(run.refusal?.message).toBe('An AI client cannot take back a verdict.');
		expect(answer().status).toBe('validated');
	});

	it('Outside the workspace the withdrawal answers not found [unspa:c91b0321:74c6e74a:4a967aff]', async () => {
		const run = await refusedThen(given({}, OUTSIDE));
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('A viewer takes back no verdict [unspa:c91b0321:74c6e74a:05b13ff8]', async () => {
		const run = await refusedThen(given({}, VIEWER));
		expect(run.refusal?.status).toBe(403);
		expect(myVerdicts()).toMatchObject([{ verdict: 'refused' }]);
	});

	it.each([
		['closed', '6a18242a', 'This request is closed.'],
		['deleted', '927c784f', 'This request is deleted.'],
		['cancelled', 'f85fd9fc', 'This request is cancelled: reopen it first.']
	] as const)('A %s request keeps its verdicts [unspa:c91b0321:74c6e74a:%s]', async (status, _scenario, message) => {
		const run = await refusedThen(given(), { status });
		expect(run.refusal?.message).toBe(message);
		expect(myVerdicts()).toMatchObject([{ verdict: 'refused' }]);
	});
});
