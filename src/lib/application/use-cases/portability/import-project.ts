import { makeProjectId } from '$domain/catalog';
import { readBundle, rehomeSnapshot, type ProjectSnapshot } from '$domain/portability';
import { humanizeDomainName } from '$domain/portfolio';
import {
	ArchiveError,
	type ArchiveCodecPort,
	type BehaviorRepositoryPort,
	type ClockPort,
	type PortfolioRepositoryPort,
	type ProjectCatalogPort,
	type ProjectLockPort,
	type ProjectPortabilityStorePort,
	type ReconciliationStorePort
} from '$application/ports';

export interface ImportProjectRequest {
	readonly bytes: Uint8Array;
	/**
	 * `copy` mints a fresh id so a bundle can be imported next to its original;
	 * `restore` keeps the bundle's own id, for moving an install or rolling a
	 * project back. Restore refuses to clobber an existing project unless the
	 * caller explicitly asks to overwrite it.
	 */
	readonly mode: 'copy' | 'restore';
	readonly overwrite?: boolean;
	/** Rename the imported copy. Omit to keep the bundle's name. */
	readonly name?: string;
	/** File the import under this Domain. Omit to keep the bundle's own. */
	readonly domainId?: string | null;
}

/** How many random suffixes a copy tries before giving up on a free id. */
const MINT_ATTEMPTS = 8;

export type ImportProjectResult =
	| {
			readonly ok: true;
			readonly projectId: string;
			readonly name: string;
			readonly warnings: readonly string[];
	  }
	| { readonly ok: false; readonly error: string };

/**
 * Restore a project from a bundle, into this install.
 *
 * Two things make this more than "write the rows back":
 *
 *  - **Identity.** The project id is the kernel folder key, every row's primary
 *    key, and a field inside the documents. A copy has to be rehomed onto a new
 *    id consistently or it addresses one project on disk and another in the
 *    database (see `rehomeSnapshot`).
 *  - **Provenance.** A bundle carries the *source* install's Domain ids and
 *    whatever else it knew. Domains are matched by name and re-created when
 *    absent; the back link is deliberately not carried at all, so the copy
 *    re-mirrors to *this* install's back rather than claiming the original's.
 *
 * The kernel is written first (staged and swapped atomically), then the rows in
 * one transaction. A failure after the kernel write rolls the copy back so a
 * half-imported project never appears in the portfolio.
 */
export class ImportProjectUseCase {
	constructor(
		private readonly rows: ProjectPortabilityStorePort,
		private readonly kernel: ReconciliationStorePort,
		private readonly behavior: BehaviorRepositoryPort,
		private readonly catalog: ProjectCatalogPort,
		private readonly portfolio: PortfolioRepositoryPort,
		private readonly lock: ProjectLockPort,
		private readonly archive: ArchiveCodecPort,
		private readonly clock: ClockPort,
		private readonly randomSuffix: () => string = () => crypto.randomUUID().slice(0, 6)
	) {}

	async execute(request: ImportProjectRequest): Promise<ImportProjectResult> {
		let files: Map<string, Uint8Array>;
		try {
			files = this.archive.decode(request.bytes);
		} catch (e) {
			if (e instanceof ArchiveError) return { ok: false, error: e.message };
			throw e;
		}

		const parsed = readBundle(files);
		if (!parsed.ok) return { ok: false, error: parsed.error };

		const warnings = [...parsed.warnings];
		const name = request.name?.trim() || parsed.snapshot.name;

		let projectId: string;
		if (request.mode === 'restore') {
			projectId = parsed.snapshot.projectId;
			if (await this.rows.exists(projectId)) {
				if (!request.overwrite) {
					return {
						ok: false,
						error: `A project with id "${projectId}" already exists here. Import it as a copy, or confirm the overwrite.`
					};
				}
				warnings.push(`Overwrote the existing project "${projectId}".`);
			}
		} else {
			const minted = await this.mintFreeId(name);
			if (!minted) {
				return {
					ok: false,
					error: `Could not mint a free project id for "${name}". Please try again.`
				};
			}
			projectId = minted;
		}

		const domainId = await this.resolveDomain(parsed.snapshot, request, warnings);
		const snapshot = rehomeSnapshot(parsed.snapshot, { projectId, name, domainId });

		return this.lock.withLock(projectId, () => this.write(snapshot, warnings, request.mode));
	}

