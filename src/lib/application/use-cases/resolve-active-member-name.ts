import { memberNameFromEmail } from '$domain/team/member-name';
import type { OperatorProfileRepositoryPort, SessionPort, WorkspaceMemberNamePort } from '../ports';

/**
 * Resolves the display name of the member driving the current request — the
 * name Lyriks attributes work to (e.g. the behavior dashboard's `user=` deep
 * link). One name, resolved in preference order:
 *
 *  1. Enterprise: the caller's back-resolved workspace member name.
 *  2. Community / solo: the operator profile's display name.
 *  3. Fallback: derived from the session email ("Developer" for the dev session).
 *
 * IO failures degrade to the next source, never throw — a link must always
 * render.
 */
export class ResolveActiveMemberNameUseCase {
	constructor(
		private readonly session: SessionPort,
		private readonly members: WorkspaceMemberNamePort,
		private readonly operatorProfile: OperatorProfileRepositoryPort
	) {}

	async execute(activeWorkspaceId: string | null): Promise<string> {
		const session = this.session.current();

		if (session.isAuthenticated && activeWorkspaceId) {
			const memberName = await this.members.nameOf(activeWorkspaceId, session.email).catch(() => '');
			if (memberName) return memberName;
		}

		const solo = (await this.operatorProfile.load().catch(() => null))?.displayName.trim();
		if (solo) return solo;

		return memberNameFromEmail(session.email);
	}
}
