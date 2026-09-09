import { AsyncLocalStorage } from 'node:async_hooks';
import type { Session } from '$application/ports';

/**
 * Per-request server context, propagated implicitly through the async call tree
 * (AsyncLocalStorage) so deep adapters can read the caller's identity without
 * threading a token argument through every use-case signature.
 *
 * It carries the back JWT of the current user, so the Lyriks-back mirror acts AS
 * that user (real-identity propagation) instead of a shared dev account when auth
 * is enforced, plus the client-safe session so the session port answers with the
 * real caller rather than an anonymous placeholder. Set at the edge
 * (hooks.server.ts) and read by the back HTTP adapter and the session adapter.
 * Concurrency-safe: each request gets its own store.
 */
export interface RequestContext {
	/** The caller's back bearer token, or null when none / auth disabled. */
	readonly token: string | null;
	/** The caller's selected ("active") workspace id, or null if none chosen. */
	readonly workspaceId: string | null;
	/** The caller's client-safe session (never the token), as resolved at the edge. */
	readonly session: Session;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	return storage.run(ctx, fn);
}

/** The current request's back token, or null outside a request / when absent. */
export function currentRequestToken(): string | null {
	return storage.getStore()?.token ?? null;
}

/** The current request's active workspace id, or null when none is selected. */
export function currentRequestWorkspace(): string | null {
	return storage.getStore()?.workspaceId ?? null;
}

/** The current request's session, or null outside a request (boot, timers, CLI). */
export function currentRequestSession(): Session | null {
	return storage.getStore()?.session ?? null;
}
