import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_READS } from '$domain/activity';
import { FIRST_FEED_QUERY } from '$domain/activity';

/** Two projects of two workspaces: the reader writes in the one that owns p-mine, reads only in the other. */
const owners = vi.hoisted(() => ({ 'p-mine': 'ws-writer', 'p-theirs': 'ws-viewer' }) as Record<string, string>);
const gate = vi.hoisted(() => ({ allows: vi.fn(async (_token: unknown, _door: unknown, workspaceId: unknown) => workspaceId === 'ws-writer') }));
const drift = vi.hoisted(() => vi.fn(async (_services: unknown, projectId: string) => [
	{ key: `action:${projectId}`, featureId: `f-${projectId}`, featureName: 'Checkout', shift: 'changed', elementLabel: 'Pay', specText: '', snippet: '', where: '', code: 'pay()', readAt: '2026-11-17T00:00:00.000Z', decision: null }
]));

vi.mock('./app-chrome-data.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('./app-chrome-data.server')>()),
	readerActivity: async () => ({
		me: 'reader@company.test',
		myName: 'Reader',
		roster: [],
		projects: ['p-mine', 'p-theirs'].map((id) => ({ project: { id, name: id }, reads: NO_READS, openDiscussions: 0, requests: [], keys: {}, events: [] }))
	})
}));
vi.mock('./spec-validation.server', () => ({ readSpecValidation: async () => ({ state: 'validated' }) }));
vi.mock('./spec-code-drift.server', () => ({ readDriftChanges: drift }));

import { readHomeFeedPage } from './home.server';

function event() {
	const cookies = new Map([['lyriks_session', 'jwt-1'], ['lyriks_active_ws', 'ws-viewer']]);
	return {
		locals: {
			authRequired: true,
			services: { roleGate: gate, backLinks: { find: async (id: string) => (owners[id] ? { backWorkspaceId: owners[id] } : null) } }
		},
		cookies: { get: (name: string) => cookies.get(name) }
	} as never;
}

beforeEach(() => {
	gate.allows.mockClear();
	drift.mockClear();
});

describe('Home: who is asked to decide a code change', () => {
	it('reads the write role of each project in the workspace that owns it, whatever the switcher shows', async () => {
		const page = await readHomeFeedPage(event(), FIRST_FEED_QUERY);
		// The switcher shows the workspace where the reader only reads: p-mine still brings its card, p-theirs none.
		expect(page.cards.map((card) => card.projectId)).toEqual(['p-mine']);
		expect(drift).toHaveBeenCalledTimes(1);
		expect(drift.mock.calls[0][1]).toBe('p-mine');
		expect(gate.allows.mock.calls.map((call) => call[2]).sort()).toEqual(['ws-viewer', 'ws-writer']);
	});
});
