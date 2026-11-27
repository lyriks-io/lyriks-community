import { describe, expect, it, vi } from 'vitest';
import { createEmptyFeaturesDraft } from '$domain/features';
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
});

describe('readSpecFrame', () => {
	it('reads the product and the feature tree, never the baselines [criterion:1eb35bd3]', async () => {
		const loadBaselines = vi.fn();
		const fake = {
			sectionDocuments: { currentRevision: async () => 1 },
			loadFoundationDraft: { loadIdentity: async () => ({ productName: 'Lyriks' }) },
			loadFeaturesDraft: { execute: async (projectId: string) => createEmptyFeaturesDraft(projectId) },
			loadBaselinesDraft: { execute: loadBaselines }
		} as unknown as AppServices;
		const frame = await readSpecFrame(fake, 'p-frame');
		expect(frame.productName).toBe('Lyriks');
		expect(frame).not.toHaveProperty('published');
		expect(loadBaselines).not.toHaveBeenCalled();
	});
});
