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
			audit(),
			'community'
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
			audit(),
			'community'
		).execute('lyk_key');
		expect(result.ok).toBe(true);
	});

	it('refuses a Community key on an Enterprise install, and stores nothing', async () => {
		const activations = repository();
		const log = audit();
		const result = await new ActivateLicenseUseCase(
			activations,
			verifier('community'),
			clock,
			log,
			'enterprise'
		).execute('lyk_key', 'ops@example.corp');
		expect(result).toMatchObject({ ok: false, reason: 'wrong_edition' });
		// Storing it would leave the install looking activated while every later
		// page load resolved to the same refusal.
		expect(activations.read()).toBeNull();
		expect(log.record).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'license.activate', outcome: 'failure' })
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
