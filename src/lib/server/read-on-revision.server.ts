import type { AppServices } from '$composition/container.server';

/**
 * A reading of a large section document, taken once per revision of its
 * section and shared by every read path that asks for it until the section
 * moves: the review document and the baselines weigh megabytes on a large
 * project, and the bar, Knowledge and every page of the Specification 360° read
 * them. The revision is asked first (one small query), so a write landing during
 * the load is kept under the older revision and the next read loads again.
 *
 * What is shared must be read only: a write path reads its own fresh copy,
 * since it derives the next document from it. A store that cannot tell its
 * revision is read as before. `purpose` names a reading derived from the
 * section (the latest baseline), kept apart from the whole document.
 */

/** Readings kept for the read paths, per project, section and purpose, under the revision they were read at. */
const kept = new Map<string, { revision: number; read: Promise<unknown> }>();
const KEPT_MAX = 400;

export function readOnRevision<T>(
	services: Pick<AppServices, 'sectionDocuments'>,
	projectId: string,
	section: string,
	load: () => Promise<T>,
	purpose: string = section
): Promise<T> {
	const key = `${projectId}|${section}|${purpose}`;
	return Promise.resolve()
		.then(() => services.sectionDocuments.currentRevision(projectId, section))
		.then(
			(revision) => {
				const hit = kept.get(key);
				if (hit && hit.revision === revision) return hit.read as Promise<T>;
				const read = load();
				if (kept.size >= KEPT_MAX) kept.clear();
				kept.set(key, { revision, read });
				read.catch(() => {
					if (kept.get(key)?.read === read) kept.delete(key);
				});
				return read;
			},
			() => load()
		);
}
