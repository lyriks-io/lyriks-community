import type { LicenseEntitlements } from '$domain/licensing';

/**
 * Outbound port for offline licence-key verification.
 *
 * The concrete adapter checks a signed key against a bundled public key using
 * local crypto only — NO network, so it works fully air-gapped. It returns the
 * verified entitlements, or `null` when the key is malformed, forged, or signed by
 * a key this build does not trust. It never throws on a bad key; a bad key is a
 * `null`, not an error.
 */
export interface LicenseVerifierPort {
	/** True when a trusted public key is configured (always, in a shipped build). */
	readonly available: boolean;
	/** Verify a raw licence key string; entitlements on success, null otherwise. */
	verify(rawKey: string): LicenseEntitlements | null;
	/**
	 * True when the key carries a good signature from a signing authority we have
	 * RETIRED — structurally sound, correctly signed, simply no longer trusted.
	 *
	 * Exists so that case can be reported as itself. It is indistinguishable from
	 * a typo through `verify` alone, and telling a customer holding a genuine key
	 * that it is "invalid" sends them to check their clipboard instead of asking
	 * for the replacement they actually need.
	 */
	isRetired(rawKey: string): boolean;
}
