import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, createProposal, unvalidatedSpecSteps, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { act, given, owedWritten, stored, validatedBy } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Record that the steps of specification were validated"
 * (feature feat-lyriks-copy-a52881-31, surface 13e955f6, action 955e14e0) as
 * EVO-013 version 2 leaves it, run through the real door POST /api/evolution:
 * the validation of the last step moves the request into the Impact analysis
 * only when it carries a change and nothing waits for a signature.
 */

beforeEach(() => forgetShortMemos());

/** Need, Solution and Functional spec validated by the team; the Technical spec is the last step waiting. */
const lastStepWaiting = (over: Partial<EvolutionRequest> = {}): EvolutionRequest =>
	owedWritten({ stepValidations: [validatedBy('need'), validatedBy('solution'), validatedBy('functional_spec')], ...over });
const validateLast = { op: 'validate_step', step: 'technical_spec' };
const draft = createDraftLeaf({ id: 'draft:csv', kind: 'add', name: 'Export the list as CSV' });

describe('Record that the steps of specification were validated (955e14e0)', () => {
	it('Validating the last step opens the Impact analysis [unspa:13e955f6:955e14e0:bdcbd5a6]', async () => {
		const run = await act(given(), lastStepWaiting({ drafts: [draft] }), [validateLast]);
		expect(run.status).toBe('success');
		expect(unvalidatedSpecSteps(stored())).toEqual([]);
		expect(stored().stage).toBe('coherence');
	});

	it('A proposal waiting for a decision keeps the request in Specify [unspa:13e955f6:955e14e0:a7923153]', async () => {
		const run = await act(given(), lastStepWaiting({ drafts: [draft], proposals: [createProposal({ targetField: '00-need.measures', decision: 'pending' })] }), [validateLast]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('specification');
	});

	it('Validating the last step of a request that carries nothing keeps it in Specify [unspa:13e955f6:955e14e0:43eb5fc8]', async () => {
		const run = await act(given(), lastStepWaiting(), [validateLast]);
		expect(run.status).toBe('success');
		expect(unvalidatedSpecSteps(stored())).toEqual([]);
		expect(stored().stage).toBe('specification');
	});
});
