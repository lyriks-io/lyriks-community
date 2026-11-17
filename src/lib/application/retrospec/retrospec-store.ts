import type { DraftLockPort, SectionDocumentStorePort } from '../ports';
import {
	RETROSPEC_SECTION,
	applyRetrospecActs,
	emptyRetrospecDocument,
	parseRetrospecDocument,
	type ActContext,
	type RetrospecAct,
	type RetrospecDocument
} from '$domain/retrospec';

/**
 * The retrospecification document in the section document store, under its
 * internal key, with the store's optimistic revision.
 *
 * An act is an intent ("I validate this item"), not a copy of the document, so
 * a save that lost the race to another person's act is not a conflict to hand
 * back: the acts are applied again to the document as it now reads and saved
 * under its new revision. Only an act the document now refuses comes back.
 */

export async function loadRetrospecDocument(
	store: SectionDocumentStorePort,
	projectId: string
): Promise<{ doc: RetrospecDocument; revision: number }> {
	const [raw, revision] = await Promise.all([store.load(projectId, RETROSPEC_SECTION), store.currentRevision(projectId, RETROSPEC_SECTION)]);
	return { doc: raw === null ? emptyRetrospecDocument() : parseRetrospecDocument(raw), revision };
}

export type RetrospecSaveOutcome =
	| { readonly ok: true; readonly doc: RetrospecDocument; readonly revision: number }
	| { readonly ok: false; readonly reason: string; readonly conflict?: boolean };

/** How many times acts are applied again after losing the race to another save. */
const REBASE_ATTEMPTS = 4;

export async function saveRetrospecActs(
	store: SectionDocumentStorePort,
	projectId: string,
	acts: readonly RetrospecAct[],
	ctx: ActContext,
	origin: string | null
): Promise<RetrospecSaveOutcome> {
	for (let attempt = 0; attempt < REBASE_ATTEMPTS; attempt++) {
		const { doc, revision } = await loadRetrospecDocument(store, projectId);
		const outcome = applyRetrospecActs(doc, acts, ctx);
		if (!outcome.ok) return { ok: false, reason: outcome.reason };
		if (outcome.doc === doc) return { ok: true, doc, revision };
		const saved = await store.save(projectId, RETROSPEC_SECTION, outcome.doc, revision, origin);
		if (saved !== null) return { ok: true, doc: outcome.doc, revision: saved };
	}
	return { ok: false, reason: 'Others are acting on this Reverse-Specification right now. Try again in a moment.', conflict: true };
}

/**
 * Every section revision of a project, both stores summed per key: the sections
 * still on the legacy lock and the consolidated documents. One query per store
 * when the adapters can batch, one per section otherwise.
 */
export async function readSectionRevisions(
	documents: SectionDocumentStorePort,
	locks: DraftLockPort,
	projectId: string,
	sections: readonly string[]
): Promise<Record<string, number>> {
	const each = async (read: (section: string) => Promise<number>) =>
		new Map(await Promise.all(sections.map(async (s) => [s, await read(s)] as const)));
	const [docs, legacy] = await Promise.all([
		documents.currentRevisions ? documents.currentRevisions(projectId) : each((s) => documents.currentRevision(projectId, s)),
		locks.currentRevisions ? locks.currentRevisions(projectId) : each((s) => locks.current(projectId, s))
	]);
	const out: Record<string, number> = {};
	for (const map of [docs, legacy]) {
		for (const [key, value] of map) {
			if (key === RETROSPEC_SECTION) continue;
			out[key] = (out[key] ?? 0) + value;
		}
	}
	return out;
}
