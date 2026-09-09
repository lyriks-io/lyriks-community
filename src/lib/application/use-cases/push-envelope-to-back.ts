import type {
	ArchitectureDraftRepositoryPort,
	BackLinkRepositoryPort,
	BehaviorPort,
	CoherenceDraftRepositoryPort,
	DataDraftRepositoryPort,
	FoundationIdentityRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	FoundationOperationsRepositoryPort,
	GlossaryDraftRepositoryPort,
	SupervisionDraftRepositoryPort,
	FinopsDraftRepositoryPort,
	ProjectMirrorPort,
	RulesDraftRepositoryPort,
	SectionDraftRepositoryPort,
	UsersDraftRepositoryPort
} from '../ports';
import type { ProjectDocumentsDraft } from '$domain/documents';
import type { ProjectBaselinesDraft } from '$domain/baselines';
import type { ProjectApprovalsDraft } from '$domain/approvals';
import type { ProjectScopeDraft } from '$domain/scope';

/**
 * Aggregates the project's per-step drafts into one envelope JSON and
 * pushes it to the back. v3's local save remains authoritative. Concurrent
 * requests for one project are coalesced and serialized so a slow, older push
 * cannot overwrite a newer envelope on the back.
 *
 * Envelope shape mirrors the public capability contract:
 *   { foundation, users, features, experience, rules, data, architecture, ... }
 *
 * The mirror is best-effort and callers fire-and-forget it, so `execute` never
 * rejects. Instead the outcome is recorded on the project's back link
 * (`last_error` per BackLinkRepositoryPort): a failed push marks the link with a
 * concise error so the "local save is newer than back" gap is observable, and
 * the next successful push restores the healthy state. Durable retry lives in
 * the back-sync outbox (DrainBackSyncOutboxUseCase re-runs this use-case —
 * docs/architecture/persistence-sync-remaining.md, item 5).
 */
export class PushEnvelopeToBackUseCase {
	constructor(
		private readonly identityDrafts: FoundationIdentityRepositoryPort,
		private readonly scopeDrafts: SectionDraftRepositoryPort<ProjectScopeDraft>,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly usersDrafts: UsersDraftRepositoryPort,
		private readonly featuresDrafts: FeaturesDraftRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort,
		private readonly rulesDrafts: RulesDraftRepositoryPort,
		private readonly dataDrafts: DataDraftRepositoryPort,
		private readonly architectureDrafts: ArchitectureDraftRepositoryPort,
		private readonly coherenceDrafts: CoherenceDraftRepositoryPort,
	private readonly operationsDrafts: FoundationOperationsRepositoryPort,
	private readonly glossaryDrafts: GlossaryDraftRepositoryPort,
	private readonly documentsDrafts: SectionDraftRepositoryPort<ProjectDocumentsDraft>,
	private readonly baselinesDrafts: SectionDraftRepositoryPort<ProjectBaselinesDraft>,
	private readonly approvalsDrafts: SectionDraftRepositoryPort<ProjectApprovalsDraft>,
	private readonly supervisionDrafts: SupervisionDraftRepositoryPort,
	private readonly finopsDrafts: FinopsDraftRepositoryPort,
		private readonly client: ProjectMirrorPort,
		private readonly backLinks: BackLinkRepositoryPort,
		/**
		 * The behavior kernel, so each push also feeds the back's formal graph with
		 * the feature snapshots. Optional: a mirror without a kernel pushes the
		 * envelope alone, as before.
		 */
		private readonly behavior?: Pick<BehaviorPort, 'readProject' | 'readFeature'>,
		/** Cheap fingerprint of the kernel, so unchanged features are not re-published. */
		private readonly kernelSignature?: (projectId: string) => string
	) {}

	/** Kernel signature already handed to the back, per project, for this process. */
	readonly #publishedSignature = new Map<string, string>();

	readonly #inflight = new Map<string, Promise<boolean>>();
	readonly #rerun = new Set<string>();

	async execute(projectId: string): Promise<boolean> {
		if (!this.client.enabled) return false;
		const existing = this.#inflight.get(projectId);
		if (existing) {
			this.#rerun.add(projectId);
			return existing;
		}

		const run = this.#drain(projectId).finally(() => this.#inflight.delete(projectId));
		this.#inflight.set(projectId, run);
		return run;
	}

	async #drain(projectId: string): Promise<boolean> {
		let synced = false;
		do {
			this.#rerun.delete(projectId);
			synced = await this.#attempt(projectId);
		} while (this.#rerun.delete(projectId));
		return synced;
	}

