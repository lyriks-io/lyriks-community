/**
 * The single operator's editable profile in Community / solo editions (no
 * identity provider). Enterprise identity is owned by lyriks-back and is not
 * expressed here. App-level, single-row: one trusted operator per install.
 */
export interface OperatorProfile {
	/** Display name the operator chose for themselves. Empty until set. */
	readonly displayName: string;
}

export function defaultOperatorProfile(): OperatorProfile {
	return { displayName: '' };
}

/** Coerce an unknown (parsed JSON / request body) into a valid OperatorProfile. */
export function normalizeOperatorProfile(input: unknown): OperatorProfile {
	if (!input || typeof input !== 'object') return defaultOperatorProfile();
	const o = input as Record<string, unknown>;
	const displayName = typeof o.displayName === 'string' ? o.displayName.trim().slice(0, 80) : '';
	return { displayName };
}
