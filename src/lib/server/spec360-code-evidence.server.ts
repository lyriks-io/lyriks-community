import type { AppServices } from '$composition/container.server';
import { codeEvidence, spanForPlace, type AttachedSource, type CodeEvidence, type CodePlaceQuery, type RecordedSpan } from '$application/spec360/code-evidence';

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The evidence behind one place a feature page shows in the code
 * (ac-src-code-place): the engine's span for the element, read from the
 * source the analysis attached, else the line the implementation index
 * recorded there. Only a feature of this project and sources of this project
 * are read; nothing leaves the installation. Null when the feature is not the
 * project's.
 */
export async function readCodeEvidence(services: AppServices, projectId: string, featureId: string, place: CodePlaceQuery): Promise<CodeEvidence | null> {
	const features = await services.loadFeaturesDraft.execute(projectId);
	const leaf = features.features.find((f) => f.id === featureId);
	if (!leaf) return null;

	const coverage = await services.implementationCoverage.get(projectId).catch(() => ({}));
	const elements = Object.values(rec(rec(rec(coverage)[featureId]).actions)).flatMap((a) => arr(rec(a).elements));
	const located = elements.map(rec).find((e) => {
		const at = rec(e.location);
		return place.elementId ? str(e.id) === place.elementId : str(at.file) === place.file && num(at.line) === place.line;
	});
	const indexLine = place.recorded?.trim() || (located ? str(rec(located.location).snippet) : '');

	const provenance = await services.codeAdoption.getProvenance(leaf.unspaghettitFeatureId || leaf.id).catch(() => null);
	const value = provenance && provenance.ok ? provenance.value : {};
	const sources: AttachedSource[] = arr(value.sources)
		.map(rec)
		.filter((s) => !str(s.projectId) || str(s.projectId) === projectId)
		.map((s) => ({ id: str(s.id), name: str(s.name), projectId: str(s.projectId) }));
	const spans: RecordedSpan[] = arr(value.spans)
		.map(rec)
		.filter((s) => num(s.startLine) !== null && num(s.endLine) !== null)
		.map((s) => ({ elementId: str(s.elementId), sourceId: str(s.sourceId), startLine: num(s.startLine)!, endLine: num(s.endLine)! }));
	const span = spanForPlace(spans, sources, place);

	let content: string | null = null;
	if (span) {
		const source = await services.codeAdoption.getSource(span.sourceId).catch(() => null);
		const body = source && source.ok ? source.value : null;
		if (body && (!str(body.projectId) || str(body.projectId) === projectId)) content = str(body.content);
	}
	return codeEvidence({ place, span, content, indexLine });
}
