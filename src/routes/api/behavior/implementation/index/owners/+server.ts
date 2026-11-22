import { error, json } from '@sveltejs/kit';
import { heldKeys, indexKeyHolders, keyLookupRefusal } from '$domain/implementation';
import { readDraftHolders } from '$lib/server/index-key-holders.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Which feature declares each index key, and the unit it travels with
 * (feat-100, action af8d9001, criterion 60ba2862).
 *
 * A repository's index carries no featureId, and a sync replaces what was
 * located under every action or surface it names: to send only what changed, a
 * caller must know, for each changed key, the action or surface whose report
 * carries it and every other key of that unit. This answers that for a list of
 * keys at once, so no feature has to be read first. A key a draft of an open
 * Evolution request adds is answered with that request (criterion a501859a):
 * sent with its unit, the sync holds it on the request.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as { projectId?: unknown; keys?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	const refusal = keyLookupRefusal(body?.keys);
	if (refusal) error(400, refusal);

	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	// Which feature declares a key is what the engine resolves a sync against:
	// without it there is nothing to agree with, only a guess.
	if (!services.codeAdoption.available) error(503, 'Behavior engine unavailable');
	const keys = [...new Set(body!.keys as string[])];
	const owners = await services.findIndexKeyOwners.execute(projectId, keys);
	// Drafts are computed by the engine, one walk each: only when a key could be one a request adds,
	// one no feature declares, or a state path or event name a draft may add beside another feature.
	const draftsMayHold = owners.orphans.length > 0 || keys.some((key) => key.startsWith('state:') || key.startsWith('event:'));
	const holders = draftsMayHold ? await readDraftHolders(services, projectId) : { drafts: [], notRead: [] };
	const requests = indexKeyHolders(holders.drafts, keys);
	const held = heldKeys(holders.drafts, keys);
	return json({
		projectId,
		asked: keys.length,
		features: owners.features,
		...(requests.length > 0 ? { requests } : {}),
		orphans: owners.orphans.filter((key) => !held.has(key)),
		...(owners.unread.length > 0 ? { unread: owners.unread } : {}),
		...(holders.notRead.length > 0 ? { requestsNotRead: holders.notRead } : {})
	});
};
