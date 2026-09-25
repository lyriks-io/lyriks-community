import { describe, expect, it, vi } from 'vitest';

/** The composition root, with a skill catalog whose sync the tests read back. */
const services = vi.hoisted(() => ({
	skillCatalog: { syncSkills: vi.fn((..._args: unknown[]) => ({ skills: [], unknown: [] })) }
}));
vi.mock('$composition/container.server', () => ({ getServices: () => services }));

import { POST } from './+server';

type Event = Parameters<typeof POST>[0];
const post = (body: unknown) => POST({ request: new Request('http://x/api/skills/sync', { method: 'POST', body: JSON.stringify(body) }) } as unknown as Event);

async function status(body: unknown): Promise<number> {
	try {
		return (await post(body)).status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

describe('POST /api/skills/sync (installedTools)', () => {
	it('hands the well-formed binding files the client holds to the catalog, and drops the rest', async () => {
		await post({
			client: 'claude',
			installedTools: [
				{ path: '.lyriks/tools/sync-index.mjs', contentHash: '1a2b3c4d' },
				{ path: '.claude/hooks/lyriks-bound-prompt.mjs' },
				{ contentHash: 'no-path' },
				'garbage'
			]
		});
		expect(services.skillCatalog.syncSkills).toHaveBeenLastCalledWith([], 'claude', undefined, {
			skillIds: undefined,
			includeContent: undefined,
			installedTools: [
				{ path: '.lyriks/tools/sync-index.mjs', contentHash: '1a2b3c4d' },
				{ path: '.claude/hooks/lyriks-bound-prompt.mjs', contentHash: undefined }
			]
		});
	});

	it('sends an empty list when the client says nothing (every file comes back whole), and refuses a non-list', async () => {
		await post({});
		expect(services.skillCatalog.syncSkills.mock.lastCall?.[3]).toMatchObject({ installedTools: [] });
		expect(await status({ installedTools: 'all of them' })).toBe(400);
	});
});
