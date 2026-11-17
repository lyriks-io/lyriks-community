import { describe, expect, it, vi } from 'vitest';
import { ProjectStateCache } from '$application/projection/project-state-cache';
import type { BehaviorFold } from '$application/specification/behavior-reading';
import type { AppServices } from '$composition/container.server';
import { readBehavior } from './behavior-read.server';

const snapshot = { feature: { id: 'a', updatedAt: '2026-11-09', surfaces: [] } };

function services(readFeature: () => Promise<unknown>) {
	return {
		behaviorReadings: new ProjectStateCache<BehaviorFold>({ fingerprint: async () => 'r' }, () => 'k'),
		behaviorPort: { readProject: async () => ({ project: { featureIds: ['a'] } }), readFeature },
		loadSpecLanguage: { generated: async () => ({ tag: 'en', name: 'English' }) },
		maturityScorer: { score: () => ({ level: 0 }) }
	} as unknown as AppServices;
}

describe('the behaviour of a project is folded once per state of the spec', () => {
	it('folds once while nothing moved', async () => {
		const readFeature = vi.fn(async () => snapshot);
		const app = services(readFeature);
		expect((await readBehavior(app, 'p')).writtenAt).toEqual({ a: '2026-11-09' });
		await readBehavior(app, 'p');
		expect(readFeature).toHaveBeenCalledOnce();
	});

	it('folds again after a feature could not be read, so a passing failure does not stay on the page', async () => {
		const readFeature = vi.fn(async () => snapshot);
		readFeature.mockRejectedValueOnce(new Error('unreadable'));
		const app = services(readFeature);
		expect((await readBehavior(app, 'p')).writtenAt).toEqual({});
		expect((await readBehavior(app, 'p')).writtenAt).toEqual({ a: '2026-11-09' });
		expect(readFeature).toHaveBeenCalledTimes(2);
	});
});
