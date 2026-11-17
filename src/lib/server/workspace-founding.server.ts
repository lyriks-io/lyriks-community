import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { AppServices } from '$composition/container.server';
import { BackHttpError, type WorkspaceSummary } from '$application/ports';
import { isAdmin } from './admin.server';

/** What Home tells a signed-in person in no workspace when they may not found one. */
export const ASK_YOUR_ADMINISTRATOR =
	'You are not a member of any workspace yet. Ask your administrator to invite you to one.';

/**
 * Whether the caller may found a workspace from Home. An administrator
 * provisions workspaces and invites people into them (docs/deployment/09):
 * founding one is for an administrator of the installation (the licence holder
 * or an allowlisted address), or for anyone where the operator opted into
 * self-provisioning (LYRIKS_AUTO_WORKSPACE=1, small installs). Without sign-in
 * there are no teams, so nothing is refused. The team server checks again.
 */
export function mayFoundWorkspace(event: Pick<RequestEvent, 'locals'>): boolean {
	if (!event.locals.authRequired) return true;
	return env.LYRIKS_AUTO_WORKSPACE === '1' || isAdmin(event);
}

/** What founding a workspace came to: the workspace, the team server's reason for refusing the founder, or nothing taken. */
export type Founding = { readonly created: WorkspaceSummary } | { readonly refused: string } | null;

/** A reason the team server words in lower case, as the sentence Home shows. */
function asSentence(reason: string): string {
	const text = reason.trim();
	const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
	return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * Found a workspace for the caller on the team server. The team server checks
 * who may found one itself (an owner or admin of a workspace, the first account
 * of the installation, or anyone where the operator allowed self-provisioning)
 * and that a seat is free: its refusal comes back with its reason, so an
 * administrator of the installation it refuses reads why, never a "try again"
 * that cannot succeed (rule 02adbadd). Anything else it does not take is null.
 */
export async function foundWorkspace(services: Pick<AppServices, 'workspaces'>, name: string): Promise<Founding> {
	try {
		const created = await services.workspaces.createForCaller(name);
		return created ? { created } : null;
	} catch (e) {
		if (e instanceof BackHttpError && e.status === 403) return { refused: asSentence(e.message) };
		throw e;
	}
}
