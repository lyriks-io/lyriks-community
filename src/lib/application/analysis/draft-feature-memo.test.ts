import { describe, expect, it, vi } from 'vitest';
import { DraftFeatureMemo, type DraftTarget, type StoredDraftWalks } from './draft-feature-memo';

const model = {
	operations: [{ kind: 'add_surface', ref: 's', name: 'S', type: 'screen', description: 'x' }],
	mintedIds: ['aaaa1111'],
	updatedAt: '2026-09-25T10:00:00.000Z'
};
const amend: DraftTarget = { kind: 'draft', draftId: 'draft:a', draftKind: 'amend', name: '', requestId: 'r', baseLeafId: 'feat-cart', model, frozen: false };
const addition: DraftTarget = { ...amend, draftId: 'draft:new', draftKind: 'add', baseLeafId: null };
const walking = () =>
	vi.fn().mockImplementation(async (target: DraftTarget) => ({
		kind: 'walk',
		walk: { ok: true, persisted: false, featureId: target.draftId, feature: { id: target.draftId, surfaces: [] }, batch: { created: [1, 2] } }
	}));
const memoryStore = (initial: Record<string, StoredDraftWalks> = {}) => {
	const docs = new Map(Object.entries(initial));
	return {
		docs,
		load: vi.fn(async (projectId: string) => docs.get(projectId) ?? null),
		save: vi.fn(async (projectId: string, data: StoredDraftWalks) => void docs.set(projectId, structuredClone(data)))
	};
};

