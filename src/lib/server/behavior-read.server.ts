import type { AppServices } from '$composition/container.server';
import {
	summarizeBehavior,
	EMPTY_BEHAVIOR_TOTALS,
	type BehaviorOverview
} from '$application/specification/summarize-behavior';
import { indexFeatureActions, type FeatureActionIndex } from '$application/specification/index-feature-actions';
import { indexFeatureRules, type KernelRulesReadModel } from '$application/specification/index-feature-rules';
import type { BehaviorFold, BehaviorReading } from '$application/specification/behavior-reading';

/*
 * Shared by the Features page (the tree, its stats and rules) and the Evolution
 * page's Roadmap tab (the actions each scheduled feature holds).
 */

const EMPTY_OVERVIEW: BehaviorOverview = {
	hasProject: false,
	features: [],
	shared: [],
	totals: { ...EMPTY_BEHAVIOR_TOTALS },
	attention: { unauthored: 0, overCap: 0 }
};

const EMPTY_KERNEL_RULES: KernelRulesReadModel = { groups: [], total: 0, missingDescription: 0 };

/**
 * Read-only behavior read models folded from the canonical kernel, in ONE pass
 * over the snapshots: the overview (was the Functional page) and the per-feature
 * action list the tree shows under each leaf.
 *
 * The fold writes every rule of every feature in words, the costliest part of a
 * specification page, so it is done once per state of the spec.
 */
export async function readBehavior(services: AppServices, projectId: string): Promise<BehaviorReading> {
	try {
		const { reading } = await services.behaviorReadings.read(projectId, () => foldBehavior(services, projectId), {
			keep: (fold) => fold.whole
		});
		return reading;
	} catch (err) {
		console.warn('[features] behavior unavailable:', err);
		return { overview: EMPTY_OVERVIEW, actions: {}, kernelRules: EMPTY_KERNEL_RULES, writtenAt: {} };
	}
}

async function foldBehavior(services: AppServices, projectId: string): Promise<BehaviorFold> {
	const behavior = services.behaviorPort;
	const [project, specLanguage] = await Promise.all([
		behavior.readProject(projectId),
		// Only the generated language is needed: the declaration alone, no prose read.
		services.loadSpecLanguage.generated(projectId)
	]);
	const featureIds = project?.project.featureIds ?? [];
	let whole = true;
	const featureSnapshots = await Promise.all(
		featureIds.map(async (featureId) => ({
			featureId,
			snapshot: await behavior.readFeature(projectId, featureId).catch(() => {
				whole = false;
				return null;
			})
		}))
	);
	return {
		reading: {
			overview: summarizeBehavior(project, featureSnapshots, services.maturityScorer),
			actions: indexFeatureActions(featureSnapshots),
			// Every rule reads in the language the spec is written in.
			kernelRules: indexFeatureRules(project, featureSnapshots, specLanguage),
			writtenAt: writtenAtOf(featureSnapshots)
		},
		whole
	};
}

function writtenAtOf(snapshots: readonly { featureId: string; snapshot: { feature: Record<string, unknown> } | null }[]): Record<string, string> {
	const at: Record<string, string> = {};
	for (const { featureId, snapshot } of snapshots) {
		const updated = snapshot?.feature.updatedAt;
		if (typeof updated === 'string' && updated) at[featureId] = updated;
	}
	return at;
}
