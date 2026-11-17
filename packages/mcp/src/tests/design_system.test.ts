import { describe, expect, it, vi } from 'vitest';
import type { LyriksClient } from '../lyriks-client.js';
import { checkDesignHandler, getDesignSystemHandler } from '../tools/design-system.js';

describe('the design system for an AI [criterion:ac-leaf-ac-brand-design-mcp]', () => {
	it('reads the design system of the project in one call', async () => {
		const get = vi.fn().mockResolvedValue({ palette: [] });
		await getDesignSystemHandler({ project_id: 'kutt c76982' }, { get } as unknown as LyriksClient);
		expect(get).toHaveBeenCalledWith('/api/projects/kutt%20c76982/design-system');
	});

	it('sends the colours and the sizes a design holds to be held against it', async () => {
		const post = vi.fn().mockResolvedValue({ matches: 1 });
		const lyriks = { post } as unknown as LyriksClient;
		await checkDesignHandler({ project_id: 'kutt', colors: [{ name: 'Button', value: '#2094F3' }], sizes: [{ kind: 'radius', px: 12 }] }, lyriks);
		expect(post).toHaveBeenCalledWith('/api/projects/kutt/design-system/check', { colors: [{ name: 'Button', value: '#2094F3' }], sizes: [{ kind: 'radius', px: 12 }] });
		await checkDesignHandler({ project_id: 'kutt', colors: [{ value: '#fff' }] }, lyriks);
		expect(post.mock.calls[1][1]).toEqual({ colors: [{ value: '#fff' }], sizes: [] });
	});
});
