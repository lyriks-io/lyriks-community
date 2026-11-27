import { describe, expect, it } from 'vitest';
import type { LicenseEntitlements } from '$domain/licensing';
import type { ActivationRepositoryPort, AuditEvent, AuditLogPort, ClockPort, LicenseVerifierPort, StoredActivation } from '../ports';
import { ActivateLicenseUseCase } from './activate-license';
import { DeactivateLicenseUseCase } from './deactivate-license';
import { PreviewLicenseUseCase } from './preview-license';
import { RestorePreviousLicenseUseCase } from './restore-previous-license';

const clock: ClockPort = { nowIso: () => '2026-11-26T00:00:00.000Z' };

const ENTITLEMENTS: Record<string, LicenseEntitlements> = {
	'lyk_old.sig': { licenseId: 'lic_old', customer: 'Acme', edition: 'enterprise', seats: 5, issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: null },
	'lyk_new.sig': { licenseId: 'lic_new', customer: 'Acme', edition: 'enterprise', seats: 10, projects: 3, issuedAt: '2026-11-01T00:00:00.000Z', expiresAt: '2027-11-01T00:00:00.000Z' }
};
const verifier: LicenseVerifierPort = { available: true, verify: (key) => ENTITLEMENTS[key] ?? null, isRetired: () => false };

/** The single-row activation store, its replaced key demoted as the adapter does. */
function repository(): ActivationRepositoryPort {
	let stored: StoredActivation | null = null;
	let previous: StoredActivation | null = null;
	return {
		load: async () => stored,
		save: async (activation) => {
			if (stored && stored.key !== activation.key) previous = stored;
			stored = activation;
		},
		loadPrevious: async () => previous,
		removeCurrent: async () => void (stored = null),
		clear: async () => void ((stored = null), (previous = null)),
		readClockFloor: async () => null,
		advanceClockFloor: async () => {},
		ensureInstallId: async () => 'ABCDEFGHJKMNPQRS'
	};
}

describe('Every licence change is written to the audit trail [criterion:fea395b6]', () => {
	it('records each activation attempt with its outcome, going back and removing a key; a check records nothing', async () => {
		const events: AuditEvent[] = [];
		const audit: AuditLogPort = { record: (e) => void events.push(e) };
		const activations = repository();
		const activate = new ActivateLicenseUseCase(activations, verifier, clock, audit);

		await activate.execute('lyk_forged.sig', 'ana@example.com');
		await activate.execute('lyk_old.sig', 'ana@example.com');
		await new PreviewLicenseUseCase(activations, verifier, clock).execute('lyk_new.sig');
		expect(events).toHaveLength(2);
		await activate.execute('lyk_new.sig', 'ana@example.com');
		await new RestorePreviousLicenseUseCase(activations, verifier, clock, audit).execute('ana@example.com');
		await new DeactivateLicenseUseCase(activations, audit).execute('ana@example.com');

		expect(events.map((e) => [e.action, e.outcome])).toEqual([
			['license.activate', 'failure'],
			['license.activate', 'success'],
			['license.activate', 'success'],
			['license.restore_previous', 'success'],
			['license.deactivate', 'success']
		]);
		expect(events[1]).toMatchObject({ target: 'lic_old', detail: 'enterprise · 5 seats · expires never' });
		expect(events[2]).toMatchObject({ target: 'lic_new', detail: 'enterprise · 10 seats · expires 2027-11-01T00:00:00.000Z' });
	});
});
