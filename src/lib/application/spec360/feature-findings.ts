import type { Gap } from '$domain/coherence';
import { finalCheckFindings, type Finding } from '$domain/retrospec';

/**
 * The points to review of a feature's page (criterion c72a7e79): of what
 * Lyriks noticed in the whole spec (the Overview's list, `noticed`), the
 * points that name this feature, as they read there. An issue names it by its
 * related feature, a point of the final check by the feature it is about (its
 * id, else the name the engine gave it), and the list of the features with no
 * action described when this feature is one of them. Pure.
 */
export function findingsNamingFeature(input: {
	readonly noticed: readonly Finding[];
	readonly feature: { readonly id: string; readonly name: string };
	readonly issues: readonly { readonly id: string; readonly relatedFeatureId: string | null }[];
	readonly gaps: readonly Gap[];
	/** Whether the feature holds any authored behaviour. */
	readonly authored: boolean;
}): Finding[] {
	const { feature } = input;
	const ids = new Set(input.issues.filter((i) => i.relatedFeatureId === feature.id).map((i) => `issue:${i.id}`));
	const about = (g: Gap) => (g.featureRef ? g.featureRef === feature.id : !!feature.name.trim() && (g.subject ?? '').trim() === feature.name.trim());
	// The same reading as the whole list, run on this feature's gaps: a point keeps its id across both.
	for (const f of finalCheckFindings(input.gaps.filter(about))) ids.add(f.id);
	if (!input.authored) ids.add('computed:features-without-behavior');
	return input.noticed.filter((f) => ids.has(f.id));
}
