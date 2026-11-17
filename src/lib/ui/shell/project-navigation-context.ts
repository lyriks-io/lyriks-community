import { EMPTY_APP_CHROME, type AppChrome } from '$lib/shared/app-chrome';

interface Project { readonly id: string; readonly name: string }
export interface ConfirmedNavigationContext {
	readonly scope: string;
	readonly project: Project;
	readonly chrome: AppChrome;
}
export interface NavigationContextReading {
	readonly scope: string | null;
	readonly project: Project | null;
	readonly chrome: AppChrome;
	readonly requestedProjectId: string | null;
	readonly addressedProjectId: string | null;
	readonly unavailable: boolean;
	readonly denied: boolean;
}

export function navigationContextScope(input: {
	readonly authRequired: boolean; readonly isAuthenticated: boolean; readonly email?: string;
	readonly sessionBoundary: string | null; readonly workspaceId: string | null;
}): string | null {
	if (!input.authRequired) return JSON.stringify(['trusted', input.workspaceId]);
	if (!input.isAuthenticated || !input.email || !input.sessionBoundary) return null;
	return JSON.stringify(['account', input.email.trim().toLowerCase(), input.sessionBoundary, input.workspaceId]);
}

/** Drop every content-bearing payload before retaining a navigation snapshot. */
function navigationChrome(chrome: AppChrome): AppChrome {
	return { ...EMPTY_APP_CHROME, tabs: chrome.tabs, openEvolutions: chrome.openEvolutions, drift: chrome.drift,
		progress: { ...chrome.progress }, retroDone: chrome.retroDone };
}

/** Retained metadata draws navigation only; it never participates in authorization. */
export function projectNavigationContext(previous: ConfirmedNavigationContext | null, reading: NavigationContextReading): ConfirmedNavigationContext | null {
	if (!reading.scope || reading.denied) return null;
	if (!reading.unavailable) return reading.project ? { scope: reading.scope, project: reading.project, chrome: navigationChrome(reading.chrome) } : null;
	if (!previous || previous.scope !== reading.scope || previous.project.id !== reading.requestedProjectId) return null;
	if (reading.addressedProjectId && previous.project.id !== reading.addressedProjectId) return null;
	return previous;
}
