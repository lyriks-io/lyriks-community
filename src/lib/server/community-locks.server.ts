import { error } from '@sveltejs/kit';
import { evolutionAccess, type ScopeCheck } from '$domain/licensing';
import { onlyProjectSessionActs } from './evolution-door.server';

/**
 * The HTTP face of what a Community installation locks (EVO-001): a refused
 * scope check answers 403 with the sentence naming the plan that opens it, the
 * same words on the page and to an AI client. The body carries the sentence,
 * the address of the plans for an API client, and the plan, so a page knows
 * the refusal is an offer (EVO-006).
 */
export function refuseUnlessAllowed(check: ScopeCheck): void {
	if (!check.ok) error(403, { message: check.reason, detail: check.detail, plan: check.plan });
}

/** Every Evolution operation, read or write, from the page or an AI client, is refused on Community. */
export function requireEvolutionAccess(services: { installEdition(): string | undefined }): void {
	refuseUnlessAllowed(evolutionAccess(services.installEdition()));
}

/**
 * The same lock on a write batch: an answer to a click made outside a request
 * belongs to the session of the whole project (Ask my AI), which Community
 * keeps, so a batch of those alone goes through; any other act is refused.
 */
export function requireEvolutionBatchAccess(services: { installEdition(): string | undefined }, operations: readonly unknown[]): void {
	if (onlyProjectSessionActs(operations)) return;
	requireEvolutionAccess(services);
}
