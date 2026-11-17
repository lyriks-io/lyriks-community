import type { RequestEvent } from '@sveltejs/kit';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { historyLines, type HistoryLine } from '$domain/retrospec';
import { isAdmin } from './admin.server';
import { resolveRole } from './evolution-actor.server';

type Caller = Pick<RequestEvent, 'locals' | 'cookies'>;

/** An administrator of the instance, or an owner or admin of the active workspace. */
async function callerAdministers(event: Caller): Promise<boolean> {
	if (isAdmin(event)) return true;
	const role = await resolveRole(event.locals.services, event.cookies.get('lyriks_active_ws'));
	return role === 'owner' || role === 'admin';
}

/**
 * The history of actions of a project (criterion 64d191d6), or null for anyone
 * who does not administer: it names people and what they decided, so it never
 * leaves the server for them, hidden or not.
 */
export async function readActionHistory(event: Caller, projectId: string): Promise<HistoryLine[] | null> {
	if (!(await callerAdministers(event))) return null;
	const { doc } = await loadRetrospecDocument(event.locals.services.sectionDocuments, projectId);
	return historyLines(doc);
}
