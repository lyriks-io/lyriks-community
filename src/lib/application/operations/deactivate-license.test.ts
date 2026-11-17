import { describe, expect, it } from 'vitest';
import type { AuditEvent, StoredActivation } from '../ports';
import { DeactivateLicenseUseCase } from './deactivate-license';

const key = (k: string): StoredActivation => ({ key: k, activatedAt: '2026-11-01T00:00:00.000Z' });

function store() {
	let current: StoredActivation | null = key('new');
	let previous: StoredActivation | null = key('old');
	return {
		load: async () => current,
		save: async () => {},
		loadPrevious: async () => previous,
		removeCurrent: async () => {
			current = null;
		},
		clear: async () => {
			current = null;
			previous = null;
		},
		readClockFloor: async () => null,
		advanceClockFloor: async () => {},
		ensureInstallId: async () => 'ABCDEFGHJKMNPQRS'
	};
}

/** Removing the stored key keeps the way back unless the person removes it too [issues.198]. */
describe('removing the stored key', () => {
	it('keeps the previous key, so going back to it stays possible', async () => {
		const repo = store();
		const events: AuditEvent[] = [];
		await new DeactivateLicenseUseCase(repo, { record: (e) => events.push(e) }).execute('ana@example.com');
		expect(await repo.load()).toBeNull();
		expect(await repo.loadPrevious()).toEqual(key('old'));
		expect(events[0]).toMatchObject({ action: 'license.deactivate', actor: 'ana@example.com', detail: 'previous key kept' });
	});

	it('removes the previous key too when the person says so', async () => {
		const repo = store();
		await new DeactivateLicenseUseCase(repo, { record: () => {} }).execute('ana@example.com', { previousToo: true });
		expect(await repo.load()).toBeNull();
		expect(await repo.loadPrevious()).toBeNull();
	});
});
