import { mintUuid } from '$domain/shared';
import {
	createEmptyIdentityDraft,
	createEmptyOperationsDraft,
	styledProjectName,
	type FoundationIdentityDraft,
	type SourceModeCode
} from '$domain/foundation';
import { makeProjectId } from '$domain/catalog';
import { humanizeDomainName } from '$domain/portfolio';
import { assertProjectCreation, type CheckProjectCreationUseCase } from './project-creation-scope';
import { FOLDER_OUT_OF_SCOPE, FOLDER_SCOPE_REFUSAL } from './folder-policy';
import type {
	ClockPort,
	FoundationIdentityRepositoryPort,
	FoundationOperationsRepositoryPort,
	PortfolioRepositoryPort
} from '$application/ports';

/**
 * Starts a new project in the language the installation prefers. Declared on the
 * project rather than read at use, so that changing the preference later leaves
 * every existing project in the language it is already written in.
 */
export interface ProjectLanguageSeed {
	readonly operations: Pick<FoundationOperationsRepositoryPort, 'save'>;
	readonly preferred: () => Promise<string>;
}

export interface CreateProjectInput {
	name: string;
	description?: string;
	domainId?: string | null;
	/**
	 * Where the spec comes from, chosen at creation ("from scratch" vs "from a
	 * codebase"). Lands on the Foundation identity; defaults to greenfield.
	 */
	sourceMode?: SourceModeCode;
	/**
	 * Where the creator stands, when the installation has workspaces: the
	 * workspace that will own the project and the folders they reach there
	 * (null = every folder). Absent where there are none: every folder is theirs.
	 */
	placement?: ProjectPlacement | null;
}

export interface ProjectPlacement {
	readonly workspaceId: string;
	readonly folders: ReadonlySet<string> | null;
}

/**
 * A folder the project may not be filed in (issue 157), refused before anything
 * is written: another workspace's or one outside a limited member's folders
 * (rule a8664b7b), or a new one from a member who may not add folders (rule ed4ab638).
 */
export class ProjectFolderRefusedError extends Error {
	readonly status = 403;
	constructor(reason: string) {
		super(reason);
		this.name = 'ProjectFolderRefusedError';
	}
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
		private readonly randomSuffix: () => string = () => mintUuid().slice(0, 6),
		private readonly language?: ProjectLanguageSeed,
		private readonly scope?: Pick<CheckProjectCreationUseCase, 'execute'>
	) {}

	/** Throws `ProjectScopeRefusedError` when the installation's edition holds no more projects. */
	async execute(input: CreateProjectInput): Promise<string> {
		await assertProjectCreation(this.scope);
		const folder = await this.folderFor(input.domainId ?? null, input.placement ?? null);
		const productName = styledProjectName(input.name) || 'Untitled product';
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
		await this.declareLanguage(id);
		if (folder?.create) await this.createFolder(folder.id, input.placement?.workspaceId ?? null);
		await this.portfolio.setMeta(id, { domainId: folder?.id ?? null });

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

	private async declareLanguage(projectId: string): Promise<void> {
		const locale = await this.language?.preferred();
		if (!locale || !this.language) return;
		const draft = createEmptyOperationsDraft(projectId);
		await this.language.operations.save({ ...draft, i18n: { ...draft.i18n, primaryLocale: locale } });
	}

	/**
	 * The folder the project is filed in, checked before anything is written.
	 * The dashboard only groups a project under a domain whose id it knows, so an
	 * id that names no folder yet is materialised (the MCP `create_wizard_project`
	 * with a fresh `domain_id`); the UI always passes an existing one or null. We
	 * honour the caller's exact id, a freshly minted one would not match what the
	 * project card carries. With workspaces, the folder must be one of the owning
	 * workspace's that the creator reaches, and only a member who reaches every
	 * folder there may make one (the same checks as moving a project and adding a
	 * folder).
	 */
	private async folderFor(domainId: string | null, placement: ProjectPlacement | null): Promise<{ id: string; create: boolean } | null> {
		if (!domainId) return null;
		const existing = (await this.portfolio.listDomains()).find((d) => d.id === domainId);
		if (existing) {
			const outside =
				placement !== null &&
				((existing.workspaceId ?? null) !== placement.workspaceId ||
					(placement.folders !== null && !placement.folders.has(existing.id)));
			if (outside) throw new ProjectFolderRefusedError(FOLDER_OUT_OF_SCOPE);
			return { id: domainId, create: false };
		}
		if (placement !== null && placement.folders !== null) throw new ProjectFolderRefusedError(FOLDER_SCOPE_REFUSAL);
		return { id: domainId, create: true };
	}

	/** Materialise a folder under the id the caller named, with a readable name, in the owning workspace. */
	private async createFolder(id: string, workspaceId: string | null): Promise<void> {
		await this.portfolio.saveDomain({
			id,
			name: humanizeDomainName(id),
			description: '',
			icon: 'lucide:building-2',
			createdAt: this.clock.nowIso(),
			workspaceId
		});
	}
}
