import type { ProjectResidueRepositoryPort } from '$application/ports';

/** Where a cached tier keeps its last snapshot between process lifetimes. */
export interface SnapshotStore<T> {
	load(projectId: string): Promise<T | null>;
	save(projectId: string, data: T): Promise<void>;
}

/**
 * A cached tier's snapshot, persisted as one project residue document.
 *
 * The advisor tiers hold their snapshots in memory, so every restart (an update,
 * a crash, a redeploy) served empty badges until a whole background cycle had
 * run again: minutes on a large project, and a chip that vanished for no reason
 * the user could see. Seeding the tier from here on its first read means a
 * restart costs nothing visible; the background refresh still runs and
 * overwrites what it finds. Failures are swallowed by the caller: persistence is
 * a convenience for the badge, never a dependency of the page.
 */
export class ResidueSnapshotStore<T> implements SnapshotStore<T> {
	readonly #section: string;

	constructor(
		private readonly residue: ProjectResidueRepositoryPort,
		name: string
	) {
		this.#section = `cache:${name}`;
	}

	async load(projectId: string): Promise<T | null> {
		return (await this.residue.load(projectId, this.#section)) as T | null;
	}

	async save(projectId: string, data: T): Promise<void> {
		await this.residue.save(projectId, this.#section, data);
	}
}
