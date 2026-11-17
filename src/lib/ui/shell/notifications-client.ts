import { refusalOf } from './save-queue';

/** The load dependency the notifications ride on, so marking one read refreshes only them. */
export const NOTIFICATIONS_DEPENDENCY = 'app:notifications';

/** Record read marks for the signed-in reader: some notifications, or every one shown. Answers why it was refused. */
export async function markNotificationsRead(ids: readonly string[] | 'all'): Promise<{ ok: true } | { ok: false; reason: string }> {
	let res: Response;
	try {
		res = await fetch('/api/notifications/read', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(ids === 'all' ? { all: true } : { ids })
		});
	} catch {
		return { ok: false, reason: 'Check your connection.' };
	}
	return res.ok ? { ok: true } : { ok: false, reason: await refusalOf(res, 'The read mark failed') };
}
