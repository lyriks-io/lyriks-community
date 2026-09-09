import { env } from '$env/dynamic/private';

/**
 * The public half of the Lyriks licence signing key, BUNDLED into every build.
 * The matching PRIVATE key lives only on lyriks.io (the seller side) and mints
 * signed keys at purchase time — it must never appear in this repo or on an
 * appliance. Verifying against a compiled-in public key is what lets activation
 * work fully offline / air-gapped: no key server, no phone-home.
 *
 * A build MAY point at a different signing authority (a reseller or an internal
 * test key) via `LYRIKS_LICENSE_PUBLIC_KEY` — a PEM SPKI block, or the bare base64
 * body, with real or `\n`-escaped newlines. That override swaps the whole TRUST
 * ANCHOR, so anyone who can set it can trust their own signing key and self-issue
 * licences. It is therefore INERT unless the build also opts in explicitly with
 * `LYRIKS_LICENSE_ALLOW_KEY_OVERRIDE=1`. A shipped customer appliance leaves that
 * flag unset and can only ever trust the bundled Lyriks key — no self-signing.
 */
const BUNDLED_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3A++oQWwEqCqpJRclkudJizgabEuRsELt/ZfaZ/0ujE=
-----END PUBLIC KEY-----`;

/**
 * Signing authorities we no longer trust, kept so a key minted by one can be
 * RECOGNISED — never accepted.
 *
 * Rotating the signing key silently invalidates every licence already issued
 * under the old one, and the customer holding such a key sees only "invalid".
 * That happened here: the key below was retired on 2026-07-15 because its
 * private half was ephemeral and had been lost, on the recorded assumption that
 * no issued keys were in use. At least one was — a customer licence dated
 * 2026-07-07 — which no build since has been able to activate, with nothing in
 * the failure to suggest asking for a replacement.
 *
 * Listing it does NOT re-trust it. The private half's handling cannot be
 * accounted for, and licences are the only thing enforcing the entitlement on
 * hardware we do not control, so a key that might have leaked must stay
 * refused. What this buys is an accurate answer: "issued by a retired signing
 * authority, ask for a replacement" instead of "invalid".
 */
const RETIRED_PUBLIC_KEY_PEMS = [
	// Retired 2026-07-15 (9c22acc) — ephemeral private key, lost.
	`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAcpylplhcMEqL/tGCQOcQs+FeZRNvynMdMGJLZvhyLCI=
-----END PUBLIC KEY-----`
];

/** The retired authorities, for recognition only. */
export function retiredLicensePublicKeyPems(): readonly string[] {
	return RETIRED_PUBLIC_KEY_PEMS;
}

export function licensePublicKeyPem(): string {
	const override = (env.LYRIKS_LICENSE_PUBLIC_KEY ?? '').trim();
	if (!override) return BUNDLED_PUBLIC_KEY_PEM;

	// The override is a trust-anchor swap — refuse it unless a build has explicitly
	// opted in. This keeps the reseller/test capability while making a stock
	// appliance unable to trust any signing key but Lyriks's.
	if (env.LYRIKS_LICENSE_ALLOW_KEY_OVERRIDE !== '1') {
		console.warn(
			'[lyriks][SECURITY] LYRIKS_LICENSE_PUBLIC_KEY is set but IGNORED — the licence ' +
				'trust-anchor override is disabled. Set LYRIKS_LICENSE_ALLOW_KEY_OVERRIDE=1 only on ' +
				'a reseller/internal build that intentionally trusts a different signing key.'
		);
		return BUNDLED_PUBLIC_KEY_PEM;
	}
	const normalized = override.replace(/\\n/g, '\n');
	if (normalized.includes('BEGIN')) return normalized;
	return `-----BEGIN PUBLIC KEY-----\n${override}\n-----END PUBLIC KEY-----`;
}
