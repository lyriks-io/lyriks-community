/**
 * One file per feature id, for a copy of a kernel folder.
 *
 * The kernel addresses features by the `id` INSIDE the file, not by the file
 * name: Unspaghettit names a file after the feature's slug and renames it when
 * the feature is renamed, so a folder can end up holding two files that both
 * claim one id. Reads tolerate that (see `LocalFsBehaviorRepository`), and the
 * reconciliation engine repairs it, but a copy cannot carry both: every writer
 * downstream addresses the file by id, so the twins collapse into one, and
 * whichever the archive happened to write last would silently become the
 * copy's behavior.
 *
 * So the choice is made here, explicitly, by the same rule the reader uses: the
 * id-named file is authoritative, otherwise the first the folder listed. The
 * copy then carries what the source install was actually serving.
 */

import { FEATURE_SUFFIX } from '$lib/unspa-schema';
import type { KernelFeature } from '$domain/portability';

/** A feature file as the kernel folder reader hands it over. */
export interface KernelFeatureFile extends KernelFeature {
	/** Basename inside the kernel folder, e.g. `feat-login.feature.json`. */
	readonly fileName: string;
}

export interface ChosenKernelFeatures {
	/** Exactly one entry per id, in the order the ids were first seen. */
	readonly features: readonly KernelFeature[];
	/**
	 * The files that lost, as `<fileName> (<id>)`. Never silent: the caller
	 * reports these so the operator learns the kernel folder has drifted.
	 */
	readonly droppedTwins: readonly string[];
}

export function chooseKernelFeatures(files: readonly KernelFeatureFile[]): ChosenKernelFeatures {
	const winners = new Map<string, KernelFeatureFile>();
	const droppedTwins: string[] = [];

	for (const file of files) {
		const held = winners.get(file.id);
		if (!held) {
			winners.set(file.id, file);
			continue;
		}
		// Same id twice: the id-named file wins, anything else keeps the incumbent.
		const loser = isIdNamed(file) && !isIdNamed(held) ? held : file;
		if (loser === held) winners.set(file.id, file);
		droppedTwins.push(`${loser.fileName} (${loser.id})`);
	}

	return {
		features: [...winners.values()].map(({ id, feature }) => ({ id, feature })),
		droppedTwins
	};
}

function isIdNamed(file: KernelFeatureFile): boolean {
	return file.fileName === `${file.id}${FEATURE_SUFFIX}`;
}