describe('DraftFeatureMemo', () => {
	it('computes a draft once while its model and its base feature are unchanged, and readers at once share the call', async () => {
		const compute = walking();
		const memo = new DraftFeatureMemo(compute, { featureFingerprint: () => 'base-1' });
		await Promise.all([memo.walk('p', amend), memo.walk('p', amend)]);
		await memo.walk('p', amend);
		expect(compute).toHaveBeenCalledTimes(1);
	});

	it('computes again when the base feature, the model, the engine or the project changes, and only then', async () => {
		const compute = walking();
		let base = 'base-1';
		const memo = new DraftFeatureMemo(compute, { featureFingerprint: () => base });
		await memo.walk('p', amend);
		base = 'base-2';
		await memo.walk('p', amend);
		await memo.walk('p', { ...amend, model: { ...model, operations: [...model.operations, { kind: 'add_action', ref: 'x' }] } });
		await memo.walk('q', amend);
		expect(compute).toHaveBeenCalledTimes(4);
		await new DraftFeatureMemo(compute, { featureFingerprint: () => base, engine: 'unspaghettit@2' }).walk('p', amend);
		expect(compute).toHaveBeenCalledTimes(5);
	});

	it('keys an addition on its model alone: it replays over an empty feature', async () => {
		const compute = walking();
		const fingerprint = vi.fn(() => null);
		const memo = new DraftFeatureMemo(compute, { featureFingerprint: fingerprint });
		await memo.walk('p', addition);
		await memo.walk('p', addition);
		expect(compute).toHaveBeenCalledTimes(1);
		expect(fingerprint).not.toHaveBeenCalled();
	});

	it('hands back the verdict and the feature, not the batch report, each reader its own copy', async () => {
		const memo = new DraftFeatureMemo(walking(), { featureFingerprint: () => 'base-1' });
		type Read = { walk: { feature: { surfaces: unknown[] }; batch?: unknown } };
		const first = (await memo.walk('p', amend)) as unknown as Read;
		expect(first.walk.batch).toBeUndefined();
		first.walk.feature.surfaces.push('changed');
		const second = (await memo.walk('p', amend)) as unknown as Read;
		expect(second.walk.feature.surfaces).toEqual([]);
	});

	it('keeps nothing when the base feature cannot be read, nor an engine that did not answer or refused', async () => {
		const unreadable = walking();
		const noBase = new DraftFeatureMemo(unreadable, { featureFingerprint: () => null });
		await noBase.walk('p', amend);
		await noBase.walk('p', amend);
		expect(unreadable).toHaveBeenCalledTimes(2);

		const failing = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ kind: 'refused', error: 'busy' })
			.mockRejectedValueOnce(new Error('down'))
			.mockResolvedValue({ kind: 'walk', walk: { ok: true } });
		const memo = new DraftFeatureMemo(failing, { featureFingerprint: () => 'base-1' });
		expect(await memo.walk('p', amend)).toBeNull();
		expect(await memo.walk('p', amend)).toEqual({ kind: 'refused', error: 'busy' });
		await expect(memo.walk('p', amend)).rejects.toThrow('down');
		await memo.walk('p', amend);
		await memo.walk('p', amend);
		expect(failing).toHaveBeenCalledTimes(4);
	});

	it('keeps computed drafts across a restart, and computes again one whose inputs moved', async () => {
		const store = memoryStore();
		const before = walking();
		const first = new DraftFeatureMemo(before, { featureFingerprint: () => 'base-1', store, now: () => '2026-11-19T10:00:00.000Z' });
		await Promise.all([first.walk('p', amend), first.walk('p', addition)]);
		await vi.waitFor(() => expect(Object.keys(store.docs.get('p')?.entries ?? {})).toHaveLength(2));

		// A new process: nothing in memory, the store answers.
		const after = walking();
		const restarted = new DraftFeatureMemo(after, { featureFingerprint: () => 'base-1', store });
		const answer = await restarted.walk('p', amend);
		await restarted.walk('p', addition);
		expect(after).not.toHaveBeenCalled();
		expect(answer).toMatchObject({ kind: 'walk', walk: { ok: true, feature: { id: 'draft:a' } } });
		expect(store.load).toHaveBeenCalledTimes(2);

		const moved = new DraftFeatureMemo(after, { featureFingerprint: () => 'base-2', store });
		await moved.walk('p', amend);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it('reads through a broken store and keeps answering', async () => {
		const compute = walking();
		const onStoreError = vi.fn();
		const store = { load: vi.fn().mockRejectedValue(new Error('db down')), save: vi.fn().mockRejectedValue(new Error('db down')) };
		const memo = new DraftFeatureMemo(compute, { featureFingerprint: () => 'base-1', store, onStoreError });
		expect(await memo.walk('p', amend)).toMatchObject({ kind: 'walk' });
		await vi.waitFor(() => expect(onStoreError).toHaveBeenCalledTimes(2));
		expect(compute).toHaveBeenCalledTimes(1);
	});

	it('ignores a stored entry that does not read as a computed draft', async () => {
		const store = memoryStore({ p: { entries: { 'draft:a': { inputs: 42, at: 'x', result: null } as never } } });
		const compute = walking();
		await new DraftFeatureMemo(compute, { featureFingerprint: () => 'base-1', store }).walk('p', amend);
		expect(compute).toHaveBeenCalledTimes(1);
	});

	it('keeps the most recent drafts within its bounds, in memory and in the store', async () => {
		const compute = walking();
		const store = memoryStore();
		let clock = 0;
		const memo = new DraftFeatureMemo(compute, {
			featureFingerprint: () => 'base-1',
			kept: 2,
			store,
			storedPerProject: 2,
			now: () => new Date(Date.UTC(2026, 10, 19, 0, 0, clock++)).toISOString()
		});
		const draft = (id: string) => ({ ...amend, draftId: id });
		await memo.walk('p', draft('draft:a'));
		await memo.walk('p', draft('draft:b'));
		await memo.walk('p', draft('draft:a'));
		await memo.walk('p', draft('draft:c'));
		expect(compute).toHaveBeenCalledTimes(3);
		await vi.waitFor(() => expect(Object.keys(store.docs.get('p')?.entries ?? {}).sort()).toEqual(['draft:b', 'draft:c']));
	});
});
