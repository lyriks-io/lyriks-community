import { beforeEach, describe, expect, it, vi } from 'vitest';

const impactPart = vi.fn((_request: unknown, opts?: { hypothesis?: string }, lang?: string) => ({
	impact: { hypothesis: opts?.hypothesis, lang }
}));

vi.mock('./evolution-view.server', async () => {
	// A whole request, the way the parser hands it: the decision log reads every list it holds.
	const { createEvolutionRequest } = await import('$domain/evolution');
	return {
		ALL_ROWS: 1000,
		loadEvolutionView: vi.fn(async () => ({
			language: 'fr',
			draft: { requests: [createEvolutionRequest({ id: 'r1', status: 'open', stage: 'specification' })] },
			members: [],
			leaves: [],
			sources: [],
			revision: 1,
			held: [],
			coverage: null,
			filled: null,
			readings: {}
		})),
		requestSummary: () => ({}),
		fieldsPart: () => ({ fields: { entries: [] } }),
		proposalsPart: () => ({ proposals: { entries: [] } }),
		impactPart: (...args: unknown[]) => impactPart(...(args as Parameters<typeof impactPart>)),
		proposedKinds: () => [],
		reportPart: () => ({ report: null }),
		historyPart: () => ({ history: [] }),
		suggestionCards: () => [],
		requestCard: () => ({})
	};
});
vi.mock('./evolution-actor.server', () => ({ resolveRole: async () => 'admin' }));

const { loadEvolutionTab } = await import('./evolution-tab.server');

describe('loadEvolutionTab', () => {
	beforeEach(() => impactPart.mockClear());

	it('writes the three impact readings in the language the spec is written in', async () => {
		const services = { currentSession: () => ({ email: 'a@b.c' }), resolveActiveMemberName: { execute: async () => 'Ana' } } as never;
		const cookies = { get: () => undefined } as never;
		const tab = await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution&request=r1'), cookies);
		expect(impactPart).toHaveBeenCalledTimes(3);
		for (const call of impactPart.mock.calls) expect(call[2]).toBe('fr');
		expect(tab.reading?.impacts.add).toEqual({ hypothesis: 'add', lang: 'fr' });
	});

	it('names the person acting the way the whole app names them, never by a technical id (ac-evo-form-names)', async () => {
		const services = { currentSession: () => ({}), resolveActiveMemberName: { execute: async () => 'Alexis' } } as never;
		const tab = await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution'), { get: () => undefined } as never);
		expect(tab.members).toEqual([{ id: 'local-operator', name: 'Alexis', role: 'admin' }]);
	});
});
