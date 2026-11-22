import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, act, given, mia, owedWritten, stored, validatedBy } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * "The request enters the Impact analysis on its own" (criterion ffa9927c of
 * feat-34, as EVO-011 version 2 rewords it), through the real door
 * POST /api/evolution: a written request still in Specify whose steps stand
 * validated but the last one enters the Impact analysis with the last
 * validation, the history naming who actually acted, and nothing freezes then.
 */

beforeEach(() => forgetShortMemos());

/** Written, carrying a change, sent back to Specify: only the last validation of its steps is missing. */
const lastStepToValidate = (): EvolutionRequest =>
	owedWritten({
		drafts: [createDraftLeaf({ id: 'draft:csv', kind: 'add', name: 'Export the list as CSV' })],
		stepDescriptions: { ...owedWritten().stepDescriptions, technical_spec: 'A CSV writer streams the rows.' },
		stepValidations: [validatedBy('need'), validatedBy('solution'), validatedBy('functional_spec')]
	});
const crossingInto = (stage: string) => stored().history.find((h) => h.type === 'stage_crossing' && h.summary === `Crossed into ${stage}`);

describe('The request enters the Impact analysis on its own [criterion:ffa9927c]', () => {
	it("the last validation a person gives moves the request into the Impact analysis without another click, naming that person, and freezes nothing [criterion:ffa9927c]", async () => {
		const run = await act(given(), lastStepToValidate(), [{ op: 'validate_step', step: 'technical_spec' }]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('coherence');
		expect(crossingInto('coherence')).toMatchObject({ authorId: mia.id, authorKind: 'person' });
		// The version freezes later, with the validation that leaves nothing of the Specification waiting.
		expect(stored()).toMatchObject({ frozen: false, specVersion: 0 });
	});

	it('the last validation the AI gives in the person\'s name moves it on too, the history keeping the AI an AI, and freezes nothing [criterion:ffa9927c]', async () => {
		const delegated = { ...lastStepToValidate(), aiDelegations: [{ personId: mia.id, at: '2026-11-20T08:00:00.000Z' }] };
		const run = await act(given({}, AI_CLIENT), delegated, [{ op: 'validate_step', step: 'technical_spec' }]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('coherence');
		expect(crossingInto('coherence')?.authorKind).toBe('ai_client');
		expect(stored()).toMatchObject({ frozen: false, specVersion: 0 });
	});

	it('a step left to validate keeps the request in Specify [criterion:ffa9927c]', async () => {
		const run = await act(given(), { ...lastStepToValidate(), stepValidations: [validatedBy('need'), validatedBy('solution')] }, [{ op: 'validate_step', step: 'technical_spec' }]);
		expect(run.status).toBe('success');
		expect(stored().stage).toBe('specification');
	});
});
