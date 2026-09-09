import type { FoundationIdentityDraft } from '$domain/foundation';
import type {
	ClockPort,
	DraftLockPort,
	FoundationIdentityRepositoryPort,
	PortfolioRepositoryPort
} from '$application/ports';

export interface UpdateProjectInput {
	projectId: string;
	name: string;
	description: string;
	domainId: string | null;
}

export interface UpdateProjectResult {
	updated: boolean;
	reason?: string;
}

/**
 * Mirror an edited project back into the Unspaghettit workspace so a rename shows
 * up in the (Docker-shipped) OSS dashboard right away — same capability the identity
 * step re-mirrors with on load. Kept as a narrow port so this use-case depends on
 * the mirror capability, not the whole sync use-case. Structurally satisfied by
 * `SyncBehaviorProjectUseCase`.
 */
export interface ProjectUpdateMirror {
	execute(draft: FoundationIdentityDraft): Promise<unknown>;
}

/**
 * Edit a project's user-facing attributes from the portfolio without opening the
 * wizard: name + description live in the Foundation identity draft (the source of a
 * project's identity), while the domain is org metadata. One use-case so the
 * dashboard has a single "edit project" affordance covering both stores.
 */
export class UpdateProjectUseCase {
	constructor(
		private readonly drafts: FoundationIdentityRepositoryPort,
		private readonly clock: ClockPort,
		private readonly portfolio: PortfolioRepositoryPort,
		private readonly mirror?: ProjectUpdateMirror,
		private readonly revisions?: Pick<DraftLockPort, 'commit'>
	) {}

	async execute(input: UpdateProjectInput): Promise<UpdateProjectResult> {
		if (!input.projectId) return { updated: false, reason: 'Choose a project to edit.' };

		const draft = await this.drafts.load(input.projectId);
		if (!draft) return { updated: false, reason: 'That project no longer exists.' };

		const productName = input.name.trim() || draft.productName || 'Untitled product';
		const updated: FoundationIdentityDraft = {
			...draft,
			productName,
			brief: input.description.trim(),
			lastSavedAt: this.clock.nowIso()
		};
		await this.drafts.save(updated);
		// Same revision scope as the identity autosave route, so an open editor's
		// stale identity draft conflicts (409) instead of clobbering the rename.
		await this.revisions?.commit(input.projectId, 'foundation.identity', null);

		// Best-effort: a mirror failure (or a disabled back) must never block a local
		// rename — the name is already persisted above and the dashboard reads it.
		if (this.mirror) {
			try {
				await this.mirror.execute(updated);
			} catch (e) {
				console.warn('[update-project] unspa mirror failed (best-effort):', e);
			}
		}

		await this.portfolio.setMeta(input.projectId, { domainId: input.domainId });

		return { updated: true };
	}
}
