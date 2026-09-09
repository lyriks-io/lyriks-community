import type { RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';

/**
 * The set of domain ids the current caller may see, or `null` for every domain.
 *
 * The open-source build is a single operator who sees everything, and auth off
 * is the same trusted tenant. Where the Enterprise overlay is compiled in, its
 * hook resolves the caller's workspace role and per-member scope instead.
 */
export async function callerAllowedDomains(
	event: Pick<RequestEvent, 'locals' | 'cookies'>
): Promise<ReadonlySet<string> | null> {
	if (!event.locals.authRequired) return null;
	const hooks = getServices().enterpriseHooks;
	return hooks ? hooks.callerAllowedDomains(event) : null;
}
