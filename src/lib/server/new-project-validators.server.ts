import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { saveRetrospecActs } from '$application/retrospec/retrospec-store';
import { retrospecActor } from './retrospec-status.server';

/**
 * A new project leads its validation with its creator, who is its only validator until someone is named on purpose
 * (criteria e3296696 of feat-164, bfe225b4 of feat-42): whoever else can open it is no longer waited on by their jobs.
 * Only where people have accounts; a Community operator validates alone anyway. Never blocks the creation: a project
 * whose choice could not be written keeps the older rule, everyone who can open it counting by their jobs.
 */
export async function nameCreatorValidator(services: AppServices, projectId: string, cookies: Pick<Cookies, 'get'>, origin: string | null): Promise<void> {
	if (!services.identity?.multiUser) return;
	try {
		const creator = await retrospecActor(services, projectId, cookies);
		const ctx = { actor: creator, now: new Date().toISOString() };
		await saveRetrospecActs(services.sectionDocuments, projectId, [{ op: 'set_lead', to: creator }, { op: 'set_validator', to: creator, validates: true }], ctx, origin);
	} catch {
		// The project exists either way; its Team names the validators later.
	}
}
