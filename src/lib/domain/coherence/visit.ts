/**
 * What changed since this person last opened the Control Center on this
 * project: the ids that were open then, against the ids that are open now.
 */
export interface SeenGaps {
	gapIds: string[];
	at: string;
}

export interface VisitDelta {
	/** When the person last looked; null on a first visit. */
	lastSeenAt: string | null;
	/** Open now, not open then. */
	newIds: string[];
	/** Open then, not open now (fixed or settled since). */
	resolvedCount: number;
}

export function visitDelta(seen: SeenGaps | null, openIds: readonly string[]): VisitDelta {
	if (!seen) return { lastSeenAt: null, newIds: [], resolvedCount: 0 };
	const then = new Set(seen.gapIds);
	const now = new Set(openIds);
	return {
		lastSeenAt: seen.at,
		newIds: openIds.filter((id) => !then.has(id)),
		resolvedCount: seen.gapIds.filter((id) => !now.has(id)).length
	};
}
