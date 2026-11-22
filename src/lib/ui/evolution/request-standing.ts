/**
 * The one line of the request's header: where it stands and how many steps are
 * done, led by the version in correction while one is open in the Build
 * (EVO-012, criterion d9a4be34).
 */
export function requestStanding(correction: { readonly version: number } | null | undefined, tab: string, done: number, total: number): string {
	return `${correction ? `Version ${correction.version} in correction · ` : ''}Stands at ${tab} · ${done} of ${total} steps done`;
}
