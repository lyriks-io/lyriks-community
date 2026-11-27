import type { AppServices } from '$composition/container.server';
import { applySectionEdits, sectionEditsIssue, sectionEditsRefusal, type SectionEdit } from '$domain/evolution';
import {
	appendedElements,
	currentRun,
	isBehaviorWrite,
	writingProgress,
	writtenAnchors,
	type ChangeWrite,
	type CreatedElement,
	type PersonRef,
	type ReportedChangeInput,
	type RetrospecAct,
	type RetrospecRun,
	type RetrospecWriteSection,
	type SectionWrite
} from '$domain/retrospec';
import { loadRetrospecDocument, saveRetrospecActs } from '$application/retrospec/retrospec-store';
import { dataModelFeatureId, experienceFeatureId } from '$application/projection/aux-feature-ids';
import { SECTION_REVISION_STORAGE } from '$lib/shared/sections';
import { behaviorWritten } from './behavior-written.server';
import { featureIdCollisions } from './behavior-feature-access.server';
import { withFoundationLock } from './foundation-lock.server';
import { writeSectionInProcess } from './section-save.server';
import { RETROSPEC_SECTION_WRITES, loadRetrospecWriteSection } from './section-write-specs.server';

/**
 * Lyriks writes what a person validated on Mismatch itself (feat-120, point 214):
 * the writes the run's AI prepared are checked against the specification when
 * the AI reports them (rule 911113ef of feat-145) and again before any of them
 * is written (rule c9c94526), then written change by change through each
 * section's own guards and save and through the behaviour engine. The AI never
 * writes during the run (rule 35bf88ae), so nothing but the validated changes
 * enters the specification.
 */

/** Lyriks itself, as the history names it when it writes. */
const LYRIKS: PersonRef = { id: 'lyriks', name: 'Lyriks' };

const messageOf = (e: unknown): string =>
	e && typeof e === 'object' && 'body' in e && typeof (e as { body?: { message?: unknown } }).body?.message === 'string'
		? (e as { body: { message: string } }).body.message
		: e instanceof Error
			? e.message
			: String(e);

/** Disabling stamps the person who asked; a write Lyriks makes for nobody's click removes instead. */
const DISABLING = new Set(['disable_element', 'enable_element']);

async function featureRefusal(services: AppServices, projectId: string, featureId: string, operations: readonly Readonly<Record<string, unknown>>[]): Promise<string | null> {
	const own = featureId === experienceFeatureId(projectId) || featureId === dataModelFeatureId(projectId) || (await services.loadFeaturesDraft.execute(projectId)).features.some((f) => f.id === featureId);
	if (!own) return `the feature ${featureId} is not in this project.`;
	if ((await featureIdCollisions(services, projectId, featureId)).length > 0) return `another project also claims the feature id ${featureId}.`;
	if (operations.some((op) => DISABLING.has(String(op.kind)))) return `${featureId}: a change removes an element rather than disabling it.`;
	return null;
}

async function sectionGuardsRefusal(services: AppServices, projectId: string, section: RetrospecWriteSection, document: Record<string, unknown>): Promise<string | null> {
	const spec = RETROSPEC_SECTION_WRITES[section];
	const body = { ...document, projectId };
	try {
		await spec.validate?.(body, services, projectId);
		spec.parse(body, projectId);
		return null;
	} catch (e) {
		return `the ${section} section would refuse it: ${messageOf(e)}`;
	}
}

/** The section as the write leaves it, or why the write does not apply to it. */
async function laidOn(services: AppServices, projectId: string, write: SectionWrite, document: unknown): Promise<{ readonly ok: true; readonly section: Record<string, unknown> } | { readonly ok: false; readonly reason: string }> {
	const edits = write.edits as unknown as SectionEdit[];
	const issue = sectionEditsIssue(edits);
	if (issue) return { ok: false, reason: `${write.section}: ${issue}` };
	const applied = applySectionEdits(document, edits);
	const refusal = sectionEditsRefusal(applied.report, `the ${write.section} section`) ?? (await sectionGuardsRefusal(services, projectId, write.section, applied.section));
	return refusal ? { ok: false, reason: refusal } : { ok: true, section: applied.section };
}

