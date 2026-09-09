import type { ProjectFoundationDraft } from '$domain/foundation';
import { parseIdentityDraft } from './parse-foundation-identity';
import { parseOperationsDraft } from './parse-foundation-operations';
import { parseDefinitionDraft } from './parse-foundation-definition';

/** Anti-corruption parser for the single public Foundation document. */
export function parseFoundationDraft(input: unknown, projectId: string): ProjectFoundationDraft {
	const source =
		input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	return {
		projectId,
		identity: parseIdentityDraft(source.identity, projectId),
		definition: parseDefinitionDraft(source.definition, projectId),
		operations: parseOperationsDraft(source.operations, projectId)
	};
}
