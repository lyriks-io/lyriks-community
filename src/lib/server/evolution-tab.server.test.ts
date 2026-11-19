import { beforeEach, describe, expect, it, vi } from 'vitest';

const impactPart = vi.fn((_request: unknown, opts?: { hypothesis?: string }, lang?: string) => ({
	impact: { hypothesis: opts?.hypothesis, lang }
}));
const views = vi.hoisted(() => ({ full: 0, board: 0 }));

vi.mock('./evolution-view.server', async () => {
	// A whole request, the way the parser hands it: the decision log reads every list it holds.
	const { createEvolutionRequest } = await import('$domain/evolution');
	return {
		ALL_ROWS: 1000,
		loadBoardView: vi.fn(async () => {
			views.board += 1;
			return { projectId: 'p', draft: { requests: [createEvolutionRequest({ id: 'r1', status: 'open', stage: 'specification' })] }, members: [], leaves: [] };
		}),
		boardCard: (_view: unknown, request: { id: string }) => ({ id: request.id }),
		loadEvolutionView: vi.fn(async () => (views.full += 1, {
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

/** The team server's record of where a project is registered; `backLinks` registers it nowhere. */
const owned = (workspaceId: string | null) => ({ find: async () => (workspaceId ? { backWorkspaceId: workspaceId } : null) });
const backLinks = owned(null);

describe('loadEvolutionTab', () => {
	beforeEach(() => {
		impactPart.mockClear();
		views.full = 0;
		views.board = 0;
	});

	it('reads the board from the requests alone, and a request or a comparison from the whole view', async () => {
		const services = { currentSession: () => ({ email: 'a@b.c' }), backLinks, resolveActiveMemberName: { execute: async () => 'Ana' } } as never;
		const cookies = { get: () => undefined } as never;
		const board = await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution'), cookies);
		expect(views).toEqual({ full: 0, board: 1 });
		expect(board.cards).toEqual([{ id: 'r1' }]);
		expect(board.reading).toBeNull();
		await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution&request=r1'), cookies);
		await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution&concurrent=r1'), cookies);
		expect(views).toEqual({ full: 2, board: 1 });
	});

	it('writes the three impact readings in the language the spec is written in', async () => {
		const services = { currentSession: () => ({ email: 'a@b.c' }), backLinks, resolveActiveMemberName: { execute: async () => 'Ana' } } as never;
		const cookies = { get: () => undefined } as never;
		const tab = await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution&request=r1'), cookies);
		expect(impactPart).toHaveBeenCalledTimes(3);
		for (const call of impactPart.mock.calls) expect(call[2]).toBe('fr');
		expect(tab.reading?.impacts.add).toEqual({ hypothesis: 'add', lang: 'fr' });
	});

	it('names the person acting the way the whole app names them, never by a technical id (ac-evo-form-names)', async () => {
		const services = { currentSession: () => ({}), backLinks, resolveActiveMemberName: { execute: async () => 'Alexis' } } as never;
		const tab = await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution'), { get: () => undefined } as never);
		expect(tab.members).toEqual([{ id: 'local-operator', name: 'Alexis', role: 'admin' }]);
	});

	it('names the person acting as the workspace that owns the project names them, never the switcher\'s', async () => {
		const execute = vi.fn(async (workspaceId: string | null) => (workspaceId === 'owning' ? 'Alexis' : 'Alex'));
		const services = { currentSession: () => ({ email: 'a@b.c' }), backLinks: owned('owning'), resolveActiveMemberName: { execute } } as never;
		const cookies = { get: (name: string) => (name === 'lyriks_active_ws' ? 'active' : undefined) } as never;
		const tab = await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution'), cookies);
		expect(execute).toHaveBeenCalledWith('owning');
		expect(tab.members).toEqual([{ id: 'a@b.c', name: 'Alexis', role: 'admin' }]);
	});

	it('names the person as the active workspace does for a project that belongs to none', async () => {
		const execute = vi.fn(async (_workspaceId: string | null) => 'Alex');
		const services = { currentSession: () => ({ email: 'a@b.c' }), backLinks, resolveActiveMemberName: { execute } } as never;
		const cookies = { get: (name: string) => (name === 'lyriks_active_ws' ? 'active' : undefined) } as never;
		await loadEvolutionTab(services, 'p', new URL('http://x/?tab=evolution'), cookies);
		expect(execute).toHaveBeenCalledWith('active');
	});
});
