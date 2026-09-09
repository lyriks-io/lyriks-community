import { describe, expect, it } from 'vitest';
import {
	daysUntil,
	evaluateLicense,
	extractLicenseKey,
	isClockRolledBack,
	isExpired,
	isAuthEnforced,
	isLicenseEntitlements,
	isLicenseEnforced,
	isLicenseValid,
	licenseBoundEmail,
	licenseCoversInstall,
	licenseEmailMatches,
	shouldAdvanceClockFloor,
	type LicenseEntitlements
} from './license';

const NOW = '2026-07-07T00:00:00.000Z';

function ent(overrides: Partial<LicenseEntitlements> = {}): LicenseEntitlements {
	return {
		licenseId: 'lic_123',
		customer: 'Acme Corp',
		edition: 'enterprise',
		seats: 25,
		issuedAt: '2026-01-01T00:00:00.000Z',
		expiresAt: '2027-01-01T00:00:00.000Z',
		...overrides
	};
}

describe('extractLicenseKey', () => {
	const KEY = 'lyk_eyJhIjoxfQ.c2lnbmF0dXJl'; // lyk_<base64url payload>.<base64url sig>

	it('returns a bare token unchanged', () => {
		expect(extractLicenseKey('lyk_eyJhIjoxfQ.c2ln')).toBe('lyk_eyJhIjoxfQ.c2ln');
	});

	it('pulls the token out of a surrounding email body', () => {
		const body = `Hi Acme,\n\nYour Lyriks licence key:\n\n  ${KEY}\n\nKeep it safe.\n`;
		expect(extractLicenseKey(body)).toBe(KEY);
	});

	it('ignores leading/trailing whitespace from a saved .lyrkey file', () => {
		expect(extractLicenseKey(`\n\t${KEY}\n`)).toBe(KEY);
	});

	it('returns null when no token-shaped run is present', () => {
		expect(extractLicenseKey('just some text, no key here')).toBeNull();
		expect(extractLicenseKey('lyk_missingsignature')).toBeNull();
		expect(extractLicenseKey('')).toBeNull();
	});
});

describe('isExpired', () => {
	it('is false before expiry and true after', () => {
		expect(isExpired(ent({ expiresAt: '2026-08-01T00:00:00.000Z' }), NOW)).toBe(false);
		expect(isExpired(ent({ expiresAt: '2026-06-01T00:00:00.000Z' }), NOW)).toBe(true);
	});

	it('treats a perpetual (null) licence as never expired', () => {
		expect(isExpired(ent({ expiresAt: null }), NOW)).toBe(false);
	});

	it('treats an unparseable expiry as expired (fail closed)', () => {
		expect(isExpired(ent({ expiresAt: 'not-a-date' }), NOW)).toBe(true);
	});
});

describe('daysUntil', () => {
	it('counts whole days to expiry', () => {
		expect(daysUntil('2026-07-17T00:00:00.000Z', NOW)).toBe(10);
	});
});

describe('evaluateLicense', () => {
	it('reports active with days remaining for a valid dated licence', () => {
		const view = evaluateLicense(ent({ expiresAt: '2026-07-17T00:00:00.000Z' }), NOW, NOW);
		expect(view.status).toBe('active');
		expect(view.daysRemaining).toBe(10);
		expect(isLicenseValid(view)).toBe(true);
	});

	it('reports active with null daysRemaining for a perpetual licence', () => {
		const view = evaluateLicense(ent({ expiresAt: null }), NOW, NOW);
		expect(view.status).toBe('active');
		expect(view.daysRemaining).toBeNull();
	});

	it('reports expired past the expiry date', () => {
		const view = evaluateLicense(ent({ expiresAt: '2026-06-01T00:00:00.000Z' }), NOW, NOW);
		expect(view.status).toBe('expired');
		expect(isLicenseValid(view)).toBe(false);
	});

	it('maps an absent licence to the requested status', () => {
		expect(evaluateLicense(null, null, NOW).status).toBe('unlicensed');
		expect(evaluateLicense(null, null, NOW, { absentStatus: 'invalid' }).status).toBe('invalid');
	});

	it('flags tampering when now is well before the recorded clock floor', () => {
		const floor = '2026-07-10T00:00:00.000Z'; // 3 days later than NOW → rolled back
		const view = evaluateLicense(ent(), null, NOW, {
			absentStatus: 'invalid',
			clockFloorIso: floor
		});
		expect(view.status).toBe('tampered');
		expect(isLicenseValid(view)).toBe(false);
		// No countdown from a clock the status just declared untrustworthy.
		expect(view.daysRemaining).toBeNull();
	});

	it('checks rollback before expiry so a rolled-back clock cannot revive a licence', () => {
		// Clock pushed back to before an already-past expiry: without the floor this
		// would read "active"; with it, it is tampering.
		const floor = '2026-07-10T00:00:00.000Z';
		const view = evaluateLicense(ent({ expiresAt: '2026-06-01T00:00:00.000Z' }), null, NOW, {
			absentStatus: 'invalid',
			clockFloorIso: floor
		});
		expect(view.status).toBe('tampered');
	});

	it('stays active when the clock is at or ahead of the floor', () => {
		expect(
			evaluateLicense(ent(), NOW, NOW, { absentStatus: 'invalid', clockFloorIso: NOW }).status
		).toBe('active');
		expect(
			evaluateLicense(ent(), NOW, NOW, {
				absentStatus: 'invalid',
				clockFloorIso: '2026-01-01T00:00:00.000Z'
			}).status
		).toBe('active');
	});

	it('refuses a key that grants less than the edition this install declares', () => {
		const view = evaluateLicense(ent({ edition: 'community' }), NOW, NOW, {
			installEdition: 'enterprise'
		});
		expect(view.status).toBe('wrong_edition');
		expect(isLicenseValid(view)).toBe(false);
		// The entitlements are still surfaced: the panel names the edition the key
		// actually grants, which is the only way the message is actionable.
		expect(view.entitlements?.edition).toBe('community');
	});

	it('reports the edition mismatch ahead of the clock and the expiry', () => {
		// A refused key must not be reported as a clock problem the operator would
		// then chase on the wrong machine.
		const view = evaluateLicense(ent({ edition: 'community', expiresAt: null }), NOW, NOW, {
			installEdition: 'enterprise',
			clockFloorIso: '2026-07-10T00:00:00.000Z'
		});
		expect(view.status).toBe('wrong_edition');
	});

	it('activates a Community install from any edition of key', () => {
		for (const edition of ['community', 'enterprise'] as const) {
			const view = evaluateLicense(ent({ edition, expiresAt: null }), NOW, NOW, {
				installEdition: 'community'
			});
			expect(view.status).toBe('active');
		}
	});
});

