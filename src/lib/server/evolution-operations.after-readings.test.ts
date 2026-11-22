import { describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown, options: [] as unknown[] }));
vi.mock('./evolution-view.server', async (original) => ({
	...(await original<typeof import('./evolution-view.server')>()),
	loadEvolutionView: async (_services: unknown, _projectId: string, options?: unknown) => {
		scene.options.push(options);
		return scene.view;
	}
}));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
import type { EvolutionViewOptions } from './evolution-view.server';
import { batchScene, claude, requestAt } from './evolution-batch-scene.fixture';

/**
 * A batch answers with the cards of the requests it touched, read back off the
 * saved dossier. On a project carried through many requests, reading every
 * request's features and drafts again for those cards was most of an act's
 * time: the read back keeps the touched requests' readings alone.
 */
const s = batchScene(scene);

describe('the read back of a batch', () => {
	it('reads the readings of the requests it touched, not of the others', async () => {
		const touched = requestAt('specification', { id: 'r' });
		const other = requestAt('implementation', { id: 'o', leafIds: ['feat-9'] });
		s.show(touched, [], [other]);
		scene.options.length = 0;
		const outcome = await s.run([{ op: 'update_request', requestId: 'r', title: 'Keep a cart for a week' }], claude);
		expect(outcome.ok).toBe(true);
		const readBack = scene.options.at(-1) as EvolutionViewOptions | undefined;
		expect(readBack?.readingsOf?.([touched, other]).map((r) => r.id)).toEqual(['r']);
		expect(outcome.ok && outcome.requests.map((r) => r.id)).toEqual(['r']);
	});
});
