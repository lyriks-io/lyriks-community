import type { DerivedCapability } from '$domain/users';
import { screenPath, type ProjectExperienceDraft } from '$domain/experience';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

/**
 * Surfaces as permission-matrix rows.
 *
 * A surface is anything that carries user input — a page, a dialog, a panel, a
 * form, a workflow step. They are where access is actually granted or refused,
 * yet the matrix used to show only features and journeys, so "who can open the
 * refund dialog?" had no row to answer it. This module projects the two places
 * surfaces live into `DerivedCapability` rows:
 *
 *  - Experience `screens` — the product's pages (route + core grouping);
 *  - the kernel surfaces authored on each leaf feature — dialogs, panels,
 *    forms and workflows that never become a standalone page.
 *
 * Pure and IO-free: callers hand in the drafts / snapshots they already hold,
 * so the users page (through the upstream provider) and the global coherence
 * checker score the SAME surface universe without either one re-reading the
 * kernel.
 */

export const SCREEN_CAPABILITY_PREFIX = 'screen:';
export const SURFACE_CAPABILITY_PREFIX = 'surface:';

/** Kernel surfaces mirrored from builder screens — already covered by `screenCapabilities`. */
const MIRRORED_SCREEN_SURFACE_PREFIX = 'srf-screen-';

export function screenCapabilityId(screenId: string): string {
	return `${SCREEN_CAPABILITY_PREFIX}${screenId}`;
}

export function surfaceCapabilityId(featureId: string, surfaceId: string): string {
	return `${SURFACE_CAPABILITY_PREFIX}${featureId}:${surfaceId}`;
}

/** Every page of the product: the Experience draft's Library Screens. */
export function screenCapabilities(
	experience: ProjectExperienceDraft | null
): DerivedCapability[] {
	if (!experience) return [];
	const coreName = new Map(experience.derivedCores.map((c) => [c.id, c.name]));
	return experience.screens.map((screen) => ({
		id: screenCapabilityId(screen.id),
		label: screen.name || '<unnamed screen>',
		source: 'surface' as const,
		sourceRefId: screen.category ?? '',
		sourceRefLabel: (screen.category && coreName.get(screen.category)) || 'Transverse',
		kind: 'surface' as const,
		surfaceKind: 'page',
		path: screenPath(screen)
	}));
}

/** One leaf feature and the kernel snapshot that holds its surfaces. */
export interface LeafSnapshot {
	readonly id: string;
	readonly name: string;
	readonly snapshot: UnspaFeatureSnapshot | null;
}

interface KernelSurface {
	id?: unknown;
	name?: unknown;
	type?: unknown;
	presentation?: unknown;
}

/**
 * The dialogs, panels, forms and workflows authored in the behavior kernel.
 * Builder-mirrored screen surfaces are skipped — `screenCapabilities` already
 * owns those, and listing both would double every page in the matrix.
 */
export function featureSurfaceCapabilities(leaves: readonly LeafSnapshot[]): DerivedCapability[] {
	const rows: DerivedCapability[] = [];
	for (const leaf of leaves) {
		const raw = (leaf.snapshot?.feature as { surfaces?: unknown })?.surfaces;
		if (!Array.isArray(raw)) continue;
		for (const candidate of raw as KernelSurface[]) {
			if (!candidate || typeof candidate !== 'object') continue;
			const id = typeof candidate.id === 'string' ? candidate.id : '';
			if (!id || id.startsWith(MIRRORED_SCREEN_SURFACE_PREFIX)) continue;
			if (candidate.presentation === true) continue;
			rows.push({
				id: surfaceCapabilityId(leaf.id, id),
				label: typeof candidate.name === 'string' && candidate.name ? candidate.name : id,
				source: 'surface',
				sourceRefId: leaf.id,
				sourceRefLabel: leaf.name || '<unnamed feature>',
				kind: 'surface',
				surfaceKind: typeof candidate.type === 'string' && candidate.type ? candidate.type : 'surface'
			});
		}
	}
	return rows;
}

/** Every surface of the project — pages first, then the behavior surfaces. */
export function surfaceCapabilities(
	experience: ProjectExperienceDraft | null,
	leaves: readonly LeafSnapshot[]
): DerivedCapability[] {
	return [...screenCapabilities(experience), ...featureSurfaceCapabilities(leaves)];
}
