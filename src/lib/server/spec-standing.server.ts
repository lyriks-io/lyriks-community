import type { AppServices } from '$composition/container.server';
import type { SpecStanding } from '$lib/shared/app-chrome';
import type { SpecValidationRead } from './spec-validation.server';

/**
 * The version line under the Specification 360° track of the navigation
 * (criterion 8e942b12): the version the team validated, when the code was last
 * checked against it and how many elements were changed by hand since the last
 * retrospecification. Read off the validation board the app chrome already
 * reads for the project's tabs; the code coverage is the cached reading, and
 * only once the specification is validated, so a draft never wakes the engine.
 */
export async function readSpecStanding(services: AppServices, projectId: string, read: SpecValidationRead): Promise<SpecStanding> {
	const version = read.board.summary.version?.label ?? null;
	const coverage = version ? await services.implementationCoverage.get(projectId).catch(() => ({})) : {};
	return {
		version,
		checkedAt: lastCodeCheck(Object.values(coverage)),
		// Counted beside the version line of Knowledge's band (criterion 956cb2ac).
		changedByHand: Object.keys(read.doc.specEdits ?? {}).length
	};
}

/** The latest time a feature's code was synced, null when none ever was. */
function lastCodeCheck(features: readonly { readonly updatedAt?: string | null }[]): string | null {
	return features.reduce<string | null>((max, f) => (f.updatedAt && (!max || f.updatedAt > max) ? f.updatedAt : max), null);
}
