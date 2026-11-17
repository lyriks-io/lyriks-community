import type { Session, SessionPort } from '$application/ports';

/**
 * The session port, answered from the per-request context the edge pins in
 * `hooks.server.ts`. The container is a process-wide singleton, so the identity
 * cannot be held on the adapter — it is read from AsyncLocalStorage on every
 * call, which keeps concurrent requests from seeing each other's user.
 *
 * Outside a request (boot migrations, the outbox drain timer, tests) there is no
 * caller: fall back to the implicit local session, matching the auth-off edge.
 */
export class RequestContextSessionAdapter implements SessionPort {
	constructor(private readonly currentRequestSession: () => Session | null) {}

	current(): Session {
		return this.currentRequestSession() ?? { isAuthenticated: true };
	}
}
