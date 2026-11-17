import { createCore, createFeature, leafFeatures } from '$domain/features';
import {
	REUSE_LIBRARY_SECTION,
	libraryKeyFor,
	createEmptyReuseLibrary,
	type ReuseLibraryDraft,
	type RequirementTemplate
} from '$domain/reuse';
import { parseReuseLibrary } from './parse-reuse-library';
import type { ClockPort, ProjectResidueRepositoryPort } from '../ports';
import type {
	LoadFoundationDraftUseCase,
	LoadFeaturesDraftUseCase,
	SaveFeaturesDraftUseCase
} from '../use-cases/index';

const IMPORTED_CORE_NAME = 'Imported requirements';

/** The library of one workspace (null: the installation without workspaces). */
async function loadLibrary(residue: ProjectResidueRepositoryPort, workspaceId: string | null): Promise<ReuseLibraryDraft> {
	const key = libraryKeyFor(workspaceId);
	const raw = await residue.load(key, REUSE_LIBRARY_SECTION);
	return raw == null ? createEmptyReuseLibrary(key) : { ...parseReuseLibrary(raw), projectId: key };
}

async function saveLibrary(
	residue: ProjectResidueRepositoryPort,
	draft: ReuseLibraryDraft,
	workspaceId: string | null
): Promise<void> {
	await residue.save(libraryKeyFor(workspaceId), REUSE_LIBRARY_SECTION, draft);
}

/** Read the reuse library a workspace keeps (null: the installation without workspaces). */
export class LoadReuseLibraryUseCase {
	constructor(private readonly residue: ProjectResidueRepositoryPort) {}
	execute(workspaceId: string | null = null): Promise<ReuseLibraryDraft> {
		return loadLibrary(this.residue, workspaceId);
	}
}

/** Lift one leaf feature into the library of the project's workspace as a reusable template. */
export class ExportRequirementUseCase {
	constructor(
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly loadFoundation: LoadFoundationDraftUseCase,
		private readonly clock: ClockPort
	) {}

	async execute(projectId: string, featureId: string, workspaceId: string | null = null): Promise<ReuseLibraryDraft> {
		const [features, identity] = await Promise.all([
			this.loadFeatures.execute(projectId),
			this.loadFoundation.loadIdentity(projectId)
		]);
		const leaf = leafFeatures(features).find((l) => l.id === featureId);
		if (!leaf) throw new Error('feature not found');
		const meta = features.leafMeta?.[featureId] ?? {};
		const now = this.clock.nowIso();
		const template: RequirementTemplate = {
			id: crypto.randomUUID(),
			title: leaf.name,
			description: leaf.description,
			problem: meta.problem ?? '',
			value: meta.value ?? '',
			acceptanceCriteria: (meta.acceptanceCriteria ?? []).map((c) => ({ id: c.id, text: c.text })),
			sourceProjectName: identity.productName.trim() || 'Untitled project',
			createdAt: now
		};
		const lib = await loadLibrary(this.residue, workspaceId);
		const updated: ReuseLibraryDraft = {
			...lib,
			templates: [template, ...lib.templates],
			lastSavedAt: now
		};
		await saveLibrary(this.residue, updated, workspaceId);
		return updated;
	}
}

/**
 * Import a library template into a project as a NEW leaf feature. Writes through
 * the existing Features save path (which folds into the behavior kernel), under
 * a dedicated "Imported requirements" core so it never collides with authored
 * features.
 */
export class ImportRequirementUseCase {
	constructor(
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly saveFeatures: SaveFeaturesDraftUseCase
	) {}

	async execute(projectId: string, templateId: string, workspaceId: string | null = null): Promise<{ featureId: string }> {
		const lib = await loadLibrary(this.residue, workspaceId);
		const template = lib.templates.find((t) => t.id === templateId);
		if (!template) throw new Error('template not found');

		const features = await this.loadFeatures.execute(projectId);
		let core = features.cores.find((c) => c.name === IMPORTED_CORE_NAME);
		if (!core) {
			core = createCore({
				name: IMPORTED_CORE_NAME,
				description: 'Requirements imported from the reuse library.'
			});
			features.cores = [...features.cores, core];
		}
		const feature = createFeature(core.id, null, {
			name: template.title || 'Imported requirement',
			description: template.description
		});
		features.features = [...features.features, feature];
		if (!features.leafMeta) features.leafMeta = {};
		features.leafMeta[feature.id] = {
			problem: template.problem,
			value: template.value,
			acceptanceCriteria: template.acceptanceCriteria.map((c) => ({
				id: crypto.randomUUID(),
				text: c.text
			})),
			sourceLink: `Imported from ${template.sourceProjectName}`
		};
		await this.saveFeatures.execute(features);
		return { featureId: feature.id };
	}
}

/** Remove a template from the library of the project's workspace. */
export class RemoveReuseTemplateUseCase {
	constructor(private readonly residue: ProjectResidueRepositoryPort) {}
	async execute(templateId: string, workspaceId: string | null = null): Promise<ReuseLibraryDraft> {
		const lib = await loadLibrary(this.residue, workspaceId);
		const updated: ReuseLibraryDraft = {
			...lib,
			templates: lib.templates.filter((t) => t.id !== templateId)
		};
		await saveLibrary(this.residue, updated, workspaceId);
		return updated;
	}
}
