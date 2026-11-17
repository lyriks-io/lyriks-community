import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/evolution-tab.server', () => ({ loadEvolutionTab: vi.fn(async () => ({ reading: null })) }));

import { loadEvolutionTab } from '$lib/server/evolution-tab.server';
import { load } from './+page.server';

const services = (edition: string | undefined) => ({
	installEdition: () => edition,
	loadFoundationDraft: { loadIdentity: async () => ({ productName: 'Acme', industry: '' }) },
	loadUsersDraft: { execute: async () => ({ roles: [] }) },
	currentSession: () => null
});

const event = (edition: string | undefined) =>
	({
		params: { projectId: 'p1' },
		url: new URL('http://x/projects/p1/evolution'),
		depends: () => {},
		cookies: { get: () => undefined },
		locals: { services: services(edition) }
	}) as unknown as Parameters<typeof load>[0];

describe('the Evolution page on Community (EVO-001)', () => {
	it('opens locked and reads nothing of the Evolutions', async () => {
		vi.mocked(loadEvolutionTab).mockClear();
		const data = (await load(event('community'))) as { locked: boolean; productName: string };
		expect(data).toMatchObject({ locked: true, productName: 'Acme' });
		expect(loadEvolutionTab).not.toHaveBeenCalled();
	});

	it('reads the board on every other edition', async () => {
		const data = (await load(event('enterprise'))) as { locked: boolean };
		expect(data.locked).toBe(false);
		expect(loadEvolutionTab).toHaveBeenCalled();
	});
});
