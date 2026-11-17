import { describe, expect, it, vi } from 'vitest';
import { createEmptyIdentityDraft, type FoundationIdentityDraft } from '$domain/foundation';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';
import { UpdateProjectUseCase } from './update-project';

function useCase(stored: FoundationIdentityDraft | null) {
	const saved: FoundationIdentityDraft[] = [];
	const drafts: FoundationIdentityRepositoryPort = {
		load: async () => stored,
		save: async (draft) => {
			saved.push(draft);
		}
	};
	const clock = { nowIso: () => '2026-11-02T00:00:00.000Z' } as unknown as ClockPort;
	const portfolio = { setMeta: vi.fn(async () => {}) } as unknown as PortfolioRepositoryPort;
	return { run: new UpdateProjectUseCase(drafts, clock, portfolio), saved };
}

describe('a rename answers with the name as it will read [criterion:60d1fbca]', () => {
	const stored = { ...createEmptyIdentityDraft('linkding-2fa72d'), productName: 'Linkding' };

	it('answers the name kept, in the one style, the same one it stores', async () => {
		const { run, saved } = useCase(stored);
		const result = await run.execute({ projectId: 'linkding-2fa72d', name: 'linkding', description: '', domainId: null });
		expect(result).toEqual({ updated: true, name: 'Linkding' });
		expect(saved[0].productName).toBe('Linkding');
	});

	it('answers the current name when the one sent is empty', async () => {
		const { run } = useCase(stored);
		expect(await run.execute({ projectId: 'linkding-2fa72d', name: '  ', description: '', domainId: null })).toEqual({
			updated: true,
			name: 'Linkding'
		});
	});

	it('names no name when nothing was renamed', async () => {
		const { run } = useCase(null);
		expect(await run.execute({ projectId: 'gone', name: 'x', description: '', domainId: null })).toEqual({
			updated: false,
			reason: 'That project no longer exists.'
		});
	});
});
