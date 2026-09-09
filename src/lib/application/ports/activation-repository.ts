/** A licence key stored on this install, plus when it was activated here. */
export interface StoredActivation {
	/** The raw signed key exactly as entered — re-verified on every read. */
	readonly key: string;
	/** ISO timestamp the key was activated on this install. */
	readonly activatedAt: string;
}

/**
 * Outbound port for the single, install-wide activation record. Single-tenant per
 * appliance, so there is exactly zero or one row. We persist only the raw key
 * (not the decoded entitlements) so the entitlements are always re-derived by
 * verifying the signature — DB tampering can never grant access.
 */
export interface ActivationRepositoryPort {
	load(): Promise<StoredActivation | null>;
	/**
	 * Store `activation` as the current key, keeping whatever it replaces as the
	 * superseded one. Replacing a licence used to destroy the only copy of a
	 * working key, so a renewal that verified but granted less than expected had
	 * no way back; {@link loadPrevious} and a restore are what make trying a new
	 * key a reversible act.
	 */
	save(activation: StoredActivation): Promise<void>;
	/** The key this install ran on before the current one, if there was one. */
	loadPrevious(): Promise<StoredActivation | null>;
	clear(): Promise<void>;
	/**
	 * The highest wall-clock instant (ISO) this install has ever observed — a
	 * monotonic "clock floor", or null if never recorded. Seeing a `now` earlier
	 * than this means the system clock was rolled back. Deliberately NOT reset by
	 * {@link clear}: the tripwire outlives a key swap so it cannot be disarmed by
	 * deactivating and re-activating. Recovery from a genuine bad-clock episode is
	 * an operator action on the datastore itself (documented), matching the trust
	 * model where box/DB access is the trusted operator, not an end user.
	 */
	readClockFloor(): Promise<string | null>;
	/**
	 * Raise the clock floor towards `nowIso`. Monotonic — the store itself never
	 * lowers the value (atomic MAX/GREATEST upsert), so concurrent advances cannot
	 * interleave into a lower floor. Callers throttle via the domain's
	 * `shouldAdvanceClockFloor` so the per-request read path stays write-free.
	 */
	advanceClockFloor(nowIso: string): Promise<void>;
	/**
	 * This install's stable identity, minted on first read and never rewritten.
	 * Shown to the operator as a registration code so they can tell us, by hand,
	 * that the key we issued is actually running somewhere (the appliance itself
	 * never reports anything). Deliberately NOT reset by {@link clear}: the same
	 * box stays the same install across key swaps and re-activations, or the code
	 * would count one deployment several times. Minting belongs to the adapter,
	 * atomically with the read, so two concurrent boots cannot mint two ids.
	 */
	ensureInstallId(nowIso: string): Promise<string>;
}
