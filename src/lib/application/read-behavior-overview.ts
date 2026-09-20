import type { BehaviorPort, FeatureMaturityScorerPort } from './ports';
import { summarizeBehavior, type BehaviorOverview } from './summarize-behavior';

/**
 * Read a project's whole behavior and fold it into the overview.
 *
 * `summarizeBehavior` is deliberately pure and takes snapshots already in hand, so
 * every caller that only wants the reading had to repeat this walk. A caller that
 * also needs the snapshots themselves (to index actions or rules) still reads them
 * once and folds them itself; this is for the callers that do not.
 *
 * A feature whose snapshot cannot be read is carried as null rather than failing
 * the whole read: an unreadable feature is a feature with nothing authored, which
 * is what the overview already says about one that has no shell.
 */
export async function readBehaviorOverview(
	behavior: Pick<BehaviorPort, 'readProject' | 'readFeature'>,
	maturityScorer: FeatureMaturityScorerPort,
	projectId: string
): Promise<BehaviorOverview> {
	const project = await behavior.readProject(projectId);
	const featureIds = project?.project.featureIds ?? [];
	const featureSnapshots = await Promise.all(
		featureIds.map(async (featureId) => ({
			featureId,
			snapshot: await behavior.readFeature(projectId, featureId).catch(() => null)
		}))
	);
	return summarizeBehavior(project, featureSnapshots, maturityScorer);
}
