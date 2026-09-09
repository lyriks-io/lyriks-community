import {
	buildBundle,
	bundleFileName,
	describeProject,
	type HashFn,
	type ProjectSnapshot
} from '$domain/portability';
import { chooseKernelFeatures } from '$application/choose-kernel-features';
import type {
	ArchiveCodecPort,
	ClockPort,
	PortfolioRepositoryPort,
	ProjectPortabilityStorePort,
	ReconciliationStorePort
} from '$application/ports';

export interface ExportedBundle {
	readonly fileName: string;
	readonly bytes: Uint8Array;
	readonly projectName: string;
	/**
	 * What the packaging had to decide for itself, in the operator's words.
	 * Empty for a healthy project; a drifted kernel folder (two files, one
	 * feature id) says so here rather than losing a file quietly.
	 */
	readonly warnings: readonly string[];
}

/**
 * Package a whole project — every row, the behavior kernel, and the uploaded
 * files inside them — as one downloadable archive.
 *
 * Reads at storage level rather than through the section repositories: those
 * project the kernel and merge residue, so a copy taken through them would be a
 * re-derivation, not a copy. See `ProjectPortabilityStorePort`.
 */
export class ExportProjectUseCase {
	constructor(
		private readonly rows: ProjectPortabilityStorePort,
		private readonly kernel: ReconciliationStorePort,
		private readonly portfolio: PortfolioRepositoryPort,
		private readonly archive: ArchiveCodecPort,
		private readonly clock: ClockPort,
		private readonly hash: HashFn,
		private readonly appVersion: string
	) {}

	/** Returns null when the project has no identity draft — i.e. does not exist. */
	async execute(projectId: string): Promise<ExportedBundle | null> {
		const rows = await this.rows.read(projectId);
		if (!rows.legacyDocuments['project_drafts']) return null;

		const [folder] = await this.kernel.loadCandidates([projectId]);
		// A bundle addresses features by id (one zip entry per id), so a folder
		// holding twins has to be resolved BEFORE packing, not by whichever entry
		// the archive writes last. See `chooseKernelFeatures`.
		const kernelFeatures = chooseKernelFeatures(folder?.features ?? []);
		const identity = describeProject(rows, projectId);
		const domain = rows.meta?.domainId
			? ((await this.portfolio.listDomains()).find((d) => d.id === rows.meta?.domainId) ?? null)
			: null;

		const snapshot: ProjectSnapshot = {
			projectId,
			name: identity.name,
			description: identity.description,
			rows,
			kernel: { project: folder?.project ?? null, features: kernelFeatures.features },
			domain: domain
				? { id: domain.id, name: domain.name, description: domain.description, icon: domain.icon }
				: null
		};

		const exportedAt = this.clock.nowIso();
		const entries = buildBundle({
			snapshot,
			exportedAt,
			appVersion: this.appVersion,
			hash: this.hash
		});

		return {
			fileName: bundleFileName(identity.name, exportedAt),
			bytes: this.archive.encode(entries),
			projectName: identity.name,
			warnings: kernelFeatures.droppedTwins.map(
				(twin) =>
					`Two kernel files claimed one feature id; kept the one this install reads and left out ${twin}.`
			)
		};
	}
}
