/**
 * Rewrite a snapshot's identity for its new home.
 *
 * The project id is not a label: it is the kernel folder key
 * (`data/unspa/<projectId>/`), the primary key of every row, and a field inside
 * the documents themselves (`projectId` on the Foundation identity draft, `id`
 * on the kernel manifest). Importing under a new id therefore means rewriting
 * all of them together — a half-rehomed snapshot would address one project on
 * disk and another in the database.
 *
 * Replacement is whole-string only. A substring pass would silently corrupt any
 * prose that happens to mention the old id, and specification text is the one
 * thing a copy must never alter.
 */

import type { KernelArtifact, ProjectSnapshot } from './snapshot';
import { copyReferences, type CopyIdentities } from './copy-references';

export interface RehomeTarget {
	readonly projectId: string;
	/** New display name, when the copy is being renamed. Omit to keep the original. */
	readonly name?: string;
	/** Domain to file the copy under in the target install. */
	readonly domainId?: string | null;
}

export function rehomeSnapshot(snapshot: ProjectSnapshot, target: RehomeTarget): ProjectSnapshot {
	// The project id also names the two aux kernel features the platform derives
	// from it (`<projectId>__experience`, `<projectId>__data_model`). Left as they
	// were, the copy would look for `<newId>__data_model`, find nothing, and show
	// an empty data model beside a kernel that holds every entity.
	const ids = copyIdentities(snapshot, target.projectId);
	const swap = <T>(value: T): T => copyReferences(value, ids);
	const name = target.name?.trim() || snapshot.name;

	const rehomed: ProjectSnapshot = {
		projectId: target.projectId,
		name,
		description: snapshot.description,
		rows: {
			legacyDocuments: swap(snapshot.rows.legacyDocuments),
			sectionDocuments: swap(snapshot.rows.sectionDocuments),
			residue: swap(Object.fromEntries(Object.entries(snapshot.rows.residue).filter(([key]) => target.projectId === snapshot.projectId || !key.startsWith('cache:') || key === 'cache:score-history'))),
			revisions: snapshot.rows.revisions,
			meta:
				target.domainId === undefined
					? snapshot.rows.meta
					: { domainId: target.domainId, shippedAt: snapshot.rows.meta?.shippedAt ?? null }
		},
		kernel: {
			project: swap(snapshot.kernel.project),
			features: swap(snapshot.kernel.features),
			...(snapshot.kernel.artifacts ? { artifacts: snapshot.kernel.artifacts.map(artifact => rehomeArtifact(artifact, ids, target.projectId)) } : {})
		},
		domain: snapshot.domain
	};

	return name === snapshot.name ? rehomed : renameIn(rehomed, name);
}

function rehomeArtifact(artifact: KernelArtifact, ids: CopyIdentities, projectId: string): KernelArtifact {
	if (artifact.kind !== 'source') {
		return { ...artifact, id: ids.records.get(artifact.id) ?? artifact.id, document: copyReferences(artifact.document, ids) };
	}
	// A stored document is evidence, including its metadata. Only its ownership
	// and the predecessor link change; never rewrite ids inside the evidence.
	const document = structuredClone(artifact.document);
	const source = document.source as Record<string, unknown>;
	const id = ids.sources.get(artifact.id) ?? artifact.id;
	return {
		...artifact, id,
		document: { ...document, source: {
			...source, id, projectId,
			...(typeof source.supersedes === 'string' ? { supersedes: ids.sources.get(source.supersedes) ?? source.supersedes } : {})
		} }
	};
}

/**
 * Apply the new display name where the product's name actually lives: the
 * Foundation identity draft (the catalog derives every project name from it) and
 * the kernel manifest (what the Unspaghettit dashboard shows).
 */
function renameIn(snapshot: ProjectSnapshot, name: string): ProjectSnapshot {
	const identity = snapshot.rows.legacyDocuments['project_drafts'];
	const legacyDocuments = isRecord(identity)
		? { ...snapshot.rows.legacyDocuments, project_drafts: { ...identity, productName: name } }
		: snapshot.rows.legacyDocuments;
	const kernelProject = snapshot.kernel.project
		? { ...snapshot.kernel.project, name }
		: snapshot.kernel.project;
	return {
		...snapshot,
		rows: { ...snapshot.rows, legacyDocuments },
		kernel: { ...snapshot.kernel, project: kernelProject }
	};
}

/** Project-level records have names derived from their owning project. */
function projectScopedIds(projectId: string): readonly string[] {
	return [projectId, `${projectId}__experience`, `${projectId}__data_model`];
}

/** Allocate disjoint record namespaces; nested action and surface ids stay local. */
function copyIdentities(snapshot: ProjectSnapshot, projectId: string): CopyIdentities {
	const records = new Map<string, string>();
	const sources = new Map<string, string>();
	if (projectId === snapshot.projectId) return { records, sources };
	projectScopedIds(snapshot.projectId).forEach((id, index) => records.set(id, projectScopedIds(projectId)[index]));
	snapshot.kernel.features.filter(feature => !records.has(feature.id)).map(feature => feature.id).sort().forEach((id, index) => records.set(id, `feat-${projectId}-${index + 1}`));
	(snapshot.kernel.artifacts ?? []).filter(artifact => artifact.kind === 'source').map(artifact => artifact.id).sort().forEach((id, index) => sources.set(id, `src-${projectId}-${index + 1}`));
	return { records, sources };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
