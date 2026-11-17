import { dev } from '$app/environment';
import { isAdmin } from '$lib/server/admin.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { rememberCurrentProject, resolveCurrentProjectContext } from '$lib/server/app-chrome.server';
import { navigationSessionBoundary } from '$lib/server/navigation-session.server';
import { NAV_FOLDED_COOKIE } from '$ui/shell/nav-folded';
import type { LayoutServerLoad } from './$types';

/** Surface the request-scoped session (set in hooks) to the app shell: the
    logout affordance for a real authenticated user, plus the caller's teams and
    the active one for the workspace switcher, and the project the app bar is
    about. Token never leaves the cookie. */
export const load: LayoutServerLoad = async (event) => {
	const { locals, cookies, params, url, untrack } = event;
	const services = event.locals.services;
	const base = {
		session: locals.session,
		navigationSessionBoundary: locals.authRequired && locals.session?.isAuthenticated ? navigationSessionBoundary(cookies) : null,
		authRequired: locals.authRequired,
		devTier: dev ? services.currentTier() : null,
		// Gates the operator-only update notice; the /api/updates route re-checks.
		isAdmin: isAdmin({ locals }),
		// Whether this installation proves the spec with the solver (Enterprise):
		// every page leaves the solver's verdicts out otherwise.
		proofs: services.proofs,
		// The edition this installation declares: the account menu names the plan on Community alone (criterion 81cc595c).
		edition: services.installEdition() ?? null,
		// The navigation folded to its icons on this browser, drawn so from the first paint (criterion 53c5c6f0).
		navFolded: cookies.get(NAV_FOLDED_COOKIE) === '1'
	};
	const signedIn = !locals.authRequired || !!locals.session?.isAuthenticated;
	// Whether a link out of the installation may be drawn at all (criterion b4538030).
	const onlineHelp = signedIn && (await services.loadInstallConfiguration.allowance()).onlineHelp;
	// New Project shows the offer of the plan that opens several projects instead of its form, when Community holds one (EVO-001).
	const projectCreation = signedIn ? await services.checkProjectCreation.execute() : ({ ok: true } as const);
	// Read through the params getter even where the route has none: an `in` test
	// registers no dependency, so entering a project from Home kept the app bar
	// on the project before it.
	const projectIdInUrl = (params as { projectId?: string }).projectId;
	// Home limited to a project just picked (criterion 11c7c8c8 of feat-home): the navigation follows it.
	// The path is read untracked: a tracked `url.pathname` reran this layout, and the app bar's
	// /api/chrome behind it, on every click. The `project` query is tracked on every page (Home
	// alone carries it), so picking a project on a Home reached from Settings still reruns this.
	const picked = url.searchParams.get('project') ?? undefined;
	const pickedOnHome = untrack(() => url.pathname === '/') ? picked : undefined;
	const projectContext = signedIn
		? await resolveCurrentProjectContext(services, projectIdInUrl ?? pickedOnHome, cookies, async (id) => {
				await requireProjectAccess(event, id, 'read');
				return true;
			})
		: { currentProject: null, currentProjectUnavailable: false, contextProjectId: null };
	const { currentProject } = projectContext;
	if (pickedOnHome && currentProject?.id === pickedOnHome) rememberCurrentProject(cookies, pickedOnHome);

	// Only authenticated, back-integrated installs have teams to switch between.
	if (!locals.authRequired || !locals.session?.isAuthenticated) {
		const memberName = await services.resolveActiveMemberName.execute(null);
		return { ...base, onlineHelp, projectCreation, workspaces: [], activeWorkspace: null, memberName, ...projectContext, contextWorkspaceId: null };
	}
	const workspaces = await services.workspaces.listForCaller();
	const cookie = cookies.get('lyriks_active_ws') ?? null;
	const activeWorkspace =
		cookie && workspaces.some((w) => w.id === cookie) ? cookie : (workspaces[0]?.id ?? null);
	// The name Lyriks attributes work to in deep links (behavior dashboard `user=`).
	const memberName = await services.resolveActiveMemberName.execute(activeWorkspace);
	return { ...base, onlineHelp, projectCreation, workspaces, activeWorkspace, memberName, ...projectContext, contextWorkspaceId: cookie ?? activeWorkspace };
};
