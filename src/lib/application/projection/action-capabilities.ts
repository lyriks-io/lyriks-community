import { actionCapabilityId, type DerivedCapability } from '$domain/users';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

/** One leaf feature, its Core, and the kernel snapshot that holds its actions. */
export interface FeatureActionSource {
	readonly id: string;
	readonly name: string;
	readonly coreId: string;
	readonly coreName: string;
	readonly snapshot: UnspaFeatureSnapshot | null;
}

interface KernelAction {
	id?: unknown;
	name?: unknown;
}

/**
 * Feature rows of the permissions matrix, one per action the feature's
 * behavior declares: a role is granted what it may DO, not a whole feature.
 * A feature that declares no action yet keeps one row of its own, so it can
 * still be granted until it does.
 *
 * Pure and IO-free: the caller hands in the snapshots it already read.
 */
export function featureActionCapabilities(leaves: readonly FeatureActionSource[]): DerivedCapability[] {
	const rows: DerivedCapability[] = [];
	for (const leaf of leaves) {
		const featureLabel = leaf.name || '<unnamed feature>';
		const seen = new Set<string>();
		const surfaces = (leaf.snapshot?.feature as { surfaces?: unknown })?.surfaces;
		for (const surface of Array.isArray(surfaces) ? surfaces : []) {
			const actions = (surface as { actions?: unknown } | null)?.actions;
			for (const action of Array.isArray(actions) ? (actions as KernelAction[]) : []) {
				const id = typeof action?.id === 'string' ? action.id : '';
				if (!id || seen.has(id)) continue;
				seen.add(id);
				rows.push({
					id: actionCapabilityId(leaf.id, id),
					label: typeof action.name === 'string' && action.name ? action.name : id,
					source: 'feature',
					sourceRefId: leaf.coreId,
					sourceRefLabel: leaf.coreName,
					featureId: leaf.id,
					featureLabel
				});
			}
		}
		if (seen.size === 0) {
			rows.push({
				id: leaf.id,
				label: featureLabel,
				source: 'feature',
				sourceRefId: leaf.coreId,
				sourceRefLabel: leaf.coreName,
				featureLabel
			});
		}
	}
	return rows;
}
