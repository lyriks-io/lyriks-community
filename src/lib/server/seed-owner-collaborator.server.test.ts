import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { seedOwnerCollaborator } from './seed-owner-collaborator.server';
import { canSeeProjectAsCollaborator } from '$domain/team';

describe('a verified project creator stays visible in per-project scope', () => {
	it('uses the owner established by Back without attempting another privileged grant [criterion:6a82292c]', async () => {
		const email = 'designer@example.test';
		const team = { collaborators: [{ id: 'creator', email, role: 'owner' }] };
		const add = vi.fn();
		const services = { loadTeam: { execute: async () => team }, addCollaborator: { execute: add } } as unknown as AppServices;
		await seedOwnerCollaborator(services, 'created-or-imported', email);
		expect(add).not.toHaveBeenCalled();
		expect(canSeeProjectAsCollaborator(team as never, email)).toBe(true);
	});

	it('retains the compatibility seed for an older Back that has no creator row', async () => {
		const add = vi.fn(async () => {});
		const services = { loadTeam: { execute: async () => ({ collaborators: [] }) }, addCollaborator: { execute: add } } as unknown as AppServices;
		await seedOwnerCollaborator(services, 'new-project', 'creator@example.test');
		expect(add).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'new-project', email: 'creator@example.test', role: 'owner' }));
	});
});
