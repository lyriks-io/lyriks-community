import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

/**
 * How many screens of a feature are traced to a source (criterion c72a7e79):
 * a screen of its behavior model that a passage of a source attached to this
 * project was recorded for. A screen no source backs may have been written by
 * an LLM, so it is not counted. Pure.
 */
export function sourcedScreens(projectId: string, snapshot: UnspaFeatureSnapshot | null, provenance: Readonly<Record<string, unknown>> | null): number {
	const screens = new Set(list(rec(snapshot?.feature).surfaces).map((s) => rec(s).id));
	const sources = new Set(
		list(provenance?.sources)
			.map(rec)
			.filter((s) => !s.projectId || s.projectId === projectId)
			.map((s) => s.id)
	);
	const traced = list(provenance?.spans)
		.map(rec)
		.filter((s) => s.elementType === 'surface' && screens.has(s.elementId) && sources.has(s.sourceId));
	return new Set(traced.map((s) => s.elementId)).size;
}

type Raw = Record<string, unknown>;
const rec = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
