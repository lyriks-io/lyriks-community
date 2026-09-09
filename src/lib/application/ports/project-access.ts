/**
 * Per-user authorization for a project. Lyriks-back is the identity authority:
 * it owns workspace membership + roles. This port lets the platform ask, for a
 * given caller token, whether that user may read or write a *local* project
 * (resolved to its back project via the back link).
 *
 * Only consulted when auth is enforced (LYRIKS_AUTH_REQUIRED=1). In the
 * standalone appliance / dev mode there is a single trusted user and no
 * per-user authorization is applied.
 */
export type AccessAction = 'read' | 'write';

export type AccessDecision =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: 'unauthenticated' | 'forbidden' | 'not_found' };

export interface ProjectAccessPort {
	authorize(
		localProjectId: string,
		token: string | null,
		action: AccessAction
	): Promise<AccessDecision>;
}
