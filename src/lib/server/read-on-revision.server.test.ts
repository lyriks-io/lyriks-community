import { describe, expect, it, vi } from 'vitest';
import { createEmptyFeaturesDraft } from '$domain/features';
import type { Baseline } from '$domain/baselines';
import type { AppServices } from '$composition/container.server';
import { readOnRevision } from './read-on-revision.server';
import { readSpecFrame } from './spec360-read.server';

function store(initial = 1) {
	let revision = initial;
	return {
		services: { sectionDocuments: { currentRevision: async () => revision } } as unknown as Pick<AppServices, 'sectionDocuments'>,
		bump: () => (revision += 1)
	};
}

describe('readOnRevision', () => {
	it('reads a section once per revision and shares the reading until it moves', async () => {
		const { services, bump } = store();
		const load = vi.fn(async () => ({ size: 'large' }));
		const first = await readOnRevision(services, 'p-share', 'baselines', load);
		const second = await readOnRevision(services, 'p-share', 'baselines', load);
		expect(load).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
		bump();
		await readOnRevision(services, 'p-share', 'baselines', load);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('keeps no failed reading: the next read asks again', async () => {
		const { services } = store();
		const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');
		await expect(readOnRevision(services, 'p-fail', 'baselines', load)).rejects.toThrow('down');
		await expect(readOnRevision(services, 'p-fail', 'baselines', load)).resolves.toBe('ok');
	});

	it('keeps a reading derived from a section apart from the whole document', async () => {
		const { services } = store();
		const whole = await readOnRevision(services, 'p-purpose', 'baselines', async () => 'whole');
		const latest = await readOnRevision(services, 'p-purpose', 'baselines', async () => 'latest', 'latest');
		expect([whole, latest]).toEqual(['whole', 'latest']);
	});
});

describe('readSpecFrame', () => {
	const baseline = (name: string, createdAt: string): Baseline => ({
		id: name, name, note: '', createdAt, readiness: 0, coherence: 0, featureCount: 0, content: 'x'.repeat(1000)
	});

	function services(baselines: () => Promise<Baseline[]>) {
		let revision = 1;
		const loadBaselines = vi.fn(async (projectId: string) => ({ projectId, baselines: await baselines(), lastSavedAt: null }));
		const fake = {
			sectionDocuments: { currentRevision: async () => revision },
			loadFoundationDraft: { loadIdentity: async () => ({ productName: 'Lyriks' }) },
			loadFeaturesDraft: { execute: async (projectId: string) => createEmptyFeaturesDraft(projectId) },
			loadBaselinesDraft: { execute: loadBaselines }
		} as unknown as AppServices;
		return { fake, loadBaselines, publish: () => (revision += 1) };
	}

	it('shows the latest baseline, reading the baselines once per revision', async () => {
		let list = [baseline('v1', '2026-11-01T00:00:00Z'), baseline('v2', '2026-11-20T00:00:00Z')];
		const { fake, loadBaselines, publish } = services(async () => list);

		expect((await readSpecFrame(fake, 'p-frame')).published).toEqual({ name: 'v2', at: '2026-11-20T00:00:00Z' });
		await readSpecFrame(fake, 'p-frame');
		expect(loadBaselines).toHaveBeenCalledTimes(1);

		list = [...list, baseline('v3', '2026-11-22T00:00:00Z')];
		publish();
		expect((await readSpecFrame(fake, 'p-frame')).published).toEqual({ name: 'v3', at: '2026-11-22T00:00:00Z' });
	});

	it('shows no baseline while none is published, and asks again after a failed read', async () => {
		let fail = true;
		const { fake } = services(async () => {
			if (fail) throw new Error('down');
			return [baseline('v1', '2026-11-01T00:00:00Z')];
		});
		expect((await readSpecFrame(fake, 'p-frame-fail')).published).toBeNull();
		fail = false;
		expect((await readSpecFrame(fake, 'p-frame-fail')).published).toEqual({ name: 'v1', at: '2026-11-01T00:00:00Z' });
	});
});
