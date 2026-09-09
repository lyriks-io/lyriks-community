/**
 * Product licensing — the pure domain of offline activation.
 *
 * Lyriks ships as an air-gapped appliance with ZERO runtime egress, so a licence
 * can never be validated by calling home. Instead a licence is a *signed* set of
 * entitlements: lyriks.io signs them with a private key at purchase time, and the
 * appliance verifies the signature locally against a bundled public key (see the
 * `LicenseVerifierPort` adapter). This module owns only the entitlements shape and
 * the pure rules over them (is it valid *now*, how long is left) — no crypto, no
 * IO, no clock. Time is always passed in as an ISO string from the edge.
 */

/**
 * Wire prefix of a licence key. The full grammar is
 * `lyk_<base64url(payload)>.<base64url(signature)>` — see the verifier adapter.
 * Owned here so both the verifier and the pure key extractor agree on one literal.
 */
export const LICENSE_KEY_PREFIX = 'lyk_';

/**
 * Pull the first licence key out of arbitrary text. Customers receive the key by
 * email and may hand us a whole message body, a saved `.lyrkey` attachment, or the
 * bare token — this finds the `lyk_…` run wherever it sits and ignores surrounding
 * prose. Pure and IO-free: the caller (a UI drop handler) reads the bytes; we only
 * parse. Returns null when no token-shaped run is present. Note this validates
 * *shape*, not the signature — the verifier remains the sole authority on validity.
 */
