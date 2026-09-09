import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import {
	isLicenseEntitlements,
	LICENSE_KEY_PREFIX,
	type LicenseEntitlements
} from '$domain/licensing';
import type { LicenseVerifierPort } from '$application/ports';
import { licensePublicKeyPem, retiredLicensePublicKeyPems } from './embedded-public-key';

/**
 * Offline licence verifier using Ed25519 from Node's built-in `crypto` — no
 * dependency, no network, so it satisfies the air-gap guarantee.
 *
 * Key wire format (what the customer pastes / receives by email):
 *
 *     lyk_<base64url(payloadJSON)>.<base64url(signature)>
 *
 * The signature covers the *encoded payload segment* bytes exactly, so there is
 * no JSON canonicalisation to disagree on between signer and verifier. Any
 * tampering with the entitlements changes the payload segment and breaks the
 * signature — `verify` then returns `null`.
 */
const KEY_PREFIX = LICENSE_KEY_PREFIX;

export class Ed25519LicenseVerifier implements LicenseVerifierPort {
	readonly #publicKey: KeyObject | null;
	/** Recognised but refused — see retiredLicensePublicKeyPems. */
	readonly #retiredKeys: readonly KeyObject[];
	readonly available: boolean;

	constructor(
		pem: string = licensePublicKeyPem(),
		retiredPems: readonly string[] = retiredLicensePublicKeyPems()
	) {
		let key: KeyObject | null = null;
		try {
			key = createPublicKey(pem);
		} catch {
			// A malformed configured key disables activation rather than crashing boot.
			key = null;
		}
		this.#publicKey = key;
		// A retired anchor that fails to parse costs only the better message, so it
		// is dropped rather than allowed to take activation down with it.
		this.#retiredKeys = retiredPems.flatMap((p) => {
			try {
				return [createPublicKey(p)];
			} catch {
				return [];
			}
		});
		this.available = key !== null;
	}

	/**
	 * Split a raw key into the two segments the wire format defines, or null when
	 * it is not shaped like a licence key at all.
	 */
	#segments(rawKey: string): { payloadSeg: string; sigSeg: string } | null {
		const trimmed = rawKey.trim();
		if (!trimmed.startsWith(KEY_PREFIX)) return null;
		const [payloadSeg, sigSeg, ...extra] = trimmed.slice(KEY_PREFIX.length).split('.');
		if (!payloadSeg || !sigSeg || extra.length > 0) return null;
		return { payloadSeg, sigSeg };
	}

	isRetired(rawKey: string): boolean {
		if (this.#retiredKeys.length === 0) return false;
		const seg = this.#segments(rawKey);
		if (!seg) return false;
		try {
			const signature = Buffer.from(seg.sigSeg, 'base64url');
			const signed = Buffer.from(seg.payloadSeg, 'utf8');
			return this.#retiredKeys.some((k) => cryptoVerify(null, signed, k, signature));
		} catch {
			return false;
		}
	}

	verify(rawKey: string): LicenseEntitlements | null {
		if (!this.#publicKey) return null;

		const trimmed = rawKey.trim();
		if (!trimmed.startsWith(KEY_PREFIX)) return null;

		const [payloadSeg, sigSeg, ...extra] = trimmed.slice(KEY_PREFIX.length).split('.');
		if (!payloadSeg || !sigSeg || extra.length > 0) return null;

		try {
			const signature = Buffer.from(sigSeg, 'base64url');
			const signed = Buffer.from(payloadSeg, 'utf8');
			if (!cryptoVerify(null, signed, this.#publicKey, signature)) return null;

			const payload = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
			return isLicenseEntitlements(payload) ? payload : null;
		} catch {
			// Bad base64 / bad JSON / bad signature length — all just "not a valid key".
			return null;
		}
	}
}
