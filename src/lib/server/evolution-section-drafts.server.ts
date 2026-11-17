import type { AppServices } from '$composition/container.server';
import {
	SPEC_PAGES,
	applySectionEdits,
	editsBySection,
	liveSectionDrafts,
	pageEditsRefusal,
	sectionDraftChanges,
	sectionEditsIssue,
	sectionEditsRefusal,
	type DraftableSection,
	type EvolutionRequest,
	type SectionDraft,
	type SectionEdit,
	type SectionValueChange,
	type SpecPage
} from '$domain/evolution';
import { pageValueLabel } from '$application/spec360/page-value-labels';
import { SECTION_REVISION_STORAGE } from '$lib/shared/sections';
import { writeSectionInProcess } from '$lib/server/section-save.server';
import { SECTION_WRITES, loadDraftableSection } from '$lib/server/section-write-specs.server';
import { withFoundationLock } from './foundation-lock.server';

/**
 * The pages of the spec a request changes besides its features and its tables,
 * read and written against the sections behind them as they stand
 * (ac-evo-draft-section, -section-read, -section-landing). Each section is laid
 * open as its page reads it, the edits applied on a copy, and the copy put
 * through the section's own guards and parser: what the page's save would
 * refuse, the request refuses when it is drafted. Every sentence names the page.
 */

/** A section as its page reads it, as plain data the edits are laid on. */
async function sectionDocument(services: AppServices, projectId: string, section: DraftableSection): Promise<Record<string, unknown>> {
	const loaded = await loadDraftableSection(services, section, projectId);
	return structuredClone((loaded ?? {}) as Record<string, unknown>);
}

const messageOf = (e: unknown): string =>
	e && typeof e === 'object' && 'body' in e && typeof (e as { body?: { message?: unknown } }).body?.message === 'string'
		? (e as { body: { message: string } }).body.message
		: e instanceof Error
			? e.message
			: String(e);

/** What a section's own guards and parser say of it, or null when it would save. */
async function sectionGuardsRefusal(services: AppServices, projectId: string, page: SpecPage, section: DraftableSection, document: Record<string, unknown>): Promise<string | null> {
	const spec = SECTION_WRITES[section];
	const body = { ...document, projectId };
	try {
		await spec.validate?.(body, services, projectId);
		spec.parse(body, projectId);
		return null;
	} catch (e) {
		return `${SPEC_PAGES[page].name} would refuse this change: ${messageOf(e)}`;
	}
}

/**
 * Whether these edits apply to the sections behind the page as they stand and
 * leave them ones their guards accept: the sentence that refuses them, or null.
 * A malformed edit or one off the page is left to the act, which names it.
 */
export async function checkSectionEdits(services: AppServices, projectId: string, page: SpecPage, edits: readonly unknown[]): Promise<string | null> {
	if (sectionEditsIssue(edits) !== null || pageEditsRefusal(page, edits as SectionEdit[]) !== null) return null;
	for (const [section, own] of editsBySection(page, edits as SectionEdit[])) {
		const document = await sectionDocument(services, projectId, section);
		const { section: after, report } = applySectionEdits(document, own);
		const refusal = sectionEditsRefusal(report, SPEC_PAGES[page].name) ?? (await sectionGuardsRefusal(services, projectId, page, section, after));
		if (refusal) return refusal;
	}
	return null;
}

export interface SectionDraftReading {
	readonly id: string;
	readonly page: SpecPage;
	/** The name the spec gives the page. */
	readonly pageName: string;
	readonly summary: string;
	readonly sourceIds: readonly string[];
	readonly editCount: number;
	readonly changes: readonly SectionValueChange[];
	/** Why it no longer applies to the sections as they stand; null while it does. */
	readonly noLongerApplies: string | null;
	readonly landedAt: string | null;
}