	/**
	 * An id nothing here answers to yet, for a copy.
	 *
	 * Both halves of a project's identity are checked, because they can disagree:
	 * the rows say a project exists, the kernel folder says a behavior workspace
	 * exists, and a delete or a failed import can leave one without the other.
	 * Landing a copy on either would not just clash, it would take the folder
	 * over (`promoteCanonical` quarantines what it finds) and hand the copy
	 * someone else's behavior.
	 *
	 * Retried rather than refused on the first clash: the suffix is random, so a
	 * collision is a coin toss to re-flip, not an error to report.
	 */
	private async mintFreeId(name: string): Promise<string | null> {
		for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt++) {
			const candidate = makeProjectId(name, this.randomSuffix());
			const taken =
				(await this.rows.exists(candidate)) ||
				(await this.behavior.loadProject(candidate).catch(() => null)) !== null;
			if (!taken) return candidate;
		}
		return null;
	}

	private async write(
		snapshot: ProjectSnapshot,
		warnings: readonly string[],
		mode: ImportProjectRequest['mode']
	): Promise<ImportProjectResult> {
		const { projectId } = snapshot;
		let kernelWritten = false;
		try {
			if (snapshot.kernel.project) {
				await this.kernel.promoteCanonical({
					canonicalKernelId: projectId,
					// Force the id rather than trusting the bundle: a legacy folder whose
					// manifest id had drifted from its folder key would otherwise import a
					// kernel that addresses a project this install does not have.
					project: { ...snapshot.kernel.project, id: projectId },
					features: snapshot.kernel.features.map((f) => f.feature),
					quarantineStamp: this.clock.nowIso().replace(/[:.]/g, '-')
				});
				kernelWritten = true;
			}
			await this.rows.write(projectId, snapshot.rows);
		} catch (e) {
			// A copy that failed halfway is nobody's project — remove it. A restore is
			// left alone: its previous kernel folder is in the quarantine, and deleting
			// would destroy the very project the operator was recovering.
			if (mode === 'copy') {
				if (kernelWritten) await this.behavior.deleteProject(projectId).catch(() => {});
				await this.catalog.remove(projectId).catch(() => {});
			}
			return { ok: false, error: `Import failed: ${e instanceof Error ? e.message : String(e)}` };
		}

		return { ok: true, projectId, name: snapshot.name, warnings };
	}

	/**
	 * Decide which Domain the import lands in. The caller's choice wins; otherwise
	 * the bundle's own Domain is matched **by name** — ids are install-local, so
	 * carrying the source id over would file the project under an unrelated Domain
	 * or none at all — and re-created when this install has no such Domain.
	 */
	private async resolveDomain(
		snapshot: ProjectSnapshot,
		request: ImportProjectRequest,
		warnings: string[]
	): Promise<string | null> {
		const domains = await this.portfolio.listDomains();

		if (request.domainId !== undefined) {
			if (request.domainId === null) return null;
			if (domains.some((d) => d.id === request.domainId)) return request.domainId;
			warnings.push(`Domain "${request.domainId}" does not exist here — the import was left unfiled.`);
			return null;
		}

		const source = snapshot.domain;
		if (!source) return null;

		const byName = domains.find((d) => d.name.trim().toLowerCase() === source.name.trim().toLowerCase());
		if (byName) return byName.id;

		const id = domains.some((d) => d.id === source.id) ? `${source.id}-${this.randomSuffix()}` : source.id;
		await this.portfolio.saveDomain({
			id,
			name: source.name || humanizeDomainName(id),
			description: source.description,
			icon: source.icon,
			createdAt: this.clock.nowIso()
		});
		warnings.push(`Created domain "${source.name}" for the import.`);
		return id;
	}
}
