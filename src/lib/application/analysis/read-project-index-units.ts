import { featureIndexUnits, type FeatureIndexUnits } from '$domain/implementation';
import type { BehaviorPort } from '../ports';

/** The index keys of every feature of a project, grouped into the units a sync carries. */
export interface ProjectIndexUnits {
	readonly features: readonly FeatureIndexUnits[];
	/** Each feature as the kernel holds it, by id. */
	readonly snapshots: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
	/** Features the project lists that could not be read: their keys would otherwise read as orphans. */
	readonly unread: readonly string[];
}

/**
 * Read the features of a project once and group their index keys. The kernel
 * store is the one the engine resolves a sync against, read here directly so
 * that a lookup does not cost one engine call per feature.
 */
export async function readProjectIndexUnits(
	behavior: Pick<BehaviorPort, 'readProject' | 'readFeature'>,
	projectId: string
): Promise<ProjectIndexUnits> {
	const project = await behavior.readProject(projectId);
	const featureIds = project?.project.featureIds ?? [];
	const read = await Promise.all(
		featureIds.map(async (featureId) => ({
			featureId,
			// Absent is a feature with nothing authored; a failed read is a feature whose keys are unknown.
			snapshot: await behavior.readFeature(projectId, featureId).catch(() => undefined)
		}))
	);
	const snapshots = new Map<string, Readonly<Record<string, unknown>>>();
	const unread: string[] = [];
	for (const { featureId, snapshot } of read) {
		if (snapshot === undefined) unread.push(featureId);
		else if (snapshot?.feature) snapshots.set(featureId, snapshot.feature);
	}
	return {
		features: [...snapshots].map(([featureId, feature]) => ({ ...featureIndexUnits(feature), featureId })),
		snapshots,
		unread
	};
}
