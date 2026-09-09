/**
 * Outbound port for the current time. Injected (rather than calling `Date`
 * directly) so use-cases stay deterministic under test.
 */
export interface ClockPort {
	/** Current instant as an ISO 8601 string. */
	nowIso(): string;
}
