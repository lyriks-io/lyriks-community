import { describe, expect, it, vi } from 'vitest';
import type { LyriksClient } from '../lyriks-client.js';
import { importDataCollectionsHandler } from '../tools/experience.js';

describe('simulator fixture import', () => {
	it('preserves an explicit zero seed count and keeps legacy defaults when omitted', async () => {
		const post = vi.fn().mockResolvedValue({ ok: true });
		const lyriks = { post } as unknown as LyriksClient;
		await importDataCollectionsHandler({ project_id: 'p', seed_count: 0 }, lyriks);
		expect(post.mock.calls[0][1]).toMatchObject({ projectId: 'p', seedCount: 0 });
		await importDataCollectionsHandler({ project_id: 'p' }, lyriks);
		expect(post.mock.calls[1][1]).not.toHaveProperty('seedCount');
	});
});