export function extractLicenseKey(text: string): string | null {
	const match = text.match(/lyk_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
	return match ? match[0] : null;
}

/**
 * The product's two editions, ordered from least to most entitled. Closed on
 * purpose: this same list is what a key grants and what an install declares
 * through `LYRIKS_EDITION`, so there is one vocabulary and nothing to keep in
 * step. `community` is free and always perpetual, but it is a licence like any
 * other: it is minted per account on lyriks.io, so every install is identified
 * even when nothing is paid for.
 */
export const LICENSE_EDITIONS = ['community', 'enterprise'] as const;
export type LicenseEdition = (typeof LICENSE_EDITIONS)[number];

export function isLicenseEdition(value: unknown): value is LicenseEdition {
	return typeof value === 'string' && (LICENSE_EDITIONS as readonly string[]).includes(value);
}

/** Position on the entitlement ladder; only the order matters. */
const EDITION_RANK: Record<LicenseEdition, number> = { community: 0, enterprise: 1 };

/**
 * Whether a key's edition entitles the edition this install declares. Higher
 * editions cover lower ones, so an Enterprise key activates a Community install
 * (which is also how an upgrade avoids a licence wall: activate before the
 * cutover). The reverse is refused, which is what stops a free Community key from
 * unlocking an Enterprise deployment. An install that declares nothing (a dev
 * server, the standalone MAP) has no edition to bind to and accepts any key.
 */
export function licenseCoversInstall(
	keyEdition: LicenseEdition,
	installEdition: string | undefined
): boolean {
	if (!isLicenseEdition(installEdition)) return true;
	return EDITION_RANK[keyEdition] >= EDITION_RANK[installEdition];
}

/**
 * The signed payload minted on lyriks.io (one per Stripe purchase). Every field is
 * covered by the signature — tampering with `seats` or `expiresAt` invalidates the
 * key. `expiresAt: null` is a perpetual licence; `seats` is the number of paid
 * seats (>= 1).
 */
export interface LicenseEntitlements {
	/** Opaque unique id from the seller (ties back to the Stripe purchase). */
	readonly licenseId: string;
	/** Organisation the licence was issued to — shown in the activation panel. */
	readonly customer: string;
	/**
	 * The address this licence was issued to, lower-cased at mint time.
	 *
	 * Optional because keys minted before this claim existed are still valid and
	 * must keep activating; `licenseBoundEmail` falls back to the address the
	 * signup flow has always embedded in `customer` for those. New keys always
	 * carry it: the minter refuses to sign without one.
	 */
	readonly email?: string;
	readonly edition: LicenseEdition;
	/** Paid seats. Advisory in the single-tenant MAP; enforced upstream by the back. */
	readonly seats: number;
	/** ISO timestamp the licence was issued. */
	readonly issuedAt: string;
	/** ISO expiry, or null for a perpetual licence. */
	readonly expiresAt: string | null;
}

/** Resolved activation state for the whole product (single-tenant, per install). */
export type LicenseStatus =
	/** No licence key stored — the product is not activated. */
	| 'unlicensed'
	/** A key is stored but its signature no longer verifies (tampered / wrong build). */
	| 'invalid'
	/** Valid signature, but `expiresAt` is in the past. */
	| 'expired'
	/**
	 * Valid signature, but the system clock is now earlier than a time this install
	 * has already observed — i.e. the clock was rolled back, the one offline signal
	 * that a time-limited licence is being replayed past its expiry. Fails closed.
	 */
	| 'tampered'
	/**
	 * Valid signature, but the key grants a lower edition than this install runs
	 * (a Community key pasted into an Enterprise appliance). Nothing is wrong with
	 * the key; it simply does not entitle this deployment.
	 */
	| 'wrong_edition'
	/** Valid signature, not expired — the product is activated. */
	| 'active';

/** Client-safe projection of the current licence state (never carries the raw key). */
export interface LicenseView {
	readonly status: LicenseStatus;
	readonly entitlements: LicenseEntitlements | null;
	/** Whole days until expiry; null when perpetual or when there is no valid licence. */
	readonly daysRemaining: number | null;
	/** ISO timestamp the key was activated on this install, or null. */
	readonly activatedAt: string | null;
}

const MS_PER_DAY = 86_400_000;

/**
 * Grace window before a backward clock reads as tampering. Legitimate corrections
 * (an NTP step, an RTC drift fix after boot) move the clock back by minutes or
 * hours; a rollback that revives an expired licence must cross days. 24h swallows
 * the whole false-positive class while leaving the attack detectable.
 */
export const CLOCK_ROLLBACK_TOLERANCE_MS = 86_400_000;

/**
 * Minimum gap between clock-floor writes. The floor only needs day-level
 * resolution (see the tolerance above), so advancing at most hourly keeps the
 * per-request read path free of writes without weakening detection.
 */
export const CLOCK_FLOOR_THROTTLE_MS = 3_600_000;

/** Whole days from `nowIso` until `expiresAt` (negative once past). */
export function daysUntil(expiresAt: string, nowIso: string): number {
	const end = Date.parse(expiresAt);
	const now = Date.parse(nowIso);
	if (Number.isNaN(end) || Number.isNaN(now)) return 0;
	return Math.ceil((end - now) / MS_PER_DAY);
}

/** True once the licence's expiry has passed (perpetual licences never expire). */
export function isExpired(entitlements: LicenseEntitlements, nowIso: string): boolean {
	if (entitlements.expiresAt === null) return false;
	const end = Date.parse(entitlements.expiresAt);
	const now = Date.parse(nowIso);
	if (Number.isNaN(end) || Number.isNaN(now)) return true; // unparseable expiry = not trustworthy
	return end <= now;
}

/**
 * The licence block of a support/feedback report: everything the Account panel
 * shows, never the raw key (the view cannot even carry it). Plain text so it
 * survives a mail client and a clipboard.
 */
export function licenseDigest(view: LicenseView): string {
	if (!view.entitlements) return `Licence: none (${view.status.replace('_', ' ')})`;
	const e = view.entitlements;
	const seats = `${e.seats} seat${e.seats === 1 ? '' : 's'}`;
	const expiry = e.expiresAt
		? `expires ${e.expiresAt.slice(0, 10)}${view.daysRemaining != null ? ` (${view.daysRemaining} days left)` : ''}`
		: 'perpetual';
	return [
		`Licence: ${e.licenseId} (${e.edition}, ${seats}, ${view.status.replace('_', ' ')})`,
		`  Licensed to: ${e.customer}`,
		`  Issued ${e.issuedAt.slice(0, 10)}, ${expiry}`,
		`  Activated: ${view.activatedAt ? view.activatedAt.slice(0, 10) : 'not yet'}`
	].join('\n');
}

/**
 * True when the clock appears rolled back: `nowIso` is more than the tolerance
 * behind the highest instant this install has ever recorded (`clockFloorIso`).
 * With no floor yet, or a genuine forward clock, this is false. An unreadable
 * `now` is treated as tampering (fail closed). An unreadable *floor* fails open
 * on purpose: the floor is our own datastore's value, and whoever can corrupt it
 * can equally delete the row (which yields `null` → open by design) — failing
 * closed there would only brick honest installs on corruption, not stop anyone.
 * This is the only offline defence against pushing the system clock back to
 * revive an expired, time-limited licence.
 */
export function isClockRolledBack(nowIso: string, clockFloorIso: string | null): boolean {
	if (!clockFloorIso) return false;
	const now = Date.parse(nowIso);
	if (Number.isNaN(now)) return true;
	const floor = Date.parse(clockFloorIso);
	if (Number.isNaN(floor)) return false;
	return now < floor - CLOCK_ROLLBACK_TOLERANCE_MS;
}

/**
 * Whether the clock floor is due an advance to `nowIso`: yes when no (readable)
 * floor exists yet, or when `nowIso` has moved past it by at least the throttle.
 * Pure policy — callers decide *when* to consult it; the store enforces the
 * monotonic write itself. An unreadable `now` never advances (garbage must not
 * become the floor).
 */
export function shouldAdvanceClockFloor(nowIso: string, clockFloorIso: string | null): boolean {
	const now = Date.parse(nowIso);
	if (Number.isNaN(now)) return false;
	if (!clockFloorIso) return true;
	const floor = Date.parse(clockFloorIso);
	if (Number.isNaN(floor)) return true;
	return now >= floor + CLOCK_FLOOR_THROTTLE_MS;
}

/** What the fold below needs beyond the key itself to resolve a status. */
export interface LicenseContext {
	/**
	 * What an unusable key resolves to: an empty store is `unlicensed`, a stored
	 * key whose signature no longer verifies is `invalid`.
	 */
	readonly absentStatus?: Extract<LicenseStatus, 'unlicensed' | 'invalid'>;
	/** Highest instant this install has observed, for the rollback tripwire. */
	readonly clockFloorIso?: string | null;
	/** Edition this install declares; undefined leaves the key unbound. */
	readonly installEdition?: string;
}

/**
 * Fold verified entitlements + the moment they were activated into the resolved
 * view. `entitlements === null` means "no valid signature" — the caller decides
 * whether that was an empty store (`unlicensed`) or a failed verify (`invalid`).
 */
export function evaluateLicense(
	entitlements: LicenseEntitlements | null,
	activatedAt: string | null,
	nowIso: string,
	context: LicenseContext = {}
): LicenseView {
	const { absentStatus = 'unlicensed', clockFloorIso = null, installEdition } = context;
	if (!entitlements) {
		return { status: absentStatus, entitlements: null, daysRemaining: null, activatedAt: null };
	}
	// The edition mismatch is checked first: it depends on neither the clock nor
	// the expiry, so reporting it ahead of them gives the holder of a genuine key
	// the one message that actually explains the refusal.
	if (!licenseCoversInstall(entitlements.edition, installEdition)) {
		return { status: 'wrong_edition', entitlements, daysRemaining: null, activatedAt };
	}
	// Clock rollback is checked before expiry: a rolled-back clock could otherwise
	// make an expired licence read as `active`, which is exactly what this blocks.
	// daysRemaining stays null — a countdown computed from a clock we just judged
	// rolled back would be noise.
	if (isClockRolledBack(nowIso, clockFloorIso)) {
		return { status: 'tampered', entitlements, daysRemaining: null, activatedAt };
	}
	const expired = isExpired(entitlements, nowIso);
	return {
		status: expired ? 'expired' : 'active',
		entitlements,
		daysRemaining: entitlements.expiresAt ? daysUntil(entitlements.expiresAt, nowIso) : null,
		activatedAt
	};
}

/** The one predicate the activation gate keys off: may the product run? */
export function isLicenseValid(view: LicenseView): boolean {
	return view.status === 'active';
}

/** Structural guard for a decoded payload, run right after signature verification. */
/**
 * The address a licence is bound to, or null when it carries no binding at all.
 *
 * Two sources, in order of authority:
 *
 *  1. the signed `email` claim, on every key minted since the claim exists;
 *  2. the `<address>` the signup flow has always written into the free-text
 *     `customer` label ("Ada Lovelace <ada@example.com>"), which covers every
 *     key issued through get.lyriks.io before that.
 *
 * A key minted by hand for an organisation ("Acme Corp") has neither, and this
 * returns null: callers must treat that as "cannot prove who this key belongs
 * to" rather than as a match.
 */
export function licenseBoundEmail(entitlements: LicenseEntitlements): string | null {
	const claimed = entitlements.email?.trim().toLowerCase();
	if (claimed) return claimed;
	// Two shapes reach us from before the claim existed, and both are addresses
	// a customer would recognise as their own: the signup flow's
	// "Ada Lovelace <ada@example.com>", and the bare "ada@example.com" the
	// minting CLI documents for a Community key. An organisation name ("Acme
	// Corp") matches neither, which is the whole point.
	const label = entitlements.customer.trim();
	const embedded = label.match(/<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/);
	if (embedded) return embedded[1].toLowerCase();
	return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(label) ? label.toLowerCase() : null;
}

/**
 * Whether `email` is the address this licence was issued to.
 *
 * `unbound` is deliberately its own answer rather than a silent pass: the
 * first-run screen pairs an address with a key precisely so an install cannot
 * be claimed by someone the licence never named, and a key that cannot answer
 * the question must not be able to satisfy it either.
 */
export function licenseEmailMatches(
	entitlements: LicenseEntitlements,
	email: string
): 'match' | 'mismatch' | 'unbound' {
	const bound = licenseBoundEmail(entitlements);
	if (bound === null) return 'unbound';
	return bound === email.trim().toLowerCase() ? 'match' : 'mismatch';
}

export function isLicenseEntitlements(value: unknown): value is LicenseEntitlements {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.licenseId === 'string' &&
		v.licenseId.length > 0 &&
		typeof v.customer === 'string' &&
		v.customer.length > 0 &&
		(v.email === undefined || typeof v.email === 'string') &&
		isLicenseEdition(v.edition) &&
		typeof v.seats === 'number' &&
		Number.isFinite(v.seats) &&
		v.seats >= 1 &&
		typeof v.issuedAt === 'string' &&
		(v.expiresAt === null || typeof v.expiresAt === 'string')
	);
}

