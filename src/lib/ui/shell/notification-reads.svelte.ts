import { invalidate } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { OptimisticActs } from '$ui/evolution/optimistic-acts.svelte';
import { markNotificationsRead, NOTIFICATIONS_DEPENDENCY } from './notifications-client';

/**
 * The read marks the reader just took, shared by the bell and Home: a
 * notification opened, answered or marked read stops counting at once, in the
 * badge as on the list, until the notifications are read again; a refused
 * save puts the mark back and says so.
 */
const reads = new OptimisticActs<true>();

/** True while a read mark taken here on this notification is on its way. */
export function readHere(id: string): boolean {
	return reads.of(id) !== null;
}

/**
 * Mark notifications read at once and save it behind. `all` saves "every one"
 * (the bell's Mark all as read) while `ids` names those the page shows;
 * `reading` is what the page reads them from.
 */
export function markRead(ids: readonly string[], reading: () => unknown, all = false): Promise<boolean> {
	if (ids.length === 0) return Promise.resolve(true);
	return reads.runAll(
		ids,
		true,
		async () => {
			const saved = await markNotificationsRead(all ? 'all' : ids);
			if (!saved.ok) {
				pushToast({ level: 'error', message: `${ids.length === 1 ? 'The notification' : 'The notifications'} still read as unread: the read mark was not saved. ${saved.reason}` });
				return false;
			}
			await invalidate(NOTIFICATIONS_DEPENDENCY);
			return true;
		},
		reading
	);
}
