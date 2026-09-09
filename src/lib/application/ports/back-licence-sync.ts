/**
 * Outbound port: deliver the activated licence key to the Back, which roots its
 * multi-user seat gate in it. The platform is the activation authority (it holds
 * the raw key); the Back only ever receives it through this contract, verifies
 * its signature itself, and caps workspace members at the seats it grants.
 *
 * One concern, best-effort by contract: a delivery failure never breaks
 * activation or a page load. `null` clears the Back's licence (a deactivation).
 */
export interface BackLicenceSyncPort {
	/** Push the raw key (or null to clear). Returns whether the Back accepted it. */
	sync(rawKey: string | null): Promise<boolean>;
	/** Whether this adapter can talk to a Back at all (false in standalone). */
	readonly enabled: boolean;
}
