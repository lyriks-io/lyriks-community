import type { ActivityEvent } from './activity';

/**
 * What one person has seen of a project's activity: every notification up to
 * a moment ("Mark all as read"), and the ones they opened one by one since.
 */
export interface ActivityReads {
	readonly readBefore: string | null;
	readonly readIds: readonly string[];
}

export const NO_READS: ActivityReads = { readBefore: null, readIds: [] };

/** How many single read marks are kept: older ones are covered by the next "Mark all as read" anyway. */
const MAX_READ_IDS = 500;

export function isUnread(event: Pick<ActivityEvent, 'id' | 'at'>, reads: ActivityReads): boolean {
	if (reads.readBefore && event.at <= reads.readBefore) return false;
	return !reads.readIds.includes(event.id);
}

export function markRead(reads: ActivityReads, ids: readonly string[]): ActivityReads {
	const readIds = [...new Set([...reads.readIds, ...ids])].slice(-MAX_READ_IDS);
	return { ...reads, readIds };
}

export function markAllRead(reads: ActivityReads, now: string): ActivityReads {
	// A run put aside is not a notification read: Mark all as read leaves it hidden (action a6a79b22).
	return { ...reads, readBefore: now, readIds: reads.readIds.filter((id) => id.startsWith('run:')) };
}

/** A stored document read back, whatever an older version of it held. */
export function parseReads(raw: unknown): ActivityReads {
	if (!raw || typeof raw !== 'object') return NO_READS;
	const r = raw as Record<string, unknown>;
	const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
	return {
		readBefore: iso(r.readBefore),
		readIds: Array.isArray(r.readIds) ? r.readIds.filter((x): x is string => typeof x === 'string') : []
	};
}
