import { error } from '@sveltejs/kit';
import { subscribeSectionChanges } from '$lib/server/sync-bus.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Server-Sent Events stream of live section changes for one project. Clients
 * (the project layout) open `EventSource('/api/sync/events?projectId=…&clientId=…')`
 * and call `invalidateAll()` on each `change` event so every open page refreshes
 * without a reload. Echoes back to the writing tab are suppressed by `clientId`
 * so the active editor isn't disrupted by its own save.
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

			// Comment heartbeat keeps proxies from closing an idle connection.
			heartbeat = setInterval(() => send(': ping\n\n'), 25000);
		},
		cancel() {
			if (heartbeat) clearInterval(heartbeat);
			unsubscribe?.();
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
