import type { AppServices } from '$composition/container.server';
import { requestKeyOf, requestsClosedBetween, withClosingBaselines, type ProjectEvolutionDraft } from '$domain/evolution';

/** Writing the captured ids back loses no race to a dossier write made meanwhile: it is read again each time. */
const ATTEMPTS = 4;

/**
 * Capture a baseline of the specification for every request a batch of
 * operations closed, once what the close lands is saved, and keep its id on
 * the request: the Specification 360° moves one version per evolution closed.
 */
export async function captureClosingBaselines(
	services: AppServices,
	input: { readonly projectId: string; readonly before: ProjectEvolutionDraft; readonly after: ProjectEvolutionDraft; readonly origin: string | null }
): Promise<void> {
	const closed = requestsClosedBetween(input.before.requests, input.after.requests);
	if (closed.length === 0) return;
	const captured: Record<string, string> = {};
	for (const id of closed) {
		const request = input.after.requests.find((r) => r.id === id);
		const key = requestKeyOf(input.after.requests, id) ?? 'Evolution';
		const title = request?.title.trim() || 'Untitled request';
		const baseline = await services.captureBaseline.execute(
			input.projectId,
			`${key} closed`,
			`${key} · ${title} closed in Lyriks: the specification as the change left it.`,
			{ expectedRevision: null, origin: input.origin }
		);
		const baselineId = baseline?.draft.baselines[0]?.id;
		if (baselineId) captured[id] = baselineId;
	}
	if (Object.keys(captured).length === 0) return;
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const [draft, revision] = await Promise.all([
			services.loadEvolutionDraft.execute(input.projectId),
			services.sectionDocuments.currentRevision(input.projectId, 'evolution')
		]);
		const saved = await services.saveEvolutionDraft.execute(
			{ ...draft, requests: withClosingBaselines(draft.requests, captured) },
			{ expectedRevision: revision, origin: input.origin }
		);
		if (saved) return;
	}
	console.warn(`[evolution] the closing baseline of ${Object.keys(captured).join(', ')} could not be recorded on the request.`);
}
