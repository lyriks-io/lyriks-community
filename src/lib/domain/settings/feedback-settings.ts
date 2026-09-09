/**
 * Whether the feedback dialog may OFFER its online channel: a browser-side,
 * user-initiated POST to the Lyriks feedback relay. App-level and
 * admin-owned, like the AI switch.
 *
 * The zero-egress posture holds in every position of this switch: the
 * appliance server never calls out, and even with the channel offered nothing
 * leaves the user's browser until that user first picks "online" (asked once,
 * stored per browser) and then presses Send. Defaulting to offered is
 * therefore safe: the switch governs an offer, not an emission.
 */
export interface FeedbackSettings {
	readonly onlineEnabled: boolean;
}

export function defaultFeedbackSettings(): FeedbackSettings {
	return { onlineEnabled: true };
}

/** Coerce an unknown (parsed JSON / request body) into a valid FeedbackSettings. */
export function normalizeFeedbackSettings(input: unknown): FeedbackSettings {
	if (!input || typeof input !== 'object') return defaultFeedbackSettings();
	const o = input as Record<string, unknown>;
	if (typeof o.onlineEnabled === 'boolean') return { onlineEnabled: o.onlineEnabled };
	return defaultFeedbackSettings();
}
