import { describe, expect, it } from 'vitest';
import { createEmptyBaselinesDraft, type Baseline, type ProjectBaselinesDraft } from '$domain/baselines';
import type { SectionDraftRepositoryPort } from '../ports';
import { CaptureBaselineUseCase } from './capture-baseline';

const NOW = '2026-11-18T09:00:00.000Z';
const earlier: Baseline = { id: 'b0', name: 'Specification 360° of Ledger', createdAt: '2026-10-01T00:00:00.000Z' };

/** The baselines of project p1, its next save answering `revision` (null: changed elsewhere). */
class BaselineStore implements SectionDraftRepositoryPort<ProjectBaselinesDraft> {
	saved: ProjectBaselinesDraft | null = null;
	constructor(private readonly revision: number | null = 2) {}
	async load() {
		return { ...createEmptyBaselinesDraft('p1'), baselines: [earlier] };
	}
	async save(draft: ProjectBaselinesDraft) {
		if (this.revision === null) return null;
		this.saved = draft;
		return this.revision;
	}
	async currentRevision() {
		return 1;
	}
}

function capture(store = new BaselineStore()) {
	const useCase = new CaptureBaselineUseCase(store, { nowIso: () => NOW });
	return { run: (name: string) => useCase.execute('p1', name, { expectedRevision: 1, origin: null }), store };
}

describe('recording the baseline of a milestone', () => {
	it('keeps its name and its moment, nothing else, newest first [criterion:1eb35bd3]', async () => {
		const { run, store } = capture();
		const result = await run('EVO-016 closed');
		expect(result?.revision).toBe(2);
		const [baseline, ...rest] = store.saved?.baselines ?? [];
		expect(rest).toEqual([earlier]);
		expect(Object.keys(baseline).sort()).toEqual(['createdAt', 'id', 'name']);
		expect(baseline).toMatchObject({ name: 'EVO-016 closed', createdAt: NOW });
		expect(store.saved?.lastSavedAt).toBe(NOW);
	});

	it('answers nothing when the baselines changed since they were read', async () => {
		const { run } = capture(new BaselineStore(null));
		expect(await run('EVO-016 closed')).toBeNull();
	});
});
