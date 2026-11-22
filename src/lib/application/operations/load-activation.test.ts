import { describe, expect, it } from 'vitest';
import type { LicenseEntitlements } from '$domain/licensing';
import type { ActivationRepositoryPort, LicenseVerifierPort, StoredActivation } from '../ports';
import { LoadActivationUseCase } from './load-activation';

const NOW = '2026-11-18T09:00:00.000Z';
const HOUR = 3_600_000;
const before = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();

/** The single-row activation store, its clock floor kept, a floor write able to fail. */
class Activations implements ActivationRepositoryPort {
	constructor(
		private readonly stored: StoredActivation | null,
		public floor: string | null = null,
		private readonly floorWriteFails = false
	) {}
	async load() {
		return this.stored;
	}
	async save() {}
	async loadPrevious() {
		return null;
	}
	async removeCurrent() {}
	async clear() {}
	async readClockFloor() {
		return this.floor;
	}
	async advanceClockFloor(nowIso: string) {
		if (this.floorWriteFails) throw new Error('read-only replica');
		this.floor = nowIso;
	}
	async ensureInstallId() {
		return 'ABCDEFGHJKMNPQRS';
	}
}

const entitlements: LicenseEntitlements = { licenseId: 'lic_1', customer: 'ada@acme.io', edition: 'enterprise', seats: 5, issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: null };
/** A verifier that trusts the key "signed" and nothing else. */
const verifier: LicenseVerifierPort = { available: true, verify: (key) => (key === 'signed' ? entitlements : null), isRetired: () => false };

const load = (activations: Activations) => new LoadActivationUseCase(activations, verifier, { nowIso: () => NOW }).execute();

describe('reading the activation in force', () => {
	it('reads a fresh install as unlicensed and a stored key with a bad signature as invalid', async () => {
		expect((await load(new Activations(null))).status).toBe('unlicensed');
		expect((await load(new Activations({ key: 'forged', activatedAt: before(HOUR) }))).status).toBe('invalid');
	});

	it('reads a key with a good signature as active', async () => {
		expect((await load(new Activations({ key: 'signed', activatedAt: before(HOUR) }))).status).toBe('active');
	});

	it('raises the clock floor only under a key with a good signature, at most once an hour', async () => {
		const valid = new Activations({ key: 'signed', activatedAt: before(HOUR) }, before(2 * HOUR));
		await load(valid);
		expect(valid.floor).toBe(NOW);

		const recent = new Activations({ key: 'signed', activatedAt: before(HOUR) }, before(HOUR / 2));
		await load(recent);
		expect(recent.floor).toBe(before(HOUR / 2));

		const forged = new Activations({ key: 'forged', activatedAt: before(HOUR) }, before(2 * HOUR));
		await load(forged);
		expect(forged.floor).toBe(before(2 * HOUR));
		const fresh = new Activations(null, null);
		await load(fresh);
		expect(fresh.floor).toBeNull();
	});

	it('still reads the licence when the clock floor cannot be written', async () => {
		expect((await load(new Activations({ key: 'signed', activatedAt: before(HOUR) }, null, true))).status).toBe('active');
	});
});
