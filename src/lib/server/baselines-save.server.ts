import { error } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { SectionDraftSaveOptions } from '$application/ports';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { applyBaselineEdits, type ProjectBaselinesDraft } from '$domain/baselines';
import { validationBaselineIds } from '$domain/retrospec';

/** Said in the answer when the write sent snapshot fields: they are never authored, so they were not kept. */
const SNAPSHOT_IGNORED_NOTE = 'Only the name and the note of a baseline are written: its captured scores, date and document were kept as captured.';

/**
 * The list of baselines as one write saves it: the stored baselines as they
 * were captured, renamed and annotated as sent, the ones left out deleted. A
 * baseline nobody captured is refused, and so is the deletion of a baseline a
 * validation of the specification stands on.
 */
export async function saveBaselineEdits(services: AppServices, projectId: string, draft: ProjectBaselinesDraft, save: SectionDraftSaveOptions) {
	const [stored, { doc }] = await Promise.all([
		services.loadBaselinesDraft.execute(projectId),
		loadRetrospecDocument(services.sectionDocuments, projectId)
	]);
	const outcome = applyBaselineEdits(stored.baselines, draft.baselines, validationBaselineIds(doc));
	if (!outcome.ok) error(400, outcome.reason);
	const result = await services.saveBaselinesDraft.execute({ ...draft, baselines: outcome.baselines }, save);
	if (result === null) return null;
	return outcome.snapshotIgnored ? { ...result, note: SNAPSHOT_IGNORED_NOTE } : result;
}
