import { describe, expect, it, vi } from 'vitest';
import { emptyRetrospecDocument, type RetrospecDocument } from '$domain/retrospec';
import type { Baseline } from '$domain/baselines';
const { doc } = vi.hoisted(() => ({ doc: { current: null as unknown } }));
vi.mock('$application/retrospec/retrospec-store', () => ({ loadRetrospecDocument: async () => ({ doc: doc.current, revision: 1 }) }));
const { saveBaselineEdits } = await import('./baselines-save.server');

const captured = (id: string): Baseline => ({ id, name: id, note: '', createdAt: `2026-11-0${id.length}T00:00:00.000Z`, readiness: 40, coherence: 80, featureCount: 3, content: '# spec' });
const stored = [captured('b2'), captured('b1')];
function services() {
	const save = vi.fn(async () => ({ savedAt: 'now', revision: 4 }));
	return { save, services: { loadBaselinesDraft: { execute: async () => ({ projectId: 'p', baselines: stored, lastSavedAt: null }) }, saveBaselinesDraft: { execute: save }, sectionDocuments: {} } as never };
}
const validatedOn = (baselineId: string): RetrospecDocument => {
	const base = emptyRetrospecDocument();
	return { ...base, runs: [{ id: 'r1', publishedAt: '2026-11-01T00:00:00.000Z', baselineId } as never] };
};
const opts = { expectedRevision: 3, origin: null };

describe('the save door of the baselines [criterion:c346a116]', () => {
	it('keeps the snapshot as captured and says so', async () => {
		doc.current = emptyRetrospecDocument();
		const { services: s, save } = services();
		const answer = await saveBaselineEdits(s, 'p', { projectId: 'p', lastSavedAt: null, baselines: stored.map((b) => ({ ...b, name: 'Renamed', readiness: 100 })) }, opts);
		expect(save).toHaveBeenCalledWith(expect.objectContaining({ baselines: stored.map((b) => ({ ...b, name: 'Renamed' })) }), opts);
		expect(answer).toMatchObject({ revision: 4, note: expect.stringContaining('Only the name and the note of a baseline are written') });
	});

	it('refuses to delete the baseline the validated specification stands on [criterion:40d632f9]', async () => {
		doc.current = validatedOn('b1');
		const { services: s, save } = services();
		await expect(saveBaselineEdits(s, 'p', { projectId: 'p', lastSavedAt: null, baselines: [stored[0]] }, opts)).rejects.toMatchObject({
			status: 400,
			body: { message: 'This baseline is the version the validated specification stands on: it cannot be deleted.' }
		});
		expect(save).not.toHaveBeenCalled();
	});
});
