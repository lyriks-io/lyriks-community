import { describe, expect, it, vi } from 'vitest';
import type { UnspaghettitAdvisorPort } from '../ports';
import { ReadActionDigestUseCase } from './read-action-digest';

describe('ReadActionDigestUseCase', () => {
	it('asks the engine for the digest scoped to the one action', async () => {
		const getDigest = vi.fn().mockResolvedValue({ hasContent: true, markdown: '- Books a room' });
		const advisor = { getDigest } as unknown as UnspaghettitAdvisorPort;

		const digest = await new ReadActionDigestUseCase(advisor).execute('feat-1', 'srf-1', 'act-1');

		expect(getDigest).toHaveBeenCalledWith('feat-1', { surfaceId: 'srf-1', actionId: 'act-1' });
		expect(digest).toEqual({ hasContent: true, markdown: '- Books a room' });
	});

	it('answers null when the engine cannot be reached', async () => {
		const advisor = { getDigest: vi.fn().mockResolvedValue(null) } as unknown as UnspaghettitAdvisorPort;

		expect(await new ReadActionDigestUseCase(advisor).execute('feat-1', 'srf-1', 'act-1')).toBeNull();
	});
});
