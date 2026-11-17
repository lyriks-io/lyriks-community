/**
 * Whether the feedback dialog may OFFER its online channel: a browser-side,
 * user-initiated POST to the Lyriks feedback relay. App-level and
 * admin-owned, answered in the configuration of the installation.
 *
 * Off until an administrator ticks it: the post leaves from the browser and
 * only on Send, but it still leaves, and what leaves an installation is that
 * administrator's decision.
 */
export interface FeedbackSettings {
	readonly onlineEnabled: boolean;
}

export function defaultFeedbackSettings(): FeedbackSettings {
	return { onlineEnabled: false };
}

/** Coerce an unknown (parsed JSON / request body) into a valid FeedbackSettings. */
export function normalizeFeedbackSettings(input: unknown): FeedbackSettings {
	if (!input || typeof input !== 'object') return defaultFeedbackSettings();
	const o = input as Record<string, unknown>;
	if (typeof o.onlineEnabled === 'boolean') return { onlineEnabled: o.onlineEnabled };
	return defaultFeedbackSettings();
}
