import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { stampDisableOps, touchesDisabling, validatedSpecRefusal, type BatchOperation } from '$domain/features';
import { retrospecActor } from './retrospec-status.server';
import { readSpecValidation } from './spec-validation.server';

export type PreparedBatch =
	| { readonly ok: true; readonly operations: BatchOperation[] }
	| { readonly ok: false; readonly refusal: string };

/**
 * A behaviour batch that disables or enables an element, made ready for the
 * engine: refused while the specification is validated definitively (a change
 * of what it does then goes through a change request), each disable stamped
 * with the person signed in and the time. A batch that does neither comes back
 * as it was, without reading anything.
 */
export async function prepareDisableOps(
	services: AppServices,
	cookies: Pick<Cookies, 'get'>,
	projectId: string,
	operations: readonly BatchOperation[],
	options: { readonly guardValidated: boolean }
): Promise<PreparedBatch> {
	if (!touchesDisabling(operations)) return { ok: true, operations: [...operations] };
	if (options.guardValidated) {
		const summary = await readSpecValidation(services, projectId, null).catch(() => null);
		const refusal = validatedSpecRefusal(operations, summary?.state === 'validated');
		if (refusal) return { ok: false, refusal };
	}
	const actor = await retrospecActor(services, projectId, cookies);
	return { ok: true, operations: stampDisableOps(operations, actor.name || actor.id, new Date().toISOString()) };
}
