import type { FoundationDefinitionDraft } from './definition';
import type { FoundationIdentityDraft } from './identity';
import type { FoundationOperationsDraft } from './operations';

/**
 * The single public Foundation document.
 *
 * The three nested records preserve the existing slice storage during
 * migration, while callers and users author one capability and one wire
 * section.
 */
export interface ProjectFoundationDraft {
	projectId: string;
	identity: FoundationIdentityDraft;
	definition: FoundationDefinitionDraft;
	operations: FoundationOperationsDraft;
}
