import type { RequestEvent } from '@sveltejs/kit';
import type { CallerReach } from '$application/portfolio/project-visibility';

/** What a hook may read from the request: the session and the cookies. */
export type HookEvent = Pick<RequestEvent, 'locals' | 'cookies'>;

/** The still-open invitation a sign-in link points at, when there is one. */
export interface InvitationContext {
	/** The token carried by the redirect, if the link is an invitation at all. */
	readonly token: string | null;
	/** What the invitation is for, or null when it is unknown, used or expired. */
	readonly invitation: { readonly email: string; readonly workspaceName: string | null } | null;
}

/**
 * Request-time extension points the Enterprise overlay fills in. The
 * open-source build has none of them (`null`), and every caller has a plain
 * single-operator answer for that case: nothing scoped, no invitation, no
 * member administration to show.
 */
export interface EnterpriseHooks {
	/**
	 * What the caller reaches in each workspace they belong to (role and folders),
	 * or null when nothing is scoped. One reading per request answers every
	 * question of the request about a project's or a folder's own workspace.
	 */
	callerReach(event: HookEvent): Promise<CallerReach | null>;
	/** The invitation behind a /login redirect, read from the identity source. */
	invitationBehind(redirectTo: string): Promise<InvitationContext>;
	/** Page data for the overlay's Settings panels (rendered by its own components). */
	settingsMembers(event: HookEvent): Promise<unknown>;
	settingsReclaim(event: HookEvent): Promise<unknown>;
}
