import { error } from '@sveltejs/kit';
import { subscribeAiActivity, subscribeLiveSignals, subscribeSectionChanges } from '$lib/server/sync-bus.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { currentPersonId } from '$lib/server/evolution-actor.server';
import type { RequestHandler } from './$types';

/**
 * Server-Sent Events stream of live section changes for one project. Clients
 * (the project layout) open `EventSource('/api/sync/events?projectId=…&clientId=…')`
 * and call `invalidateAll()` on each `change` event so every open page refreshes
 * without a reload. Echoes back to the writing tab are suppressed by `clientId`
 * so the active editor isn't disrupted by its own save. An `activity` event
 * says the person's AI read or wrote one Evolution request (nothing changed
 * by itself, so nothing reloads): an open dossier page follows it live. A
 * `live` event says what the reader's own AI does in a live session; another
 * person's session never reaches this stream (ac-evo-live-one-agent).
 *
 * Authorized like any project-scoped read: without `read` access on `projectId`,
 * the subscription is refused, so a caller can't use the change feed as an
 * activity oracle on projects they can't see. (No-op when auth is off.)
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	const clientId = url.searchParams.get('clientId') ?? '';

	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');

	let unsubscribe: (() => void) | null = null;
	let unsubscribeActivity: (() => void) | null = null;
	let unsubscribeLive: (() => void) | null = null;
	const reader = currentPersonId(event.locals.services).trim().toLowerCase();
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					closed = true; // stream already torn down — stop pushing.
				}
			};

			// Tell EventSource to retry quickly if the connection drops.
			send('retry: 3000\n\n');

			unsubscribe = subscribeSectionChanges((change) => {
				if (change.projectId !== projectId) return;
				if (clientId && change.origin === clientId) return; // don't echo to the writer
				send(`event: change\ndata: ${JSON.stringify({ section: change.section })}\n\n`);
			});
			unsubscribeActivity = subscribeAiActivity((activity) => {
				if (activity.projectId !== projectId) return;
				// The section rides along on a project-wide activity: a retrospecification names what the AI is writing.
				send(`event: activity\ndata: ${JSON.stringify({ requestId: activity.requestId, act: activity.act, ...(activity.section ? { section: activity.section } : {}) })}\n\n`);
			});
			unsubscribeLive = subscribeLiveSignals((signal) => {
				if (signal.projectId !== projectId || signal.personId.trim().toLowerCase() !== reader) return;
				send(`event: live\ndata: ${JSON.stringify(signal)}\n\n`);
			});

			// Comment heartbeat keeps proxies from closing an idle connection.
			heartbeat = setInterval(() => send(': ping\n\n'), 25000);
		},
		cancel() {
			if (heartbeat) clearInterval(heartbeat);
			unsubscribe?.();
			unsubscribeActivity?.();
			unsubscribeLive?.();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive'
		}
	});
};
