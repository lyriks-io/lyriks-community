import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStepValidated, unvalidatedSpecSteps, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, NOW, OUTSIDE, VIEWER, act, given, mia, owedWritten, send, stored, validatedBy } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Take back my validation of a step" (feature
 * feat-lyriks-copy-a52881-34, surface c91b0321, action 3653ddf6) run through
 * the real door POST /api/evolution with withdraw_step_validation, the
 * operation the section's "click to withdraw" and the AI client send.
 */

beforeEach(() => forgetShortMemos());

const withdraw = (step: string) => ({ op: 'withdraw_step_validation', step });
const validationsOf = (step: string) => stored().stepValidations.find((v) => v.step === step)?.validations ?? [];
const delegated = (over: Partial<EvolutionRequest> = {}) => owedWritten({ aiDelegations: [{ personId: mia.id, at: NOW }], ...over });
/** The Functional spec, validated by the caller alone. */
const mine = (over: Partial<EvolutionRequest> = {}) => owedWritten({ stepValidations: [validatedBy('functional_spec', mia.id)], ...over });

describe('Take back my validation of a step (3653ddf6)', () => {
	it('A designer takes back their validation of the Functional spec [unspa:c91b0321:3653ddf6:7de1760e]', async () => {
		const seeded = mine();
		expect(unvalidatedSpecSteps(seeded)).toHaveLength(3);
		const run = await act(given(), seeded, [withdraw('functional_spec')]);
		expect(run.status).toBe('success');
		expect(isStepValidated(stored(), 'functional_spec')).toBe(false);
		expect(validationsOf('functional_spec').some((v) => v.by === mia.id)).toBe(false);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(4);
	});

	it('Another validation keeps the step standing [unspa:c91b0321:3653ddf6:63e650d2]', async () => {
		const both = validatedBy('functional_spec', mia.id);
		const two = owedWritten({ stepValidations: [{ ...both, validations: [...both.validations, ...validatedBy('functional_spec').validations] }] });
		const run = await act(given(), two, [withdraw('functional_spec')]);
		expect(run.status).toBe('success');
		expect(isStepValidated(stored(), 'functional_spec')).toBe(true);
		expect(validationsOf('functional_spec')).toHaveLength(1);
	});

	it('Nothing to take back without a validation [unspa:c91b0321:3653ddf6:2634c17a]', async () => {
		const run = await act(given(), owedWritten(), [withdraw('functional_spec')]);
		expect(run.refusal?.message).toBe('You have not validated this step.');
	});

	it("A delegated AI keeps its person's own validation [unspa:c91b0321:3653ddf6:075147ee]", async () => {
		const run = await act(given({}, AI_CLIENT), mine({ aiDelegations: [{ personId: mia.id, at: NOW }] }), [withdraw('functional_spec')]);
		expect(run.refusal?.message).toBe('Only the person takes back a validation they gave themselves.');
		expect(isStepValidated(stored(), 'functional_spec')).toBe(true);
	});

	it('A delegated AI takes back its own validation [unspa:c91b0321:3653ddf6:3a0d74a8]', async () => {
		// The AI validated the Technical spec in the person's name, through the same door.
		expect((await act(given({}, AI_CLIENT), delegated(), [{ op: 'validate_step', step: 'technical_spec' }])).status).toBe('success');
		expect(validationsOf('technical_spec')).toMatchObject([{ by: mia.id, kind: 'ai_client' }]);
		const run = await send([withdraw('technical_spec')]);
		expect(run.status).toBe('success');
		expect(isStepValidated(stored(), 'technical_spec')).toBe(false);
	});

	it('In a team an AI withdraws nothing on its own account [unspa:c91b0321:3653ddf6:a0b712f6]', async () => {
		const run = await act(given({}, AI_CLIENT), mine(), [withdraw('functional_spec')]);
		expect(run.refusal?.message).toBe('An AI client cannot withdraw a validation.');
		expect(isStepValidated(stored(), 'functional_spec')).toBe(true);
	});

	it('Outside the workspace a withdrawal answers not found [unspa:c91b0321:3653ddf6:0e34e707]', async () => {
		const run = await act(given({}, OUTSIDE), mine(), [withdraw('functional_spec')]);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('A viewer takes back no step validation [unspa:c91b0321:3653ddf6:ba0a366f]', async () => {
		const run = await act(given({}, VIEWER), mine(), [withdraw('functional_spec')]);
		expect(run.refusal?.status).toBe(403);
		expect(isStepValidated(stored(), 'functional_spec')).toBe(true);
	});

	it.each([
		['deleted', 'fb4a5851', 'This request is deleted.'],
		['closed', '6f1c4afb', 'This request is closed.'],
		['cancelled', '1cf59316', 'This request is cancelled: reopen it first.']
	] as const)('A %s request keeps its step validations [unspa:c91b0321:3653ddf6:%s]', async (status, _scenario, message) => {
		const run = await act(given(), mine({ status }), [withdraw('functional_spec')]);
		expect(run.refusal?.message).toBe(message);
		expect(isStepValidated(stored(), 'functional_spec')).toBe(true);
	});
});
