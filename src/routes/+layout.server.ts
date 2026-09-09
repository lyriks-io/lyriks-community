import { getServices } from '$composition/container.server';
import { dev } from '$app/environment';
import { isAdmin } from '$lib/server/admin.server';
import type { LayoutServerLoad } from './$types';

/** Surface the request-scoped session (set in hooks) to the app shell: the
    logout affordance for a real authenticated user, plus the caller's teams and
    the active one for the workspace switcher. Token never leaves the cookie. */
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const services = getServices();
	const base = {
		session: locals.session,
		authRequired: locals.authRequired,
		devTier: dev ? services.currentTier() : null,
		// Gates the operator-only update notice; the /api/updates route re-checks.
		isAdmin: isAdmin({ locals })
	};

	// Only authenticated, back-integrated installs have teams to switch between.
	if (!locals.authRequired || !locals.session?.isAuthenticated) {
		const memberName = await services.resolveActiveMemberName.execute(null);
		return { ...base, workspaces: [], activeWorkspace: null, memberName };
	}
	const workspaces = await services.workspaces.listForCaller();
	const cookie = cookies.get('lyriks_active_ws') ?? null;
	const activeWorkspace =
		cookie && workspaces.some((w) => w.id === cookie) ? cookie : (workspaces[0]?.id ?? null);
	// The name Lyriks attributes work to in deep links (behavior dashboard `user=`).
	const memberName = await services.resolveActiveMemberName.execute(activeWorkspace);
	return { ...base, workspaces, activeWorkspace, memberName };
};
