import type { AppServices } from '$composition/container.server';
import { citePassages, type PassageInput, type PassageRefusal, type ProjectDocumentsDraft, type SourcePassage, type StoredText } from '$domain/documents';

/**
 * One source, one id (criteria 81dffe4f, f09da92d of feat-source-register):
 * the register row names the text Unspag stores for it, and the passages an
 * element rests on are places in that text. The text stays in Unspag's source
 * store; the register keeps its reference and the passages, never its bytes.
 */

/** One page of a stored text, as the engine reads it back. */
const PAGE_CHARS = 200_000;
/** Unspag stores a source of at most 1 MiB: a few pages at most. */
const MAX_PAGES = 8;

/** The whole stored text of a source, paged from Unspag's store; null when the engine or the text is not there. */
export async function storedTextOf(services: Pick<AppServices, 'codeAdoption'>, storedId: string): Promise<string | null> {
	let text = '';
	for (let page = 0; page < MAX_PAGES; page++) {
		const answer = await services.codeAdoption.getSource(storedId, { offset: text.length, maxChars: PAGE_CHARS });
		if (!answer?.ok) return null;
		const content = typeof answer.value.content === 'string' ? answer.value.content : null;
		const total = Number(answer.value.totalChars);
		if (content === null) return null;
		text += content;
		if (content.length === 0 || !Number.isFinite(total) || text.length >= total) return text;
	}
	return text;
}

/** Read the register with the revision a save lands on: a register edited meanwhile refuses the save rather than being overwritten. */
async function registerOf(services: AppServices, projectId: string): Promise<{ draft: ProjectDocumentsDraft; revision: number | null }> {
	const revision = await services.sectionDocuments.currentRevision(projectId, 'documents');
	return { draft: await services.loadDocumentRegister.execute(projectId), revision };
}

const ATTEMPTS = 3;

/** The register row the text was stored for now names it, by its stored id and hash. */
export async function linkStoredText(services: AppServices, projectId: string, registerId: string, stored: StoredText, origin: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const { draft, revision } = await registerOf(services, projectId);
		const row = draft.sources.find((s) => s.id === registerId);
		if (!row) return { ok: false, reason: `No source of the register has the id "${registerId}": register it first in the documents section.` };
		if (row.stored?.id === stored.id && row.stored.hash === stored.hash) return { ok: true };
		const next = { ...draft, sources: draft.sources.map((s) => (s.id === registerId ? { ...s, stored } : s)) };
		if (await services.saveDocumentsDraft.execute(next, { expectedRevision: revision, origin })) return { ok: true };
	}
	return { ok: false, reason: 'The register changed while the text was linked to it. Try again.' };
}

/** Whether a register id names a row, read before storing anything for it. */
export async function registerHolds(services: AppServices, projectId: string, registerId: string): Promise<boolean> {
	const draft = await services.loadDocumentRegister.execute(projectId);
	return draft.sources.some((s) => s.id === registerId);
}

/** Cite the passages elements rest on: each placed in its source's stored text by the server, the words it cannot find refused by name. */
export async function citeSourcePassages(
	services: AppServices,
	projectId: string,
	inputs: readonly PassageInput[],
	origin: string | null
): Promise<{ ok: true; recorded: readonly SourcePassage[]; refused: readonly PassageRefusal[] } | { ok: false; reason: string }> {
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const { draft, revision } = await registerOf(services, projectId);
		const texts = new Map<string, string | null>();
		for (const id of new Set(inputs.map((i) => i.sourceId))) {
			const stored = draft.sources.find((s) => s.id === id)?.stored;
			texts.set(id, stored ? await storedTextOf(services, stored.id) : null);
		}
		const outcome = citePassages(draft, inputs, (id) => texts.get(id) ?? null, () => crypto.randomUUID());
		if (outcome.recorded.length === 0) return { ok: true, recorded: [], refused: outcome.refused };
		if (await services.saveDocumentsDraft.execute(outcome.draft, { expectedRevision: revision, origin })) return { ok: true, recorded: outcome.recorded, refused: outcome.refused };
	}
	return { ok: false, reason: 'The register changed while the passages were recorded. Try again.' };
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** What a span the analysis recorded says it took: the analysis names the element, not what it took. */
export const TRACED_BY_ANALYSIS = 'Traced by the analysis of its feature';

/**
 * The spans the analysis of a feature recorded for a behaviour element (an
 * action, a rule) in a stored text, read as passages of that element, so one
 * reader shows everything the element rests on in the source (criterion
 * f09da92d). Empty for any other element, or when the engine is not there.
 */
export async function analysisSpansAsPassages(services: AppServices, projectId: string, anchor: string, registerId: string, storedId: string): Promise<SourcePassage[]> {
	const [kind, featureId, elementId] = anchor.split(':');
	if ((kind !== 'action' && kind !== 'rule') || !featureId || !elementId) return [];
	const features = await services.loadFeaturesDraft.execute(projectId).catch(() => null);
	const leaf = features?.features.find((f) => f.id === featureId);
	if (!leaf) return [];
	const provenance = await services.codeAdoption.getProvenance(leaf.unspaghettitFeatureId || leaf.id).catch(() => null);
	const spans = Array.isArray(provenance?.ok ? provenance.value.spans : null) ? (provenance!.ok ? (provenance!.value.spans as unknown[]) : []) : [];
	return spans
		.map(rec)
		.filter((s) => s.sourceId === storedId && s.elementId === elementId && num(s.startOffset) !== null && num(s.endOffset) !== null)
		.map((s) => ({
			id: `span-${String(s.id ?? `${s.startOffset}`)}`,
			sourceId: registerId,
			anchor,
			start: num(s.startOffset)!,
			end: num(s.endOffset)!,
			words: typeof s.snippet === 'string' ? s.snippet : '',
			takes: TRACED_BY_ANALYSIS
		}));
}

