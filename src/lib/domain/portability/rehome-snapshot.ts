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

import type { ProjectSnapshot } from './snapshot';

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
	const swap = <T>(value: T): T =>
		replaceExact(value, projectScopedIds(snapshot.projectId), projectScopedIds(target.projectId)) as T;
	const name = target.name?.trim() || snapshot.name;

	const rehomed: ProjectSnapshot = {
		projectId: target.projectId,
		name,
		description: snapshot.description,
		rows: {
			legacyDocuments: swap(snapshot.rows.legacyDocuments),
			sectionDocuments: swap(snapshot.rows.sectionDocuments),
			residue: swap(snapshot.rows.residue),
			revisions: snapshot.rows.revisions,
			meta:
				target.domainId === undefined
					? snapshot.rows.meta
					: { domainId: target.domainId, shippedAt: snapshot.rows.meta?.shippedAt ?? null }
		},
		kernel: {
			project: swap(snapshot.kernel.project),
			features: swap(snapshot.kernel.features)
		},
		domain: snapshot.domain
	};

	return name === snapshot.name ? rehomed : renameIn(rehomed, name);
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

/** Every id the project id spells: itself, then the aux features derived from it. */
function projectScopedIds(projectId: string): readonly string[] {
	return [projectId, `${projectId}__experience`, `${projectId}__data_model`];
}

/** Deep copy with every string exactly equal to `from[i]` replaced by `to[i]`. */
function replaceExact(value: unknown, from: readonly string[], to: readonly string[]): unknown {
	if (typeof value === 'string') {
		const at = from.indexOf(value);
		return at === -1 ? value : to[at];
	}
	if (Array.isArray(value)) return value.map((v) => replaceExact(v, from, to));
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, replaceExact(v, from, to)])
		);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
