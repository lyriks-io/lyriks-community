import { describe, expect, it, vi } from 'vitest';
import { createEmptyEvolutionDraft, createEvolutionRequest, type ProjectEvolutionDraft } from '$domain/evolution';
import { captureClosingBaselines } from './evolution-closing-baseline.server';

/**
 * Closing an evolution captures a baseline of the specification once what the
 * close lands is saved, and the request keeps which one: the Specification
 * 360° moves one version per evolution closed.
 */

const draft = (requests: ReturnType<typeof createEvolutionRequest>[]): ProjectEvolutionDraft => ({ ...createEmptyEvolutionDraft('p'), requests });

function servicesWith(stored: ProjectEvolutionDraft, saves: (boolean | null)[] = []) {
	let current = stored;
	const captureBaseline = { execute: vi.fn(async () => ({ draft: { projectId: 'p', baselines: [{ id: `b-${captureBaseline.execute.mock.calls.length}` }], lastSavedAt: null }, revision: 1 })) };
	const saveEvolutionDraft = {
		execute: vi.fn(async (next: ProjectEvolutionDraft) => {
			const answer = saves.shift();
			if (answer === null) return null;
			current = next;
			return { revision: 2, savedAt: '' };
		})
	};
	const services = {
		captureBaseline,
		saveEvolutionDraft,
		loadEvolutionDraft: { execute: async () => current },
		sectionDocuments: { currentRevision: async () => 1 }
	} as never;
	return { services, captureBaseline, saveEvolutionDraft, stored: () => current };
}

describe('the baseline an evolution close captures', () => {
	it('is captured for each request the batch closed and kept on it, named by its key', async () => {
		const before = draft([createEvolutionRequest({ id: 'r1', title: 'Notes', status: 'open', stage: 'delivered' }), createEvolutionRequest({ id: 'r2', status: 'closed' })]);
		const after = draft([{ ...before.requests[0], status: 'closed' }, before.requests[1]]);
		const { services, captureBaseline, stored } = servicesWith(after);
		await captureClosingBaselines(services, { projectId: 'p', before, after, origin: null });
		expect(captureBaseline.execute).toHaveBeenCalledTimes(1);
		expect((captureBaseline.execute.mock.calls[0] as unknown[]).slice(0, 3)).toEqual(['p', 'EVO-001 closed', 'EVO-001 · Notes closed in Lyriks: the specification as the change left it.']);
		expect(stored().requests.map((r) => r.closingBaselineId)).toEqual(['b-1', undefined]);
	});

	it('captures nothing when the batch closed nothing', async () => {
		const same = draft([createEvolutionRequest({ id: 'r1', status: 'open' })]);
		const { services, captureBaseline, saveEvolutionDraft } = servicesWith(same);
		await captureClosingBaselines(services, { projectId: 'p', before: same, after: same, origin: null });
		expect(captureBaseline.execute).not.toHaveBeenCalled();
		expect(saveEvolutionDraft.execute).not.toHaveBeenCalled();
	});

	it('writes the id again over a dossier saved meanwhile, re-reading it first', async () => {
		const before = draft([createEvolutionRequest({ id: 'r1', status: 'open' })]);
		const after = draft([{ ...before.requests[0], status: 'closed' }]);
		const { services, saveEvolutionDraft, stored } = servicesWith(after, [null, true]);
		await captureClosingBaselines(services, { projectId: 'p', before, after, origin: null });
		expect(saveEvolutionDraft.execute).toHaveBeenCalledTimes(2);
		expect(stored().requests[0].closingBaselineId).toBe('b-1');
	});
});
