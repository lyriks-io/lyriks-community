import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, createProposal } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, act, given, owedWritten, stored } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Enter the Impact analysis once the specification is
 * written" (feature feat-lyriks-copy-a52881-31, surface 13e955f6, action
 * 8cb6700b) as EVO-013 version 2 leaves it, run through the real door
 * POST /api/evolution: the write that makes a request owe nothing more, and
 * carry a change, moves it on its own.
 */

beforeEach(() => forgetShortMemos());

const draft = createDraftLeaf({ id: 'draft:csv', kind: 'add', name: 'Export the list as CSV' });
const solutionMissing = () => {
	const base = owedWritten({ drafts: [draft] });
	return { ...base, stepDescriptions: { ...base.stepDescriptions, solution: '' } };
};
const writeSolution = { op: 'update_step_description', step: 'solution', description: 'An Export button writes the list as CSV.' };

describe('Enter the Impact analysis once the specification is written (8cb6700b)', () => {
	it('Writing the last text opens the Impact analysis [unspa:13e955f6:8cb6700b:94e3ae86]', async () => {
		const run = await act(given(), solutionMissing(), [writeSolution]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('coherence');
		// No step is validated: nobody had to.
		expect(stored().stepValidations.every((v) => v.validations.length === 0)).toBe(true);
	});

	it('An AI writing the last text in a team moves the request on too [unspa:13e955f6:8cb6700b:d8fddaee]', async () => {
		// In a team the AI writes no step text; what it writes last here is the request's first change.
		const run = await act(given({}, AI_CLIENT), owedWritten(), [{ op: 'add_draft_leaf', kind: 'add', name: 'Export the list as CSV' }]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('coherence');
		expect(stored().history.find((h) => h.type === 'stage_crossing' && h.summary.includes('coherence'))?.authorKind).toBe('ai_client');
	});

	it('A proposal waiting keeps the written request in Specify [unspa:13e955f6:8cb6700b:26c9ecd5]', async () => {
		const waiting = { ...solutionMissing(), proposals: [createProposal({ targetField: '00-need.measures', decision: 'pending' })] };
		const run = await act(given(), waiting, [writeSolution]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('specification');
	});

	it('A cancelled request stays where it was [unspa:13e955f6:8cb6700b:c25d0ba0]', async () => {
		const run = await act(given(), { ...solutionMissing(), status: 'cancelled' }, [writeSolution]);
		expect(run.refusal?.message).toBe('This request is cancelled: reopen it first.');
		expect(stored().stage).toBe('specification');
	});

	it('A request that carries nothing stays in Specify [unspa:13e955f6:8cb6700b:1c985ce8]', async () => {
		const base = owedWritten();
		const run = await act(given(), { ...base, stepDescriptions: { ...base.stepDescriptions, solution: '' } }, [writeSolution]);
		expect(run.status).toBe('success');
		expect(stored().stepDescriptions.solution).toBe('An Export button writes the list as CSV.');
		expect(stored().stage).toBe('specification');
	});
});
