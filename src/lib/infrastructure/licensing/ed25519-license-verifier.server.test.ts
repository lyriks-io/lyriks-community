import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Ed25519LicenseVerifier } from './ed25519-license-verifier.server';
import { retiredLicensePublicKeyPems } from './embedded-public-key';

/**
 * Signing-key rotation. Rotating the authority invalidates every licence already
 * issued under the old one, and the holder of a genuine key sees only "invalid" —
 * which reads as a typo and sends them to check their clipboard rather than ask
 * for a replacement. These pin the two halves of the answer: a retired authority
 * is RECOGNISED so the message can say so, and never ACCEPTED.
 */

function keypair() {
	return generateKeyPairSync('ed25519');
}

function mint(privateKey: ReturnType<typeof keypair>['privateKey'], overrides = {}): string {
	const payload = {
		licenseId: 'lic_test',
		customer: 'Test Customer',
		edition: 'enterprise',
		seats: 5,
		issuedAt: '2026-01-01T00:00:00.000Z',
		expiresAt: null,
		...overrides
	};
	const seg = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	const sig = edSign(null, Buffer.from(seg, 'utf8'), privateKey).toString('base64url');
	return `lyk_${seg}.${sig}`;
}

const pem = (k: ReturnType<typeof keypair>['publicKey']) =>
	k.export({ type: 'spki', format: 'pem' }).toString();

describe('Ed25519LicenseVerifier — signing key rotation', () => {
	const current = keypair();
	const retired = keypair();
	const stranger = keypair();
	const verifier = new Ed25519LicenseVerifier(pem(current.publicKey), [pem(retired.publicKey)]);

	it('accepts a key from the current authority', () => {
		expect(verifier.verify(mint(current.privateKey))?.customer).toBe('Test Customer');
	});

	it('REFUSES a key from a retired authority', () => {
		// The security half. A retired private key may have leaked — licences are
		// the only thing enforcing the entitlement on hardware we do not control,
		// so recognising one must never shade into honouring it.
		expect(verifier.verify(mint(retired.privateKey))).toBeNull();
	});

	it('recognises a retired key so the failure can name the real cause', () => {
		expect(verifier.isRetired(mint(retired.privateKey))).toBe(true);
	});

	it('does not mistake an unknown signer, a typo, or junk for a retired key', () => {
		expect(verifier.isRetired(mint(stranger.privateKey))).toBe(false);
		expect(verifier.isRetired(mint(current.privateKey))).toBe(false);
		expect(verifier.isRetired('lyk_not-a-key')).toBe(false);
		expect(verifier.isRetired('')).toBe(false);
	});

	it('reports nothing as retired when no authority has been retired', () => {
		const only = new Ed25519LicenseVerifier(pem(current.publicKey), []);
		expect(only.isRetired(mint(retired.privateKey))).toBe(false);
		expect(only.verify(mint(current.privateKey))).not.toBeNull();
	});

	it('survives an unparseable retired anchor rather than failing activation', () => {
		const v = new Ed25519LicenseVerifier(pem(current.publicKey), ['not a pem']);
		expect(v.available).toBe(true);
		expect(v.verify(mint(current.privateKey))).not.toBeNull();
	});
});

describe('the shipped retired list', () => {
	it('carries the authority retired on 2026-07-15', () => {
		// Recorded as "no issued keys in use"; a customer licence dated 2026-07-07
		// existed. The entry is what lets that key be diagnosed instead of denied
		// with no explanation — removing it silently restores the bad message.
		expect(retiredLicensePublicKeyPems().length).toBeGreaterThanOrEqual(1);
		expect(retiredLicensePublicKeyPems()[0]).toContain(
			'MCowBQYDK2VwAyEAcpylplhcMEqL/tGCQOcQs+FeZRNvynMdMGJLZvhyLCI='
		);
	});
});
