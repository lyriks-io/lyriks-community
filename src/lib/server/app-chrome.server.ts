import type { AppServices } from '$composition/container.server';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';

/**
 * The project the app bar is about: the one the URL is in, else the last one
 * the reader opened (a cookie), else the first one they can open, so Home and
 * Settings keep the tabs pointed at a project. A remembered project that is
 * gone or out of reach is simply passed over.
 */
export const CURRENT_PROJECT_COOKIE = 'lyriks_project';

export function rememberCurrentProject(cookies: Cookies, projectId: string): void {
	if (cookies.get(CURRENT_PROJECT_COOKIE) === projectId) return;
	cookies.set(CURRENT_PROJECT_COOKIE, projectId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60 * 24 * 365
	});
}

/** How many projects are tried for a default before giving up: a reader who can open none of them has none. */
const DEFAULT_CANDIDATES = 10;

export async function resolveCurrentProject(
	services: AppServices, projectIdInUrl: string | undefined,
	cookies: Cookies,
	canRead: (projectId: string) => Promise<boolean>
): Promise<{ id: string; name: string } | null> {
	const projects = await services.listProjects.execute();
	const named = (p: { id: string; name: string }) => ({ id: p.id, name: p.name.trim() || 'Untitled project' });
	const readable = async (id: string) => canRead(id).catch((error) => {
		if (isHttpError(error, 403) || isHttpError(error, 404)) return false;
		throw error;
	});
	const wanted = projectIdInUrl ?? cookies.get(CURRENT_PROJECT_COOKIE);
	const chosen = wanted ? projects.find((p) => p.id === wanted) : undefined;
	if (chosen && (await readable(chosen.id))) return named(chosen);
	if (projectIdInUrl) return null;
	for (const p of projects.slice(0, DEFAULT_CANDIDATES)) {
		if (await readable(p.id)) return named(p);
	}
	return null;
}

/** An outage does not prove that the remembered project disappeared (f090189e). */
export async function resolveCurrentProjectContext(
	services: AppServices, projectIdInUrl: string | undefined, cookies: Cookies,
	canRead: (projectId: string) => Promise<boolean>
): Promise<{ currentProject: { id: string; name: string } | null; currentProjectUnavailable: boolean; contextProjectId: string | null }> {
	const contextProjectId = projectIdInUrl ?? cookies.get(CURRENT_PROJECT_COOKIE) ?? null;
	try {
		return { currentProject: await resolveCurrentProject(services, projectIdInUrl, cookies, canRead), currentProjectUnavailable: false, contextProjectId };
	} catch (error) {
		if (isHttpError(error, 503)) return { currentProject: null, currentProjectUnavailable: true, contextProjectId };
		if (isHttpError(error, 401)) return { currentProject: null, currentProjectUnavailable: false, contextProjectId };
		throw error;
	}
}
