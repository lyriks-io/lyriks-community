import {
	createEmptyDefinitionDraft,
	createEmptyIdentityDraft,
	createEmptyOperationsDraft,
	seedDefinitionFromIdentity,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft,
	type FoundationOperationsDraft,
	type ProjectFoundationDraft
} from '$domain/foundation';
import { parseOperationsDraft } from '../parse-foundation-operations';
import type {
	FoundationDefinitionRepositoryPort,
	FoundationIdentityRepositoryPort,
	FoundationOperationsRepositoryPort
} from '../ports';

/**
 * The ONE Foundation read use-case. `execute` returns the whole public
 * Foundation document; the per-slice entry points serve callers that only
 * need one slice (page loads, coherence aggregation, name lookups).
 */
export class LoadFoundationDraftUseCase {
	constructor(
		private readonly identityDrafts: FoundationIdentityRepositoryPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly operationsDrafts: FoundationOperationsRepositoryPort
	) {}

	/** The identity slice, or an empty one on first visit. */
	async loadIdentity(projectId: string): Promise<FoundationIdentityDraft> {
		const existing = await this.identityDrafts.load(projectId);
		return existing ?? createEmptyIdentityDraft(projectId);
	}

	/**
	 * The definition slice, or an empty one on first visit. A stored identity
	 * row may still carry pre-split definition fields — seed any pristine
	 * definition slices from it so no authored value is lost.
	 */
	async loadDefinition(projectId: string): Promise<FoundationDefinitionDraft> {
		const [existing, identity] = await Promise.all([
			this.definitionDrafts.load(projectId),
			this.identityDrafts.load(projectId)
		]);
		const definition = existing ?? createEmptyDefinitionDraft(projectId);
		return identity ? seedDefinitionFromIdentity(definition, identity) : definition;
	}

	/**
	 * The operations slice, or an empty one. Persisted data goes through the
	 * same anti-corruption parser as writes, so records authored outside the
	 * wizard (e.g. via MCP) are normalized — every nested entity gets a stable
	 * id before it reaches the keyed `{#each}` blocks in the UI.
	 */
	async loadOperations(projectId: string): Promise<FoundationOperationsDraft> {
		const existing = await this.operationsDrafts.load(projectId);
		return existing
			? parseOperationsDraft(existing, projectId)
			: createEmptyOperationsDraft(projectId);
	}

	/** The whole public Foundation document (the composite GET / MCP path). */
	async execute(projectId: string): Promise<ProjectFoundationDraft> {
		const [identity, definition, operations] = await Promise.all([
			this.loadIdentity(projectId),
			this.loadDefinition(projectId),
			this.loadOperations(projectId)
		]);
		return { projectId, identity, definition, operations };
	}
}
