import type { DraftLockPort } from '$application/ports';

/** A section a batch is about to save, and the revision it read it at. */
export interface SectionToClaim {
	readonly section: string;
	readonly readAt: number;
}

/** The sections a batch holds, between the moment it checked them and the moment it saved them. */
export interface SectionClaims {
	/** Save one claimed section and tell the pages showing it. A failure gives back every revision not landed yet. */
	land(section: string, save: () => Promise<unknown>): Promise<void>;
	/** Give back what has not landed: the batch stopped before reaching it. */
	release(): Promise<void>;
}

export type ClaimOutcome =
	| { readonly ok: true; readonly claims: SectionClaims }
	| { readonly ok: false; readonly section: string };

type Publish = (change: { projectId: string; section: string; origin: string | null }) => void;

/**
 * Reserve, before anything is written, the revision of every section a batch
 * saves (criterion d9c67477). Several sections cannot share a transaction, since
 * some of them live in the behavior store, so the batch is refused while nothing
 * has moved yet. A section someone saved since the batch read it gives back what
 * was reserved and is named to the caller.
 */
export async function claimSections(
	locks: DraftLockPort,
	publish: Publish,
	projectId: string,
	origin: string | null,
	wanted: readonly SectionToClaim[]
): Promise<ClaimOutcome> {
	const pending = new Map<string, number>();
	const release = async (): Promise<void> => {
		const held = [...pending];
		pending.clear();
		await Promise.all(held.map(([section, revision]) => locks.rollback(projectId, section, revision).catch(() => {})));
	};
	for (const { section, readAt } of wanted) {
		const revision = await locks.commit(projectId, section, readAt);
		if (revision === null) {
			await release();
			return { ok: false, section };
		}
		pending.set(section, revision);
	}
	const land = async (section: string, save: () => Promise<unknown>): Promise<void> => {
		if (!pending.has(section)) throw new Error(`The section "${section}" was not claimed before it was saved.`);
		try {
			await save();
		} catch (e) {
			await release();
			throw e;
		}
		pending.delete(section);
		publish({ projectId, section, origin });
	};
	return { ok: true, claims: { land, release } };
}
