import { getServices } from '$composition/container.server';
import { publishSectionChange } from '$lib/server/sync-bus.server';
import type { ProjectFeaturesDraft } from '$domain/features';

const SECTION = 'features';

/**
 * Persist a SERVER-COMPOSED features draft (reconcile, roadmap batch) with the
 * same legacy save protocol `saveSectionDraft` runs for a client body:
 * unconditional revision bump, kernel+residue write with rollback
 * compensation, then the section-change notify that refreshes open tabs. The
 * bump is unconditional because the server just loaded the current draft; the
 * optimistic lock exists to catch stale CLIENT edits, not this read-modify-
 * write, whose window is the call itself.
 */
export async function persistFeaturesDraft(draft: ProjectFeaturesDraft): Promise<void> {
	const services = getServices();
	const revision = await services.draftLock.commit(draft.projectId, SECTION, null);
	try {
		await services.saveFeaturesDraft.execute(draft);
	} catch (e) {
		if (revision !== null) {
			await services.draftLock
				.rollback(draft.projectId, SECTION, revision)
				.catch((re) =>
					console.warn(
						'[features] server-write revision rollback failed:',
						re instanceof Error ? re.message : re
					)
				);
		}
		throw e;
	}
	publishSectionChange({ projectId: draft.projectId, section: SECTION, origin: null });
}