/**
 * Whether the activation wall is enforced for this install.
 *
 * **Every declared edition is enforced**, Community included. Enforcement used to
 * be the flag alone, which made a licensed deployment's entitlement rest on one
 * line of a file the customer owns — remove it and the whole app was reachable,
 * with a configuration that looked deliberate. Deriving it from the declared
 * edition means the appliance cannot be configured into an unlicensed state.
 *
 * Community keys are free and perpetual, so the wall costs its operator one paste
 * and buys the one thing an air-gapped product cannot otherwise have: knowing who
 * runs it. The flag can therefore only turn enforcement ON for an install that
 * declares no edition (the standalone MAP), never off for one that does.
 *
 * `dev` exempts the development server: `pnpm dev:community` sets the same
 * edition a shipped appliance declares without being one, and walling it would
 * put a licence key in the way of every local boot.
 */
export function isLicenseEnforced(input: {
	edition: string | undefined;
	flag: string | undefined;
	dev?: boolean;
}): boolean {
	if (input.flag === '1') return true;
	if (input.dev) return false;
	return isLicenseEdition(input.edition);
}

/**
 * Whether the login wall is enforced for this install: the same rule as the
 * activation wall, for the same reason.
 *
 * **Every declared edition requires a session**, Community included: its one
 * operator account is a real account, and an install that declares itself an
 * edition is a product someone runs, not a sandbox. The flag can therefore only
 * turn the wall ON for a build that declares no edition, never off for one that
 * does: a `.env` line cannot leave a Community or Enterprise install open to
 * whoever reaches its port.
 *
 * `dev` exempts the development server, exactly like the licence: `pnpm
 * dev:community` declares the edition without being an install, and a login on
 * every local boot would put the operator account in the way of development.
 */
export function isAuthEnforced(input: {
	edition: string | undefined;
	flag: string | undefined;
	dev?: boolean;
}): boolean {
	if (input.flag === '1') return true;
	if (input.dev) return false;
	return isLicenseEdition(input.edition);
}
