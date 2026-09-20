import { describe, it, expect, vi } from 'vitest';
import { createEmptyFeaturesDraft, createCore, createFeature } from '$domain/features';
import { assertLeafIdsUnclaimed, type LeafIdGuardServices } from './features-leaf-id-guard.server';

const PID = 'p1';

function draftWith(ids: readonly string[]) {
	const draft = createEmptyFeaturesDraft(PID);
	const core = createCore({ id: 'core', name: 'Ops' });
	draft.cores = [core];
	draft.features = ids.map((id) => createFeature(core.id, null, { id, name: id }));
	return draft;
}

function services(known: readonly string[], holders: Record<string, readonly string[]>): {
	svc: LeafIdGuardServices;
	detect: ReturnType<typeof vi.fn>;
} {
	const detect = vi.fn(async (_p: string, id: string) => holders[id] ?? []);
	return {
		detect,
		svc: {
			loadFeaturesDraft: { execute: async () => draftWith(known) },
			detectFeatureIdCollision: { execute: detect }
		}
	};
}

describe('a leaf id another project holds is refused when it is claimed', () => {
	it('refuses the save and names the holders and a unique id', async () => {
		const { svc } = services([], { 'feature-search-browse': ['bighire', 'bigshield'] });
		await expect(
			assertLeafIdsUnclaimed(draftWith(['feature-search-browse']), svc, PID)
		).rejects.toMatchObject({
			status: 409,
			body: {
				message: expect.stringContaining('is also stored by bighire, bigshield')
			}
		});
	});

	it('lets an id nobody else holds through', async () => {
		const { svc } = services([], {});
		await expect(assertLeafIdsUnclaimed(draftWith(['p1-alerts']), svc, PID)).resolves.toBeUndefined();
	});

	it('checks only the leaves this save adds, so an autosave costs one scan per new leaf', async () => {
		const { svc, detect } = services(['kept-a', 'kept-b'], {});
		await assertLeafIdsUnclaimed(draftWith(['kept-a', 'kept-b', 'brand-new']), svc, PID);
		expect(detect).toHaveBeenCalledTimes(1);
		expect(detect).toHaveBeenCalledWith(PID, 'brand-new');
	});

	it('says nothing when the current draft cannot be read, rather than refusing a save', async () => {
		const svc: LeafIdGuardServices = {
			loadFeaturesDraft: { execute: async () => { throw new Error('store down'); } },
			detectFeatureIdCollision: { execute: async () => ['someone'] }
		};
		await expect(assertLeafIdsUnclaimed(draftWith(['x']), svc, PID)).resolves.toBeUndefined();
	});

	it('does nothing for a section with no leaves', async () => {
		const { svc, detect } = services([], {});
		await assertLeafIdsUnclaimed(createEmptyFeaturesDraft(PID), svc, PID);
		expect(detect).not.toHaveBeenCalled();
	});
});
