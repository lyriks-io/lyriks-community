import type { AccessAction, AccessDecision, ProjectAccessPort } from '$application/ports';

/**
 * Project authorization on a single-operator install (auth on, no Back): the
 * one account owns everything, so an authenticated caller may read and write
 * any project. The session wall in hooks is what proves the caller holds the
 * operator's credential; this only refuses a request that carries none.
 */
export class SingleOperatorProjectAccess implements ProjectAccessPort {
	async authorize(
		_localProjectId: string,
		token: string | null,
		_action: AccessAction
	): Promise<AccessDecision> {
		return token ? { ok: true } : { ok: false, reason: 'unauthenticated' };
	}
}
