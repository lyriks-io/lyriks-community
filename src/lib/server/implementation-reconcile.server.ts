import { getServices } from '$composition/container.server';
import { persistFeaturesDraft } from '$lib/server/features-write.server';
import type { StatusReconciliation } from '$application/use-cases/reconcile-implementation-statuses';

/**
 * Persisting half of the coverage→status reconciliation: plan the upgrades,
 * and when there are any, persist them through the shared server-write
 * protocol so open Features tabs refresh exactly as they do for an MCP write.
 * No changes → no write, no revision bump.
 */
export async function reconcileImplementationStatuses(
	projectId: string,
	featureIds?: readonly string[]
): Promise<StatusReconciliation[]> {
	const services = getServices();
	const plan = await services.reconcileImplementationStatuses.execute(projectId, { featureIds });
	if (plan.changes.length === 0) return [];
	await persistFeaturesDraft(plan.draft);
	return plan.changes;
}

/**
 * Fire-and-forget trigger for the post-sync hook in the implementation routes.
 * Deliberately not awaited there: reconciling reads the engine once per leaf
 * (serialized on one stdio subprocess), and the sync response must not wait
 * that out. A failure only delays the alignment until the next sync or an
 * explicit reconcile call.
 */
export function scheduleImplementationReconcile(
	projectId: string,
	featureIds?: readonly string[]
): void {
	void reconcileImplementationStatuses(projectId, featureIds).catch((e) =>
		console.warn(
			'[implementation] status reconcile failed:',
			e instanceof Error ? e.message : e
		)
	);
}
