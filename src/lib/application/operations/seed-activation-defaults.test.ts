import { describe, expect, it } from 'vitest';
import { SeedActivationDefaultsUseCase } from './seed-activation-defaults';
import type { OperatorProfileRepositoryPort } from '../ports';
import type { OperatorProfile } from '$domain/settings';
import type { LicenseEntitlements } from '$domain/licensing';

const entitlements = (customer: string): LicenseEntitlements => ({
	licenseId: 'lic-1',
	customer,
	edition: 'community',
	seats: 1,
	issuedAt: '2026-08-01T00:00:00.000Z',
	expiresAt: null
});

/** In-memory profile repo that records what was saved. */
function repo(displayName: string) {
	const saved: OperatorProfile[] = [];
	const port: OperatorProfileRepositoryPort = {
		load: async () => ({ displayName }),
		save: async (p) => {
			saved.push(p);
		}
	};
	return { port, saved };
}

describe('SeedActivationDefaultsUseCase', () => {
	it('seeds an empty operator name from the licence customer', async () => {
		const { port, saved } = repo('');
		await new SeedActivationDefaultsUseCase(port, true).execute(entitlements('Acme Corp'));
		expect(saved).toEqual([{ displayName: 'Acme Corp' }]);
	});

	it('derives a person name from an email-shaped customer', async () => {
		const { port, saved } = repo('');
		await new SeedActivationDefaultsUseCase(port, true).execute(entitlements('ada.lovelace@corp.io'));
		expect(saved).toEqual([{ displayName: 'Ada Lovelace' }]);
	});

	it('never overwrites a name the operator already chose', async () => {
		const { port, saved } = repo('My Chosen Name');
		await new SeedActivationDefaultsUseCase(port, true).execute(entitlements('Acme Corp'));
		expect(saved).toEqual([]);
	});

	it('does nothing on Enterprise installs (identity is back-owned)', async () => {
		const { port, saved } = repo('');
		await new SeedActivationDefaultsUseCase(port, false).execute(entitlements('Acme Corp'));
		expect(saved).toEqual([]);
	});

	it('does nothing without entitlements or customer', async () => {
		const { port, saved } = repo('');
		const uc = new SeedActivationDefaultsUseCase(port, true);
		await uc.execute(null);
		await uc.execute(entitlements('   '));
		expect(saved).toEqual([]);
	});

	it('swallows repository failures (activation already succeeded)', async () => {
		const port: OperatorProfileRepositoryPort = {
			load: async () => {
				throw new Error('db down');
			},
			save: async () => {}
		};
		await expect(
			new SeedActivationDefaultsUseCase(port, true).execute(entitlements('Acme Corp'))
		).resolves.toBeUndefined();
	});
});
