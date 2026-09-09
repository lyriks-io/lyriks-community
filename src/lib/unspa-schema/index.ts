/**
 * Shared schema for Unspaghettit-format JSON snapshots. Matches the on-disk
 * shape Unspaghettit OSS reads/writes (see `Unspaghettit/src/shared/infrastructure/persistence/snapshotLayout.ts`).
 * Treat this as a wire contract: any Lyriks-side write must roundtrip cleanly
 * through `unspa dashboard`.
 */

export const UNSPA_PROJECT_FORMAT = 'unspaghettit-project' as const;
export const UNSPA_FEATURE_FORMAT = 'unspaghettit' as const;
export const UNSPA_VERSION = 1 as const;

export const PROJECT_SUFFIX = '.project.json';
export const FEATURE_SUFFIX = '.feature.json';

export interface UnspaTag {
	type: string;
	value: string;
}

export interface UnspaProject {
	id: string;
	name: string;
	description: string;
	tags: UnspaTag[];
	featureIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface UnspaProjectSnapshot {
	format: typeof UNSPA_PROJECT_FORMAT;
	version: typeof UNSPA_VERSION;
	project: UnspaProject;
}

export interface UnspaFeatureSnapshot {
	format: typeof UNSPA_FEATURE_FORMAT;
	version: typeof UNSPA_VERSION;
	feature: Record<string, unknown>;
}
