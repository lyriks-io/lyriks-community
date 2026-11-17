import { describe, expect, it, vi } from 'vitest';
import type { LicenseEdition, LicenseEntitlements } from '$domain/licensing';
import { PreviewLicenseUseCase } from './preview-license';
import { RestorePreviousLicenseUseCase } from './restore-previous-license';
import { ActivateLicenseUseCase } from './activate-license';
import type {
	ActivationRepositoryPort,
	AuditLogPort,
	ClockPort,
	LicenseVerifierPort,
	StoredActivation
} from '../ports';

const NOW = '2026-07-07T00:00:00.000Z';
const clock: ClockPort = { nowIso: () => NOW };

/** In-memory store that demotes a replaced key, exactly like the adapter. */
function repository() {
	let stored: StoredActivation | null = null;
	let previous: StoredActivation | null = null;
	return {
		load: async () => stored,
		save: async (activation: StoredActivation) => {
			if (stored && stored.key !== activation.key) previous = stored;
			stored = activation;
		},
		loadPrevious: async () => previous,
		clear: async () => {
			stored = null;
		},
		readClockFloor: async () => null,
		advanceClockFloor: async () => {},
		ensureInstallId: async () => 'ABCDEFGHJKMNPQRS',
		read: () => stored,
		readPrevious: () => previous
	} satisfies ActivationRepositoryPort & {
		read: () => StoredActivation | null;
		readPrevious: () => StoredActivation | null;
	};
}

/** Verifier over a key→entitlements map; anything else fails to verify. */
function verifier(keys: Record<string, Partial<LicenseEntitlements>>): LicenseVerifierPort {
	return {
		available: true,
		verify: (raw: string) => {
			const found = keys[raw.trim()];
			if (!found) return null;
			return {
				licenseId: 'lic_1',
				customer: 'northwind',
				edition: 'enterprise' as LicenseEdition,
				seats: 5,
				issuedAt: '2026-01-01T00:00:00.000Z',
				expiresAt: null,
				...found
			};
		},
		isRetired: () => false
	};
}

function audit(): AuditLogPort {
	return { record: vi.fn() };
}

describe('PreviewLicenseUseCase', () => {
	it('reports what a key would grant without storing anything', async () => {
		const activations = repository();
		const result = await new PreviewLicenseUseCase(
			activations,
			verifier({ lyk_new: { seats: 25 } }),
			clock,
			'enterprise'
		).execute('lyk_new');
		expect(result.ok).toBe(true);
		expect(result.view.entitlements?.seats).toBe(25);
		// The whole point: nothing was written, so the working key is untouched.
		expect(activations.read()).toBeNull();
	});

	it('refuses exactly what activation refuses, so the verdict binds', async () => {
		const keys = { lyk_expired: { expiresAt: '2026-01-01T00:00:00.000Z' } };
		const preview = await new PreviewLicenseUseCase(
			repository(),
			verifier(keys),
			clock,
			'enterprise'
		).execute('lyk_expired');
		const real = await new ActivateLicenseUseCase(
			repository(),
			verifier(keys),
			clock,
			audit(),
			'enterprise'
		).execute('lyk_expired');
		expect(preview).toMatchObject({ ok: false, reason: 'expired' });
		expect(real).toMatchObject({ ok: false, reason: 'expired' });
	});

	it('refuses a key that does not cover this install', async () => {
		const result = await new PreviewLicenseUseCase(
			repository(),
			verifier({ lyk_community: { edition: 'community' } }),
			clock,
			'enterprise'
		).execute('lyk_community');
		expect(result).toMatchObject({ ok: false, reason: 'wrong_edition' });
	});

	it('reports an unreadable key without touching the store', async () => {
		const activations = repository();
		const result = await new PreviewLicenseUseCase(
			activations,
			verifier({}),
			clock,
			'enterprise'
		).execute('not-a-key');
		expect(result).toMatchObject({ ok: false, reason: 'invalid' });
		expect(activations.read()).toBeNull();
	});
});

describe('RestorePreviousLicenseUseCase', () => {
	async function installedThenReplaced() {
		const activations = repository();
		const v = verifier({ lyk_old: { seats: 5 }, lyk_new: { seats: 25 } });
		const activate = new ActivateLicenseUseCase(activations, v, clock, audit(), 'enterprise');
		await activate.execute('lyk_old');
		await activate.execute('lyk_new');
		return { activations, v };
	}

	it('puts the superseded key back in force', async () => {
		const { activations, v } = await installedThenReplaced();
		expect(activations.read()?.key).toBe('lyk_new');

		const result = await new RestorePreviousLicenseUseCase(
			activations,
			v,
			clock,
			audit(),
			'enterprise'
		).execute('ops@example.corp');

		expect(result.ok).toBe(true);
		expect(result.view.entitlements?.seats).toBe(5);
		expect(activations.read()?.key).toBe('lyk_old');
		// The key stepped away from becomes the rollback target, so an operator who
		// undoes by mistake can go straight back.
		expect(activations.readPrevious()?.key).toBe('lyk_new');
	});

	it('says so when there is nothing to go back to', async () => {
		const activations = repository();
		const result = await new RestorePreviousLicenseUseCase(
			activations,
			verifier({}),
			clock,
			audit(),
			'enterprise'
		).execute();
		expect(result).toMatchObject({ ok: false, reason: 'none' });
	});

	it('refuses to restore a key that expired while the new one was in place', async () => {
		const activations = repository();
		const v = verifier({
			lyk_old: { expiresAt: '2026-01-01T00:00:00.000Z' },
			lyk_new: { seats: 25 }
		});
		// Activate the old key while it is still valid, then replace it.
		const earlier: ClockPort = { nowIso: () => '2025-12-01T00:00:00.000Z' };
		await new ActivateLicenseUseCase(activations, v, earlier, audit(), 'enterprise').execute(
			'lyk_old'
		);
		await new ActivateLicenseUseCase(activations, v, clock, audit(), 'enterprise').execute(
			'lyk_new'
		);

		const result = await new RestorePreviousLicenseUseCase(
			activations,
			v,
			clock,
			audit(),
			'enterprise'
		).execute();

		expect(result).toMatchObject({ ok: false, reason: 'expired' });
		// A refused restore must leave the install on the key that works.
		expect(activations.read()?.key).toBe('lyk_new');
	});

	it('does not let re-pasting the same key destroy the rollback target', async () => {
		const { activations, v } = await installedThenReplaced();
		await new ActivateLicenseUseCase(activations, v, clock, audit(), 'enterprise').execute(
			'lyk_new'
		);
		expect(activations.readPrevious()?.key).toBe('lyk_old');
	});
});