/** Each change, its values before and after, read against the sections as they stand now. */
export async function readSectionDrafts(services: AppServices, projectId: string, request: Pick<EvolutionRequest, 'sectionDrafts'>): Promise<SectionDraftReading[]> {
	const documents: Partial<Record<DraftableSection, Record<string, unknown>>> = {};
	const documentOf = async (section: DraftableSection) =>
		(documents[section] ??= await sectionDocument(services, projectId, section).catch(() => ({})));
	const readings: SectionDraftReading[] = [];
	for (const draft of request.sectionDrafts ?? []) {
		const bySection = editsBySection(draft.page, draft.edits);
		const sections: Partial<Record<DraftableSection, unknown>> = {};
		let noLongerApplies: string | null = null;
		for (const [section, own] of bySection) {
			sections[section] = await documentOf(section);
			if (draft.materialisedAt === null && noLongerApplies === null)
				noLongerApplies = sectionEditsRefusal(applySectionEdits(sections[section], own).report, SPEC_PAGES[draft.page].name);
		}
		readings.push({
			id: draft.id,
			page: draft.page,
			pageName: SPEC_PAGES[draft.page].name,
			summary: draft.summary,
			sourceIds: draft.sourceIds,
			editCount: draft.edits.length,
			changes: sectionDraftChanges(sections, draft.page, draft.edits, pageValueLabel),
			noLongerApplies,
			landedAt: draft.materialisedAt
		});
	}
	return readings;
}

/** One section the landing writes, every change of the request already laid on it. */
export interface SectionLanding {
	readonly section: DraftableSection;
	readonly document: Record<string, unknown>;
	readonly expectedRevision: number;
	readonly pages: readonly string[];
}

async function currentRevision(services: AppServices, projectId: string, section: DraftableSection): Promise<number> {
	return SECTION_REVISION_STORAGE[section] === 'document'
		? services.sectionDocuments.currentRevision(projectId, section)
		: services.draftLock.current(projectId, section);
}

/**
 * The sections a request's landing writes, each with every change of the
 * request laid on it in order, or the sentence that holds the landing: a change
 * a section moved away from, or a section its guards now refuse.
 */
export async function prepareSectionLanding(
	services: AppServices,
	projectId: string,
	request: Pick<EvolutionRequest, 'sectionDrafts'>
): Promise<{ readonly ok: true; readonly landings: SectionLanding[] } | { readonly ok: false; readonly reason: string }> {
	const bySection = new Map<DraftableSection, { draft: SectionDraft; edits: SectionEdit[] }[]>();
	for (const draft of liveSectionDrafts(request.sectionDrafts))
		for (const [section, edits] of editsBySection(draft.page, draft.edits)) bySection.set(section, [...(bySection.get(section) ?? []), { draft, edits }]);
	const landings: SectionLanding[] = [];
	for (const [section, changes] of bySection) {
		const base = await withFoundationLock(services, projectId, section, async () => ({
			expectedRevision: await currentRevision(services, projectId, section),
			document: await sectionDocument(services, projectId, section)
		}));
		const expectedRevision = base.expectedRevision;
		let document = base.document;
		for (const { draft, edits } of changes) {
			const applied = applySectionEdits(document, edits);
			const refusal = sectionEditsRefusal(applied.report, SPEC_PAGES[draft.page].name);
			if (refusal) return { ok: false, reason: `The change "${draft.summary}" (${draft.id}): ${refusal}` };
			document = applied.section;
		}
		const page = changes[0].draft.page;
		const guards = await sectionGuardsRefusal(services, projectId, page, section, document);
		if (guards) return { ok: false, reason: guards };
		landings.push({ section, document, expectedRevision, pages: [...new Set(changes.map((c) => SPEC_PAGES[c.draft.page].name))] });
	}
	return { ok: true, landings };
}

/**
 * Whether a landed change is on its page: laying it again on the page as it
 * stands changes nothing (ac-evo-verd-landed-check).
 */
export async function sectionDraftHolds(services: AppServices, projectId: string, draft: Pick<SectionDraft, 'page' | 'edits'>): Promise<boolean> {
	for (const [section, edits] of editsBySection(draft.page, draft.edits)) {
		const applied = applySectionEdits(await sectionDocument(services, projectId, section), edits);
		if (applied.report.changed.length > 0) return false;
	}
	return true;
}

/** Write what the landing prepared, each section through its own save; the first refusal stops and names the page. */
export async function writeSectionLandings(
	services: AppServices,
	projectId: string,
	landings: readonly SectionLanding[],
	origin: string | null
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
	for (const landing of landings) {
		const { projectId: _ignored, ...body } = landing.document;
		const written = await writeSectionInProcess(services, projectId, SECTION_WRITES[landing.section], body, { expectedRevision: landing.expectedRevision, origin });
		if (!written.ok) return { ok: false, reason: `${landing.pages.join(', ')} could not be written: ${written.reason}` };
	}
	return { ok: true };
}