describe('licenseCoversInstall', () => {
	it('lets a higher edition cover a lower one, never the reverse', () => {
		expect(licenseCoversInstall('enterprise', 'community')).toBe(true);
		expect(licenseCoversInstall('community', 'community')).toBe(true);
		expect(licenseCoversInstall('enterprise', 'enterprise')).toBe(true);
		expect(licenseCoversInstall('community', 'enterprise')).toBe(false);
	});

	it('binds nothing when the install declares no edition', () => {
		expect(licenseCoversInstall('community', undefined)).toBe(true);
		expect(licenseCoversInstall('community', 'not-an-edition')).toBe(true);
	});
});

describe('isClockRolledBack', () => {
	it('is false with no floor recorded yet', () => {
		expect(isClockRolledBack(NOW, null)).toBe(false);
	});

	it('is true only when now is more than the 24h tolerance behind the floor', () => {
		expect(isClockRolledBack('2026-07-05T23:59:59.000Z', NOW)).toBe(true); // 24h+1s back
		expect(isClockRolledBack('2026-07-06T00:00:00.000Z', NOW)).toBe(false); // exactly 24h
		expect(isClockRolledBack('2026-07-06T23:00:00.000Z', NOW)).toBe(false); // 1h back (NTP step)
		expect(isClockRolledBack('2026-07-08T00:00:00.000Z', NOW)).toBe(false); // forward
		expect(isClockRolledBack(NOW, NOW)).toBe(false);
	});

	it('treats an unreadable now as tampering (fail closed)', () => {
		expect(isClockRolledBack('not-a-date', NOW)).toBe(true);
	});

	it('fails open on an unreadable floor (own-datastore corruption, by design)', () => {
		expect(isClockRolledBack(NOW, 'garbage')).toBe(false);
	});
});

describe('shouldAdvanceClockFloor', () => {
	it('advances when no floor exists yet', () => {
		expect(shouldAdvanceClockFloor(NOW, null)).toBe(true);
	});

	it('advances only once now has passed the floor by the throttle', () => {
		expect(shouldAdvanceClockFloor('2026-07-07T00:30:00.000Z', NOW)).toBe(false); // 30min
		expect(shouldAdvanceClockFloor('2026-07-07T01:00:00.000Z', NOW)).toBe(true); // exactly 1h
		expect(shouldAdvanceClockFloor('2026-07-06T00:00:00.000Z', NOW)).toBe(false); // rolled back
	});

	it('never advances from an unreadable now, and repairs an unreadable floor', () => {
		expect(shouldAdvanceClockFloor('not-a-date', NOW)).toBe(false);
		expect(shouldAdvanceClockFloor(NOW, 'garbage')).toBe(true);
	});
});

