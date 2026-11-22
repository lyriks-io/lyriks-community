import type { LicenseEntitlements } from '$domain/licensing';
import type { ActivationRepositoryPort, AuditEvent, LicenseVerifierPort, StoredActivation } from '$application/ports';
import { ActivateLicenseUseCase } from '$application/operations/activate-license';
import { DeactivateLicenseUseCase } from '$application/operations/deactivate-license';
import { LoadActivationUseCase } from '$application/operations/load-activation';
import { PreviewLicenseUseCase } from '$application/operations/preview-license';
import { RestorePreviousLicenseUseCase } from '$application/operations/restore-previous-license';
import type { FakeServices } from './request-event.fixture';

/**
 * The licence use-cases as the composition root wires them, over an in-memory
 * activation store and a verifier that knows a handful of keys. What a test
 * reads back is the store itself: which key is in force, which one is kept as
 * the previous, what the Back's seat gate was handed.
 */

const NOW = '2026-11-18T00:00:00.000Z';

export const ACME_KEY = 'KEY-ACME';
export const RENEWAL_KEY = 'KEY-RENEWAL';

const KNOWN: Record<string, LicenseEntitlements> = {
	[ACME_KEY]: { licenseId: 'lic-acme', customer: 'Acme', email: 'holder@example.test', edition: 'enterprise', seats: 5, issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: null },
	[RENEWAL_KEY]: { licenseId: 'lic-renewal', customer: 'Acme', email: 'holder@example.test', edition: 'enterprise', seats: 50, issuedAt: '2026-06-01T00:00:00.000Z', expiresAt: null }
};

export interface LicenceDesk {
	readonly services: FakeServices;
	/** The key in force, if any. */
	current(): string | null;
	/** The key kept to go back to, if any. */
	previous(): string | null;
	/** Every forced delivery of the licence to the Back's seat gate. */
	readonly deliveries: boolean[];
	/** The entitlements handed to the install-identity seeding. */
	readonly seeded: Array<LicenseEntitlements | null>;
	readonly audit: AuditEvent[];
}

export function licenceDesk(initial: { current?: string; previous?: string } = {}): LicenceDesk {
	let stored: StoredActivation | null = initial.current ? { key: initial.current, activatedAt: NOW } : null;
	let kept: StoredActivation | null = initial.previous ? { key: initial.previous, activatedAt: NOW } : null;
	const activations = {
		load: async () => stored,
		save: async (activation) => {
			if (stored && stored.key !== activation.key) kept = stored;
			stored = activation;
		},
		loadPrevious: async () => kept,
		removeCurrent: async () => {
			stored = null;
		},
		clear: async () => {
			stored = null;
			kept = null;
		},
		readClockFloor: async () => null,
		advanceClockFloor: async () => {},
		ensureInstallId: async () => 'ABCDEFGHJKMNPQRS'
	} satisfies ActivationRepositoryPort;
	const verifier = { available: true, verify: (key) => KNOWN[key.trim()] ?? null, isRetired: () => false } satisfies LicenseVerifierPort;
	const clock = { nowIso: () => NOW };
	const audit: AuditEvent[] = [];
	const auditLog = { record: (event: AuditEvent) => void audit.push(event) };
	const deliveries: boolean[] = [];
	const seeded: Array<LicenseEntitlements | null> = [];
	return {
		services: {
			loadActivation: new LoadActivationUseCase(activations, verifier, clock),
			activateLicense: new ActivateLicenseUseCase(activations, verifier, clock, auditLog),
			previewLicense: new PreviewLicenseUseCase(activations, verifier, clock),
			restorePreviousLicense: new RestorePreviousLicenseUseCase(activations, verifier, clock, auditLog),
			deactivateLicense: new DeactivateLicenseUseCase(activations, auditLog),
			hasPreviousLicense: async () => kept !== null,
			seedActivationDefaults: { execute: async (entitlements) => void seeded.push(entitlements) },
			syncBackLicence: {
				execute: async (force) => {
					deliveries.push(force ?? false);
					return true;
				}
			}
		},
		current: () => stored?.key ?? null,
		previous: () => kept?.key ?? null,
		deliveries,
		seeded,
		audit
	};
}
