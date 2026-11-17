import type { ProjectFeaturesDraft } from '$domain/features';
import { sortByName } from '$domain/shared';
import { text } from './labels';

/**
 * The shape of the Specification 360°: the core features from A to Z, each
 * with its features from A to Z (criterion 4b3d2b4d). It is what the page navigation
 * walks (previous / next through every core and feature) and what tells a
 * feature page from a core page, so it is read once for every sub-page.
 */
export interface OutlineFeature {
	readonly id: string;
	readonly name: string;
	/** What it does, as the features section says it: edited in the list of its core feature (criterion 41514698). */
	readonly description: string;
}

export interface OutlineCore {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly features: readonly OutlineFeature[];
}

export interface SpecOutline {
	readonly cores: readonly OutlineCore[];
}

const named = (name: string, fallback: string) => text(name) || fallback;

export function specOutline(features: ProjectFeaturesDraft): SpecOutline {
	return {
		cores: sortByName(
			features.cores.map((core) => ({
				id: core.id,
				name: named(core.name, 'Untitled core feature'),
				description: text(core.description),
				features: sortByName(
					features.features.filter((f) => f.coreId === core.id).map((f) => ({ id: f.id, name: named(f.name, 'Untitled feature'), description: text(f.description) }))
				)
			}))
		)
	};
}

/** What an id under /spec/features names: a core feature, one of its features, or nothing. */
export function locateInOutline(
	outline: SpecOutline,
	id: string
): { kind: 'core'; core: OutlineCore } | { kind: 'feature'; core: OutlineCore; feature: OutlineFeature } | null {
	for (const core of outline.cores) {
		if (core.id === id) return { kind: 'core', core };
		const feature = core.features.find((f) => f.id === id);
		if (feature) return { kind: 'feature', core, feature };
	}
	return null;
}
