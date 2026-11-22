import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldValidationOf, isStepValidated, unvalidatedSpecSteps } from '$domain/evolution';
import { inputValidation } from '$lib/server/evolution-view.server';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { act, dossierView, given, owedWritten, send, stored } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenario of "Record that the answer was rewritten" (feature
 * feat-lyriks-copy-a52881-34, surface c91b0321, action 72141c7d), the reaction
 * to an answer written: a new value of a validated answer of the Need, sent
 * through the real door POST /api/evolution with update_need, asks for its
 * validation again and reopens the Need.
 */

beforeEach(() => forgetShortMemos());

const OBJECTIVES = '00-need.objectives';

describe('Record that the answer was rewritten (72141c7d)', () => {
	it('A rewritten answer is validated again [unspa:c91b0321:72141c7d:b46cf99f]', async () => {
		expect((await act(given(), owedWritten(), [{ op: 'validate_field', fieldPath: '00-need.situation' }, { op: 'validate_field', fieldPath: OBJECTIVES }])).status).toBe('success');
		expect(isStepValidated(stored(), 'need')).toBe(true);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(3);
		const run = await send([{ op: 'update_need', objectives: 'The list exports as CSV in one click.' }]);
		expect(run.status).toBe('success');
		const live = stored().need.objectives;
		expect(fieldValidationOf(stored(), OBJECTIVES, live).status).not.toBe('validated');
		expect(fieldValidationOf(stored(), OBJECTIVES, live).validations).toHaveLength(0);
		expect(isStepValidated(stored(), 'need')).toBe(false);
		const tally = inputValidation(dossierView() as never, stored(), 'need');
		expect(tally.total - tally.validated).toBe(1);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(4);
	});
});
