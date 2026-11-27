import { describe, expect, it } from 'vitest';
import { parseBaselinesDraft } from './parse-baselines-draft';

describe('reading the baselines', () => {
	it('keeps each baseline its id, its name and its moment, dropping what an older list carries [criterion:c7254cb1]', () => {
		const older = {
			projectId: 'p',
			lastSavedAt: null,
			baselines: [
				{ id: 'b2', name: 'EVO-015 closed', note: 'as the change left it', createdAt: '2026-11-22T19:17:48.979Z', readiness: 3, coherence: 82, featureCount: 110, content: '# Requirements' },
				{ id: 'b1', name: 'Reverse-Specification of Lyriks', createdAt: '2026-11-12T10:00:00.000Z', health: 64, featureCount: 108 }
			]
		};
		expect(parseBaselinesDraft(older, 'p').baselines).toEqual([
			{ id: 'b2', name: 'EVO-015 closed', createdAt: '2026-11-22T19:17:48.979Z' },
			{ id: 'b1', name: 'Reverse-Specification of Lyriks', createdAt: '2026-11-12T10:00:00.000Z' }
		]);
	});
});
