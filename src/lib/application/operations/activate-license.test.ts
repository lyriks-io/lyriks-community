import { describe, expect, it, vi } from 'vitest';
import type { LicenseEdition, LicenseEntitlements } from '$domain/licensing';
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

/** In-memory stand-in for the single-row activation store. */
function repository() {
	let stored: StoredActivation | null = null;
	let previous: StoredActivation | null = null;
	return {
		load: async () => stored,
		save: async (activation: StoredActivation) => {
			// Mirrors the adapter: the replaced key is demoted, and re-saving the
			// same key leaves the rollback target alone.
			if (stored && stored.key !== activation.key) previous = stored;
			stored = activation;
		},
		loadPrevious: async () => previous,
		removeCurrent: async () => {
			stored = null;
		},
		clear: async () => {
			stored = null;
			previous = null;
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

/** A verifier that accepts one key and grants the entitlements handed to it. */
function verifier(edition: LicenseEdition): LicenseVerifierPort {
	const entitlements: LicenseEntitlements = {
		licenseId: 'lic_1',
		customer: 'ada@example.com',
		edition,
		seats: 1,
		issuedAt: '2026-01-01T00:00:00.000Z',
		expiresAt: null
	};
	return { available: true, verify: () => entitlements, isRetired: () => false };
}

function audit(): AuditLogPort {
	return { record: vi.fn() };
}

describe('ActivateLicenseUseCase', () => {
	it('activates a Community install from its free perpetual key', async () => {
		const activations = repository();
		const result = await new ActivateLicenseUseCase(
			activations,
			verifier('community'),
			clock,
			audit()
		).execute('lyk_key');
		expect(result.ok).toBe(true);
		expect(result.view.status).toBe('active');
		expect(result.view.daysRemaining).toBeNull();
		expect(activations.read()?.key).toBe('lyk_key');
	});

	it('accepts a higher edition than the install declares', async () => {
		const activations = repository();
		const result = await new ActivateLicenseUseCase(
			activations,
			verifier('enterprise'),
			clock,
			audit()
		).execute('lyk_key');
		expect(result.ok).toBe(true);
	});

	it('takes a Community key whatever the images: the key decides what the install opens', async () => {
		const activations = repository();
		const log = audit();
		const result = await new ActivateLicenseUseCase(activations, verifier('community'), clock, log).execute(
			'lyk_key',
			'ops@example.corp'
		);
		expect(result.ok).toBe(true);
		expect(result.view.entitlements?.edition).toBe('community');
		expect(activations.read()?.key).toBe('lyk_key');
		expect(log.record).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'license.activate', outcome: 'success' })
		);
	});

	it('binds nothing when the install declares no edition', async () => {
		const activations = repository();
		const result = await new ActivateLicenseUseCase(
			activations,
			verifier('community'),
			clock,
			audit()
		).execute('lyk_key');
		expect(result.ok).toBe(true);
	});
});
