import {
	computeDefinitionCoherence,
	computeIdentityCoherence,
	createEmptyDefinitionDraft,
	seedDefinitionFromIdentity,
	withoutLegacyDefinitionFields,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft,
	type FoundationOperationsDraft,
	type ProjectFoundationDraft
} from '$domain/foundation';
import type {
	ClockPort,
	FoundationDefinitionRepositoryPort,
	FoundationIdentityRepositoryPort,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';
import type {
	SaveSimpleSectionDraftResult,
	SaveSimpleSectionDraftUseCase
} from './save-simple-section-draft';

/** What every Foundation slice save reports (autosave trail + MCP echo). */
export interface SaveFoundationSliceResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
}

export interface SaveFoundationDraftResult {
	savedAt: string;
	coherenceScore: number;
	coherenceIssues: string[];
	operationsRevision: number;
}

/**
 * The ONE Foundation write use-case. `execute` persists the whole public
 * Foundation document; the per-slice entry points (`saveIdentity`,
 * `saveDefinition`, `saveOperations`) carry the migration-era slice routes
 * until they are deleted. Drafts may be incomplete — saving never blocks on
 * the minimum bar.
 */
export class SaveFoundationDraftUseCase {
	constructor(
		private readonly identityDrafts: FoundationIdentityRepositoryPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort,
		private readonly operations: SaveSimpleSectionDraftUseCase<FoundationOperationsDraft>
	) {}

	/**
	 * Persist the identity slice: stamp `lastSavedAt`, strip the retired
	 * definition-era fields, seed any pristine definition slices from the
	 * identity values (the one-time migration bridge), and emit the coherence
	 * telemetry pair.
	 */
	async saveIdentity(draft: FoundationIdentityDraft): Promise<SaveFoundationSliceResult> {
		const savedAt = this.clock.nowIso();
		const stamped: FoundationIdentityDraft = {
			...withoutLegacyDefinitionFields(draft),
			lastSavedAt: savedAt
		};

		// Migrate old business/market/competition values before removing their
		// retired identity copy. Seeding only touches pristine definition slices.
		const existing =
			(await this.definitionDrafts.load(draft.projectId)) ??
			createEmptyDefinitionDraft(draft.projectId);
		const migrated = seedDefinitionFromIdentity(existing, draft);
		if (JSON.stringify(migrated) !== JSON.stringify(existing)) {
			await this.definitionDrafts.save(migrated);
		}
		await this.identityDrafts.save(stamped);

		const coherence = computeIdentityCoherence(stamped);
		this.telemetry.emit({ type: 'foundation.identity.autosaved', savedAt });
		this.telemetry.emit({
			type: 'foundation.identity.coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message)
		};
	}

	/** Persist the definition slice: stamp `lastSavedAt` and emit its coherence pair. */
	async saveDefinition(draft: FoundationDefinitionDraft): Promise<SaveFoundationSliceResult> {
		const savedAt = this.clock.nowIso();
		const stamped: FoundationDefinitionDraft = { ...draft, lastSavedAt: savedAt };
		await this.definitionDrafts.save(stamped);

		const coherence = computeDefinitionCoherence(stamped);
		this.telemetry.emit({ type: 'foundation.definition.autosaved', savedAt });
		this.telemetry.emit({
			type: 'foundation.definition.coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message)
		};
	}

	/**
	 * Persist the operations slice through the generic section-document save
	 * (atomic compare-and-write; null = stale revision, the caller answers 409).
	 */
	saveOperations(
		draft: FoundationOperationsDraft,
		opts?: SectionDraftSaveOptions
	): Promise<SaveSimpleSectionDraftResult | null> {
		return this.operations.execute(draft, opts);
	}

	/** Persist the whole public Foundation document (the composite PUT / MCP path). */
	async execute(draft: ProjectFoundationDraft): Promise<SaveFoundationDraftResult> {
		const identity = await this.saveIdentity(draft.identity);
		const definition = await this.saveDefinition(draft.definition);
		const operations = await this.saveOperations(draft.operations);
		if (!operations) throw new Error('Foundation operations save was rejected');

		return {
			savedAt: [identity.savedAt, definition.savedAt, operations.savedAt].sort().at(-1)!,
			coherenceScore: Math.round(
				(identity.coherenceScore +
					definition.coherenceScore +
					(operations.coherenceScore ?? 0)) /
					3
			),
			coherenceIssues: [
				...identity.coherenceIssues,
				...definition.coherenceIssues,
				...(operations.coherenceIssues ?? [])
			].slice(0, 20),
			operationsRevision: operations.revision
		};
	}
}