	/** One push attempt that records its outcome on the back link and never rejects. */
	async #attempt(projectId: string): Promise<boolean> {
		let failure: string;
		try {
			const synced = await this.#pushCurrent(projectId);
			if (synced) {
				await this.#recordHealthy(projectId);
				return true;
			}
			failure = 'envelope push to back failed (back unreachable or project unresolved); local save is newer than back';
		} catch (e) {
			failure = `envelope mirror failed: ${e instanceof Error ? e.message : String(e)}`;
		}
		console.warn(`[lyriks-back] envelope mirror failed [${projectId}]:`, failure);
		await this.#recordFailure(projectId, failure);
		return false;
	}

	/**
	 * Mark the link's `last_error` so the mirror gap is visible on the link row.
	 * The link's status is preserved — the id mapping is still valid, only the
	 * mirror is behind. A `stale` link already carries a more actionable error
	 * (explicit recovery required) and is left untouched; no link row means MAP /
	 * never registered, so there is nothing to record (markStatus no-ops anyway).
	 */
	async #recordFailure(projectId: string, message: string): Promise<void> {
		try {
			const link = await this.backLinks.find(projectId);
			if (!link || link.status === 'stale') return;
			await this.backLinks.markStatus(projectId, link.status, message);
		} catch (e) {
			console.warn(
				`[lyriks-back] recording envelope mirror failure failed [${projectId}]:`,
				e instanceof Error ? e.message : e
			);
		}
	}

	/** After a successful push, clear a previously recorded mirror error. */
	async #recordHealthy(projectId: string): Promise<void> {
		try {
			const link = await this.backLinks.find(projectId);
			if (!link) return;
			if (link.lastError === undefined && link.status === 'linked') return;
			await this.backLinks.markStatus(projectId, 'linked');
		} catch (e) {
			console.warn(
				`[lyriks-back] clearing envelope mirror error failed [${projectId}]:`,
				e instanceof Error ? e.message : e
			);
		}
	}

	async #pushCurrent(projectId: string): Promise<boolean> {
		// Resolve the back id FIRST (it also creates the link row on first
		// registration), then bump the mirror version BEFORE assembling the
		// envelope: a higher version therefore always carries content read later,
		// which is exactly the ordering the back's stale-write guard (409 on a
		// lower version) relies on. No link row → unversioned legacy push.
		const identityForName = await this.identityDrafts.load(projectId);
		// No identity draft means no local project (deleted, or renamed away):
		// there is nothing to mirror, and the back would refuse the link anyway
		// (its foreign key points at the draft). Closing the gap here lets the
		// outbox drop the row instead of retrying it forever.
		if (!identityForName) {
			console.warn(`[lyriks-back] envelope mirror skipped [${projectId}]: no local project, nothing to mirror`);
			return true;
		}
		const displayName =
			(identityForName?.productName?.trim() || '').length > 0 ? identityForName!.productName : projectId;
		const backProjectId = await this.client.ensureProject(projectId, displayName);
		if (!backProjectId) return false;
		const version = await this.backLinks.nextEnvelopeVersion(projectId).catch(() => null);

		const [
			identity,
			scope,
			definition,
			users,
			features,
			experience,
			rules,
			data,
			architecture,
			coherence,
			operations,
			glossary,
			documents,
			baselines,
			approvals,
			supervision,
			finops
		] = await Promise.all([
			this.identityDrafts.load(projectId),
			this.scopeDrafts.load(projectId),
			this.definitionDrafts.load(projectId),
			this.usersDrafts.load(projectId),
			this.featuresDrafts.load(projectId),
			this.experienceDrafts.load(projectId),
			this.rulesDrafts.load(projectId),
			this.dataDrafts.load(projectId),
			this.architectureDrafts.load(projectId),
			this.coherenceDrafts.load(projectId),
			this.operationsDrafts.load(projectId),
			this.glossaryDrafts.load(projectId),
			this.documentsDrafts.load(projectId),
			this.baselinesDrafts.load(projectId),
			this.approvalsDrafts.load(projectId),
			this.supervisionDrafts.load(projectId),
			this.finopsDrafts.load(projectId)
		]);

		const envelope: Record<string, unknown> = {};
		if (identity || definition || operations) {
			envelope.foundation = {
				projectId,
				identity,
				definition,
				operations
			};
		}
		if (scope) envelope.scope = scope;
		if (users) envelope.users = users;
		if (features) envelope.features = features;
		if (experience) envelope.experience = experience;
		if (rules) envelope.rules = rules;
		if (data) envelope.data = data;
		if (architecture) envelope.architecture = architecture;
		if (coherence) envelope.coherence = coherence;
		if (glossary) envelope.glossary = glossary;
		if (documents) envelope.documents = documents;
		if (baselines) envelope.baselines = baselines;
		if (approvals) envelope.approvals = approvals;
		if (supervision) envelope.supervision = supervision;
		if (finops) envelope.finops = finops;

		const result = await this.client.pushEnvelope(
			backProjectId,
			envelope,
			version ?? undefined
		);
		if (result === 'synced' || result === 'stale') await this.#pushFeatures(projectId);
		// `stale` is terminal success: the back already holds a NEWER envelope
		// (pushed by another replica), so this project's mirror gap is closed —
		// retrying the older content would be 409'd forever.
		return result === 'synced' || result === 'stale';
	}

	/**
	 * Feed the formal graph. The envelope is an opaque blob to the back; what its
	 * DPO engine compiles is the unspa feature snapshots, and until now nothing
	 * ever sent them, so the formal verdict was always over an empty model.
	 * Best-effort per feature (the client swallows transport errors), and gated
	 * on the kernel signature so an autosave that touched no behavior does not
	 * republish every feature.
	 */
	async #pushFeatures(projectId: string): Promise<void> {
		if (!this.behavior) return;
		const signature = this.kernelSignature?.(projectId);
		if (signature !== undefined && this.#publishedSignature.get(projectId) === signature) return;
		try {
			const project = await this.behavior.readProject(projectId);
			for (const featureId of project?.project.featureIds ?? []) {
				const snapshot = await this.behavior.readFeature(projectId, featureId);
				if (snapshot) await this.client.propagateFeature(projectId, featureId, snapshot);
			}
			if (signature !== undefined) this.#publishedSignature.set(projectId, signature);
		} catch (e) {
			console.warn(
				`[lyriks-back] feeding the formal graph failed [${projectId}]:`,
				e instanceof Error ? e.message : e
			);
		}
	}
}
