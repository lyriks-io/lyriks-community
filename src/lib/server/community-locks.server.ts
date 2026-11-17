import { error } from '@sveltejs/kit';
import { evolutionAccess, type ScopeCheck } from '$domain/licensing';

/**
 * The HTTP face of what a Community installation locks (EVO-001): a refused
 * scope check answers 403 with the sentence naming the plan that opens it, the
 * same words on the page and to an AI client.
 */
export function refuseUnlessAllowed(check: ScopeCheck): void {
	if (!check.ok) error(403, `${check.reason} ${check.detail}`);
}

/** Every Evolution operation, read or write, from the page or an AI client, is refused on Community. */
export function requireEvolutionAccess(services: { installEdition(): string | undefined }): void {
	refuseUnlessAllowed(evolutionAccess(services.installEdition()));
}
