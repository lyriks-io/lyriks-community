import {
	createEmptyIdentityDraft,
	type FoundationIdentityDraft,
	type SourceModeCode
} from '$domain/foundation';
import { makeProjectId } from '$domain/catalog';
import { humanizeDomainName } from '$domain/portfolio';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';

export interface CreateProjectInput {
	name: string;
	description?: string;
	domainId?: string | null;
	/**
	 * Where the spec comes from, chosen at creation ("from scratch" vs "from a
	 * codebase"). Lands on the Foundation identity; defaults to greenfield.
	 */
	sourceMode?: SourceModeCode;
}

/**
 * Mirrors a freshly-created project into the Unspaghettit workspace so it shows
 * up in the (Docker-shipped) OSS dashboard the moment it's created — not only
 * after the first step autosave. Structurally satisfied by
 * `SyncBehaviorProjectUseCase`; kept as a narrow port so creation depends on the
 * capability, not the whole sync use-case.
 */
export interface ProjectCreationMirror {
	execute(draft: FoundationIdentityDraft): Promise<unknown>;
}

/**
 * Create a project: mint an id, persist an empty Foundation identity draft (pre-filled
 * with the product name + the modal's one-liner as the brief), and stamp its
 * org metadata (domain). A project exists the moment its identity draft is saved;
 * the rest of the wizard lazily creates its drafts on first save. The delivery
 * stage is never declared here — it is derived from the live signals.
 */
export class CreateProjectUseCase {
	constructor(
		private readonly drafts: FoundationIdentityRepositoryPort,
		private readonly clock: ClockPort,
		private readonly portfolio: PortfolioRepositoryPort,
		private readonly mirror?: ProjectCreationMirror,
		private readonly randomSuffix: () => string = () => crypto.randomUUID().slice(0, 6)
	) {}

	async execute(input: CreateProjectInput): Promise<string> {
		const productName = input.name.trim() || 'Untitled product';
		const id = makeProjectId(productName, this.randomSuffix());
		const base = createEmptyIdentityDraft(id);
		const draft = {
			...base,
			productName,
			brief: input.description?.trim() ?? '',
			sourceMode: input.sourceMode ?? base.sourceMode,
			lastSavedAt: this.clock.nowIso()
		};
		await this.drafts.save(draft);
		const domainId = await this.ensureDomain(input.domainId ?? null);
		await this.portfolio.setMeta(id, { domainId });

		// Mirror the new project into the Unspaghettit workspace right away so it
		// appears in the Docker-shipped OSS dashboard on creation — not only after
		// the first step autosave. Best-effort: a mirror failure (or a disabled
		// back) must never break local project creation. Edits + deletes already
		// mirror via the per-step save routes and DeleteProjectUseCase.
		if (this.mirror) {
			try {
				await this.mirror.execute(draft);
			} catch (e) {
				console.warn('[create-project] unspa mirror failed (best-effort):', e);
			}
		}
		return id;
	}

	/**
	 * Materialise the target domain when the caller references one that has no
	 * Domain record yet. The dashboard only groups a project under a domain whose
	 * id it knows — an unknown id silently drops the project into "unassigned".
	 * The UI always passes an existing domain id (chosen from the picker) or null,
	 * so this is a no-op there; it's the programmatic path (MCP `create_wizard_project`
	 * with a fresh `domain_id`) that would otherwise orphan the project. We honour
	 * the caller's exact id — a freshly-minted id wouldn't match what the project
	 * card carries — and derive a human-readable name from it.
	 */
	private async ensureDomain(domainId: string | null): Promise<string | null> {
		if (!domainId) return null;
		const domains = await this.portfolio.listDomains();
		if (domains.some((d) => d.id === domainId)) return domainId;
		await this.portfolio.saveDomain({
			id: domainId,
			name: humanizeDomainName(domainId),
			description: '',
			icon: 'lucide:building-2',
			createdAt: this.clock.nowIso()
		});
		return domainId;
	}
}