/**
 * Why writes would not apply to the specification as it stands, laid one after
 * the other as they would be written (a section edit sees the edits before it),
 * or null. Saves nothing: behaviour batches are dry runs of the engine.
 */
async function writesRefusal(services: AppServices, projectId: string, writes: readonly ChangeWrite[], sections: Map<RetrospecWriteSection, Record<string, unknown>>): Promise<string | null> {
	for (const write of writes) {
		if (isBehaviorWrite(write)) {
			const refusal = await featureRefusal(services, projectId, write.featureId, write.operations);
			if (refusal) return refusal;
			const { available, batch } = await services.authorBehavior.execute({ projectId, featureId: write.featureId, operations: write.operations as Record<string, unknown>[], dryRun: true });
			if (!available) return 'the behaviour engine did not answer.';
			if (!batch?.ok) return `${write.featureId}: ${batch?.errors[0] ?? 'the behaviour engine refused the batch.'}`;
			continue;
		}
		const document = sections.get(write.section) ?? ((await loadRetrospecWriteSection(services, write.section, projectId)) as Record<string, unknown>);
		const laid = await laidOn(services, projectId, write, document);
		if (!laid.ok) return laid.reason;
		sections.set(write.section, laid.section);
	}
	return null;
}

/** Why a reported change could not be written as it is (rule 911113ef of feat-145), or null: the whole report is refused then. */
export async function reportedChangesRefusal(services: AppServices, projectId: string, changes: readonly ReportedChangeInput[]): Promise<string | null> {
	const sections = new Map<RetrospecWriteSection, Record<string, unknown>>();
	for (const change of changes) {
		const refusal = await writesRefusal(services, projectId, change.writes, sections);
		if (refusal) return `The change ${change.id} cannot be written as it is: ${refusal}`;
	}
	return null;
}

/**
 * Why the validated changes left to write no longer apply, checked before any
 * is written (rule c9c94526): a change written by half would be worse than none.
 */
export async function validatedChangesRefusal(services: AppServices, projectId: string, run: RetrospecRun): Promise<string | null> {
	const sections = new Map<RetrospecWriteSection, Record<string, unknown>>();
	for (const change of writingProgress(run).validated) {
		const done = run.written?.[change.id] ?? 0;
		const refusal = change.writes.length === 0 ? 'it carries no writes.' : await writesRefusal(services, projectId, change.writes.slice(done), sections);
		if (refusal) return `The change “${change.title}” no longer applies to the specification: ${refusal} Reject it so your AI reports it again, or revert it.`;
	}
	return null;
}

/** What a batch created, as the engine names it (newer engines only). */
function createdOf(batch: unknown): CreatedElement[] {
	const b = (batch ?? {}) as { created?: unknown; raw?: { created?: unknown } };
	const rows = Array.isArray(b.created) ? b.created : Array.isArray(b.raw?.created) ? b.raw.created : [];
	return rows.flatMap((r: unknown) => {
		const row = (r ?? {}) as { kind?: unknown; id?: unknown };
		return typeof row.kind === 'string' && typeof row.id === 'string' ? [{ kind: row.kind, id: row.id }] : [];
	});
}

type WriteOutcome = { readonly ok: true; readonly created: readonly { readonly featureId: string | null; readonly element: CreatedElement }[] } | { readonly ok: false; readonly reason: string };

async function currentRevision(services: AppServices, projectId: string, section: RetrospecWriteSection): Promise<number> {
	return SECTION_REVISION_STORAGE[section] === 'document' ? services.sectionDocuments.currentRevision(projectId, section) : services.draftLock.current(projectId, section);
}

