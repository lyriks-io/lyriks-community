import { describe, expect, it, vi } from 'vitest';
import type { DraftLockPort } from '$application/ports';
import { claimSections } from './section-claims.server';

function lockAt(revisions: Record<string, number>) {
	const stored = { ...revisions };
	const locks: DraftLockPort = {
		current: async (_project, section) => stored[section] ?? 0,
		commit: async (_project, section, expected) => {
			if (expected !== null && stored[section] !== expected) return null;
			stored[section] = (stored[section] ?? 0) + 1;
			return stored[section];
		},
		rollback: async (_project, section, committed) => {
			if (stored[section] === committed) stored[section] = committed - 1;
		}
	};
	return { locks, stored };
}

describe('a landing saves its sections only as it read them [criterion:d9c67477]', () => {
	it('reserves a new revision for each section that has not moved', async () => {
		const { locks, stored } = lockAt({ features: 4, data: 9 });
		const outcome = await claimSections(locks, vi.fn(), 'p', null, [
			{ section: 'features', readAt: 4 },
			{ section: 'data', readAt: 9 }
		]);
		expect(outcome.ok).toBe(true);
		expect(stored).toEqual({ features: 5, data: 10 });
	});

	it('names the section saved meanwhile and gives back what it had reserved', async () => {
		const { locks, stored } = lockAt({ features: 4, data: 12 });
		const outcome = await claimSections(locks, vi.fn(), 'p', null, [
			{ section: 'features', readAt: 4 },
			{ section: 'data', readAt: 9 }
		]);
		expect(outcome).toEqual({ ok: false, section: 'data' });
		expect(stored).toEqual({ features: 4, data: 12 });
	});

	it('tells the pages showing a section once it is saved', async () => {
		const { locks } = lockAt({ features: 4 });
		const publish = vi.fn();
		const outcome = await claimSections(locks, publish, 'p', 'tab-1', [{ section: 'features', readAt: 4 }]);
		if (!outcome.ok) throw new Error('claimed');
		const save = vi.fn(async () => {});
		await outcome.claims.land('features', save);
		expect(save).toHaveBeenCalledOnce();
		expect(publish).toHaveBeenCalledWith({ projectId: 'p', section: 'features', origin: 'tab-1' });
	});

	it('gives back every revision not landed when a save fails, and tells nobody', async () => {
		const { locks, stored } = lockAt({ features: 4, data: 9 });
		const publish = vi.fn();
		const outcome = await claimSections(locks, publish, 'p', null, [
			{ section: 'features', readAt: 4 },
			{ section: 'data', readAt: 9 }
		]);
		if (!outcome.ok) throw new Error('claimed');
		await expect(outcome.claims.land('features', async () => Promise.reject(new Error('disk')))).rejects.toThrow('disk');
		expect(stored).toEqual({ features: 4, data: 9 });
		expect(publish).not.toHaveBeenCalled();
	});

	it('keeps what landed when the batch stops afterwards', async () => {
		const { locks, stored } = lockAt({ features: 4, data: 9 });
		const outcome = await claimSections(locks, vi.fn(), 'p', null, [
			{ section: 'features', readAt: 4 },
			{ section: 'data', readAt: 9 }
		]);
		if (!outcome.ok) throw new Error('claimed');
		await outcome.claims.land('features', async () => {});
		await outcome.claims.release();
		expect(stored).toEqual({ features: 5, data: 9 });
	});

	it('refuses to save a section nobody claimed', async () => {
		const { locks } = lockAt({ features: 4 });
		const outcome = await claimSections(locks, vi.fn(), 'p', null, []);
		if (!outcome.ok) throw new Error('claimed');
		await expect(outcome.claims.land('features', async () => {})).rejects.toThrow('not claimed');
	});
});
