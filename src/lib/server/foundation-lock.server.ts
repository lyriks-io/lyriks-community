import type { AppServices } from '$composition/container.server';

/** All Foundation slices overlap the public whole-document write. */
export const isFoundationSection = (section: string): boolean =>
	section === 'foundation' || section.startsWith('foundation.');

/** Held through reads, revision comparison and persistence, across processes. */
export function withFoundationLock<T>(
	services: AppServices,
	projectId: string,
	section: string,
	run: () => Promise<T>
): Promise<T> {
	return isFoundationSection(section)
		? services.foundationWrites.withLock(`foundation:${projectId}`, run)
		: run();
}