/** One write, saved: a section through its own guards and save, a batch through the behaviour engine. */
async function applyWrite(services: AppServices, projectId: string, write: ChangeWrite, origin: string | null): Promise<WriteOutcome> {
	if (isBehaviorWrite(write)) {
		const refusal = await featureRefusal(services, projectId, write.featureId, write.operations);
		if (refusal) return { ok: false, reason: refusal };
		const { available, batch } = await services.authorBehavior.execute({ projectId, featureId: write.featureId, operations: write.operations as Record<string, unknown>[] });
		if (!available) return { ok: false, reason: 'the behaviour engine did not answer. Read the feature before you start the writing again: the batch may have landed.' };
		if (!batch?.ok) return { ok: false, reason: `${write.featureId}: ${batch?.errors[0] ?? 'the behaviour engine refused the batch.'}` };
		behaviorWritten(services, projectId, write.featureId, LYRIKS);
		return { ok: true, created: createdOf(batch).map((element) => ({ featureId: write.featureId, element })) };
	}
	const base = await withFoundationLock(services, projectId, write.section, async () => ({
		expectedRevision: await currentRevision(services, projectId, write.section),
		document: await loadRetrospecWriteSection(services, write.section, projectId)
	}));
	const laid = await laidOn(services, projectId, write, base.document);
	if (!laid.ok) return laid;
	const { projectId: _ignored, ...body } = laid.section;
	const written = await writeSectionInProcess(services, projectId, RETROSPEC_SECTION_WRITES[write.section], body, { expectedRevision: base.expectedRevision, origin });
	if (!written.ok) return { ok: false, reason: `the ${write.section} section could not be written: ${written.reason}` };
	return { ok: true, created: appendedElements(write).map((element) => ({ featureId: null, element })) };
}

async function record(services: AppServices, projectId: string, act: RetrospecAct, origin: string | null): Promise<boolean> {
	const saved = await saveRetrospecActs(services.sectionDocuments, projectId, [act], { actor: LYRIKS, now: new Date().toISOString() }, origin);
	if (!saved.ok) console.warn(`[retrospec] the writing could not record ${act.op}: ${saved.reason}`);
	return saved.ok;
}

/**
 * Write every validated change not written yet, in the order of the report, and
 * record each write as it lands, so a writing started again never writes one
 * twice. The first refusal stops the writing at its change (rule a91a8dac).
 */
async function writeValidatedChanges(services: AppServices, projectId: string, origin: string | null): Promise<void> {
	for (;;) {
		const run = currentRun((await loadRetrospecDocument(services.sectionDocuments, projectId)).doc);
		if (!run?.writingOpenedAt || run.publishedAt) return;
		const next = writingProgress(run).next;
		if (!next) return;
		const { change, done } = next;
		if (change.writes.length === 0) {
			await record(services, projectId, { op: 'record_write_stop', change: change.id, reason: 'it carries no writes: it was reported before Lyriks wrote what a person validates.' }, origin);
			return;
		}
		const created: { featureId: string | null; element: CreatedElement }[] = [];
		for (let index = done; index < change.writes.length; index++) {
			const outcome = await applyWrite(services, projectId, change.writes[index], origin).catch((e): WriteOutcome => ({ ok: false, reason: messageOf(e) }));
			if (!outcome.ok) {
				await record(services, projectId, { op: 'record_write_stop', change: change.id, reason: outcome.reason }, origin);
				return;
			}
			created.push(...outcome.created);
			const whole = index + 1 === change.writes.length;
			const elements = whole ? writtenAnchors(change, created) : [];
			if (!(await record(services, projectId, { op: 'record_writes', change: change.id, done: index + 1, elements }, origin))) return;
		}
	}
}

/** The projects Lyriks is writing for now: one writing at a time (rule 47964da1). */
const writing = new Set<string>();

export const writingUnderWay = (projectId: string): boolean => writing.has(projectId);

/** Start writing in the background; false when a writing is already under way on the project. */
export function startWriting(services: AppServices, projectId: string, origin: string | null): boolean {
	if (writing.has(projectId)) return false;
	writing.add(projectId);
	void writeValidatedChanges(services, projectId, origin)
		.catch((err) => console.warn('[retrospec] the writing stopped:', err))
		.finally(() => writing.delete(projectId));
	return true;
}
