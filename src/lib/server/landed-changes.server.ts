import type { AppServices } from '$composition/container.server';
import { landedChanges, type LandedChange } from '$application/spec360/spec-news';

/** Projects whose landed changes are held at once; the least recently read go first. */
const HELD = 200;

/**
 * What landed changes a project's Knowledge marks New with, read once per
 * revision of its Evolution document. The Knowledge layout used to load and
 * parse the whole document (every change request, its reports and versions,
 * megabytes on a project carried through several requests) on every page, for
 * a list of a few ids per request that landed.
 */
export class LandedChangesReader {
	readonly #held = new Map<string, { readonly revision: number; readonly changes: readonly LandedChange[] }>();

	async read(services: Pick<AppServices, 'sectionDocuments' | 'loadEvolutionDraft'>, projectId: string): Promise<readonly LandedChange[]> {
		// The revision first: a write landing meanwhile is read under the older one, so the next page computes again.
		const revision = await services.sectionDocuments.currentRevision(projectId, 'evolution');
		const held = this.#held.get(projectId);
		if (held && held.revision === revision) return held.changes;
		const draft = await services.loadEvolutionDraft.execute(projectId);
		const changes = landedChanges(draft.requests);
		this.#held.delete(projectId);
		this.#held.set(projectId, { revision, changes });
		if (this.#held.size > HELD) this.#held.delete(this.#held.keys().next().value!);
		return changes;
	}
}

const reader = new LandedChangesReader();

/** The project's landed changes, computed again only when its Evolution document moved. */
export const readLandedChanges = (services: AppServices, projectId: string): Promise<readonly LandedChange[]> => reader.read(services, projectId);