describe('isLicenseEntitlements', () => {
	it('accepts a well-formed payload', () => {
		expect(isLicenseEntitlements(ent())).toBe(true);
		expect(isLicenseEntitlements(ent({ expiresAt: null }))).toBe(true);
	});

	it('accepts a community payload (free, single-seat, perpetual)', () => {
		expect(isLicenseEntitlements(ent({ edition: 'community', seats: 1, expiresAt: null }))).toBe(
			true
		);
	});

	it('rejects malformed payloads', () => {
		expect(isLicenseEntitlements(null)).toBe(false);
		expect(isLicenseEntitlements(ent({ seats: 0 }))).toBe(false);
		expect(isLicenseEntitlements({ ...ent(), edition: 'gold' })).toBe(false);
		// The product has two editions. A key naming any other one, including the
		// retired 'standard', is not a key for this product.
		expect(isLicenseEntitlements({ ...ent(), edition: 'standard' })).toBe(false);
		expect(isLicenseEntitlements({ ...ent(), licenseId: '' })).toBe(false);
	});
});

describe('isLicenseEnforced', () => {
	it('enforces every declared edition even when the flag says otherwise', () => {
		for (const edition of ['enterprise', 'community']) {
			expect(isLicenseEnforced({ edition, flag: '0' })).toBe(true);
			expect(isLicenseEnforced({ edition, flag: undefined })).toBe(true);
			expect(isLicenseEnforced({ edition, flag: '' })).toBe(true);
		}
	});

	it('lets the flag decide only for an install that declares nothing', () => {
		expect(isLicenseEnforced({ edition: undefined, flag: '1' })).toBe(true);
		expect(isLicenseEnforced({ edition: undefined, flag: undefined })).toBe(false);
		expect(isLicenseEnforced({ edition: 'not-an-edition', flag: undefined })).toBe(false);
	});

	it('spares the development server, which declares an edition without being one', () => {
		expect(isLicenseEnforced({ edition: 'community', flag: undefined, dev: true })).toBe(false);
		expect(isLicenseEnforced({ edition: 'enterprise', flag: undefined, dev: true })).toBe(false);
		// An explicit flag still wins, so a dev boot can be walled on purpose.
		expect(isLicenseEnforced({ edition: 'community', flag: '1', dev: true })).toBe(true);
	});
});

describe('isAuthEnforced', () => {
	it('requires a login on every declared edition, whatever the flag says', () => {
		for (const edition of ['enterprise', 'community']) {
			expect(isAuthEnforced({ edition, flag: '0' })).toBe(true);
			expect(isAuthEnforced({ edition, flag: undefined })).toBe(true);
			expect(isAuthEnforced({ edition, flag: '' })).toBe(true);
		}
	});

	it('lets the flag decide only for a build that declares nothing', () => {
		expect(isAuthEnforced({ edition: undefined, flag: '1' })).toBe(true);
		expect(isAuthEnforced({ edition: undefined, flag: undefined })).toBe(false);
		expect(isAuthEnforced({ edition: 'not-an-edition', flag: '0' })).toBe(false);
	});

	it('spares the development server, and an explicit flag still walls it', () => {
		expect(isAuthEnforced({ edition: 'community', flag: undefined, dev: true })).toBe(false);
		expect(isAuthEnforced({ edition: 'enterprise', flag: '0', dev: true })).toBe(false);
		expect(isAuthEnforced({ edition: 'community', flag: '1', dev: true })).toBe(true);
	});
});

describe('licenseBoundEmail', () => {
	it('reads the signed claim first, lower-cased', () => {
		expect(licenseBoundEmail(ent({ email: 'Ada@Example.com' }))).toBe('ada@example.com');
	});

	it('falls back to the address the signup flow writes into the customer label', () => {
		expect(licenseBoundEmail(ent({ customer: 'Ada Lovelace <Ada@Example.com>' }))).toBe(
			'ada@example.com'
		);
	});

	it('prefers the claim over the label when both are present', () => {
		expect(
			licenseBoundEmail(ent({ email: 'real@example.com', customer: 'X <old@example.com>' }))
		).toBe('real@example.com');
	});

	it('accepts the bare address the minting CLI documents for a Community key', () => {
		expect(licenseBoundEmail(ent({ customer: 'Ada@Example.com' }))).toBe('ada@example.com');
	});

	it('returns null for a key minted for an organisation, which names nobody', () => {
		expect(licenseBoundEmail(ent({ customer: 'Acme Corp' }))).toBeNull();
	});
});

describe('licenseEmailMatches', () => {
	it('matches regardless of case and surrounding spaces', () => {
		const e = ent({ email: 'ada@example.com' });
		expect(licenseEmailMatches(e, '  ADA@Example.com ')).toBe('match');
	});

	it('refuses an address the licence was not issued to', () => {
		expect(licenseEmailMatches(ent({ email: 'ada@example.com' }), 'eve@example.com')).toBe(
			'mismatch'
		);
	});

	it('answers unbound rather than passing when the key names nobody', () => {
		expect(licenseEmailMatches(ent({ customer: 'Acme Corp' }), 'eve@example.com')).toBe('unbound');
	});
});
