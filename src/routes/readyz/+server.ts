import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { busBackend } from '$lib/server/sync-bus.server';
import type { RequestHandler } from './$types';

/**
 * Readiness probe: the app can serve traffic — the platform PostgreSQL datastore
 * answers a trivial query. Returns 503
 * when it isn't reachable so the orchestrator/load balancer holds traffic off
 * this instance until it recovers. Unauthenticated (exempted in hooks).
 *
 * Also exposes the active sync-bus backend so a multi-replica deployment can
 * assert every node runs `LYRIKS_BUS=postgres` (a replica silently on the
 * memory bus would not see the others' section changes), and — when the back
 * mirror is configured — the durable back-sync outbox gap (`backSync`), so an
 * operator can see how far Back lags behind local saves. Both are additive:
 * the original `{ status, bus }` shape is unchanged.
 */
export const GET: RequestHandler = async () => {
	try {
		const services = getServices();
		await services.pingDatastore();
		const body: Record<string, unknown> = { status: 'ready', bus: busBackend() };
		if (services.backSyncConfigured()) {
			const { count, oldestQueuedAt } = await services.backSyncOutbox.pending();
			body.backSync = { pending: count, oldestQueuedAt };
		}
		return json(body);
	} catch (e) {
		return json(
			{ status: 'unavailable', bus: busBackend(), detail: e instanceof Error ? e.message : 'db error' },
			{ status: 503 }
		);
	}
};
