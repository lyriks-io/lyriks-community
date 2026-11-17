import { sortByName } from '$domain/shared';
import { anchorOf, type DiscussionThread } from '$domain/discussions';
import { actionOfActionCapability } from '$domain/users';
import type { FeatureActionView } from './features';
import type { MatrixGroup, MatrixRow } from './users';

/**
 * What one user can reach, read from the product's tree down (criterion
 * 1ca9b3b4): its core features, then the features of one, then the actions of
 * one feature. A core feature or a feature is accessible when the user can
 * perform any of its actions, the rights being decided at the action
 * (feat-access-matrix e200147e). Only what declares an action is listed: a
 * feature without one holds no right anyone could be given. Pure.
 */

/** The product's tree as the navigation reads it (the spec outline). */
export interface ReachOutlineCore {
	readonly id: string;
	readonly name: string;
	readonly features: readonly { readonly id: string; readonly name: string }[];
}

export interface ReachFeature {
	readonly id: string;
	readonly name: string;
	readonly rows: readonly MatrixRow[];
}

export interface ReachCore {
	readonly id: string;
	readonly name: string;
	/** Its features that declare an action, in the spec's order. */
	readonly features: readonly ReachFeature[];
	/** The names of its features that declare none. */
	readonly silent: readonly string[];
}

/** The core feature that gathers the features whose own core feature the outline does not hold. */
export const OTHER_CORE_ID = '~other';

/** "Core feature · Feature": the feature's own name is the last part. */
const featureNameOf = (heading: string) => heading.split(' · ').at(-1)?.trim() || heading;

export function reachTree(cores: readonly ReachOutlineCore[], groups: readonly MatrixGroup[]): ReachCore[] {
	const rowsOf = new Map(groups.map((g) => [g.featureId, g.rows]));
	const placed = new Set<string>();
	const tree: ReachCore[] = cores.map((core) => {
		const features: ReachFeature[] = [];
		const silent: string[] = [];
		for (const f of core.features) {
			placed.add(f.id);
			const rows = rowsOf.get(f.id) ?? [];
			if (rows.length > 0) features.push({ id: f.id, name: f.name, rows });
			else silent.push(f.name);
		}
		return { id: core.id, name: core.name, features, silent };
	});
	const strays = groups.filter((g) => !placed.has(g.featureId) && g.rows.length > 0);
	if (strays.length > 0)
		tree.push({ id: OTHER_CORE_ID, name: 'Other features', features: sortByName(strays.map((g) => ({ id: g.featureId, name: featureNameOf(g.heading), rows: g.rows }))), silent: [] });
	return tree;
}

/** One row of a level: open when the user reaches any of it; `reached` of `total` features (a core feature) or actions (a feature). */
export interface ReachEntry {
	readonly id: string;
	readonly name: string;
	readonly open: boolean;
	readonly reached: number;
	readonly total: number;
}

type Holds = (row: MatrixRow) => boolean;

/** The first level: every core feature with an action, counted in features. */
export function coreEntries(tree: readonly ReachCore[], holds: Holds): ReachEntry[] {
	return tree
		.filter((c) => c.features.length > 0)
		.map((c) => {
			const reached = c.features.filter((f) => f.rows.some(holds)).length;
			return { id: c.id, name: c.name, open: reached > 0, reached, total: c.features.length };
		});
}

/** The second level: the features of one core feature, counted in actions. */
export function featureEntries(core: ReachCore, holds: Holds): ReachEntry[] {
	return core.features.map((f) => {
		const reached = f.rows.filter(holds).length;
		return { id: f.id, name: f.name, open: reached > 0, reached, total: f.rows.length };
	});
}

/** The core features that declare no action at all: named under the first level's columns. */
export function silentCores(tree: readonly ReachCore[]): string[] {
	return tree.filter((c) => c.features.length === 0).map((c) => c.name);
}

/** "3 of 9 features" on an accessible row, "13 features" on one the user cannot enter. */
export function entryMeta(entry: ReachEntry, unit: 'feature' | 'action'): string {
	const units = `${entry.total} ${entry.total === 1 ? unit : `${unit}s`}`;
	return entry.open ? `${entry.reached} of ${units}` : units;
}

export interface ReachLevel {
	readonly core: ReachCore | null;
	readonly feature: ReachFeature | null;
}

/**
 * The level the page's address names (?core=<id>&feature=<id>): a feature
 * named alone still finds its core feature; an id the tree does not hold
 * reads one level up.
 */
export function reachLevel(tree: readonly ReachCore[], coreId: string | null, featureId: string | null): ReachLevel {
	const owner = featureId ? tree.find((c) => c.features.some((f) => f.id === featureId)) : undefined;
	const core = (coreId ? tree.find((c) => c.id === coreId) : undefined) ?? owner ?? null;
	const feature = core && featureId ? (core.features.find((f) => f.id === featureId) ?? null) : null;
	return { core, feature };
}

/**
 * The action the page's address names inside the feature opened
 * (&action=<id>, criterion 6dd2906e), or null: an action the feature does not
 * hold reads one level up, the feature's actions.
 */
export function reachAction(feature: ReachFeature | null, actionId: string | null): MatrixRow | null {
	if (!feature || !actionId) return null;
	return feature.rows.find((r) => actionOfActionCapability(r.capabilityId) === actionId) ?? null;
}

/**
 * What decides who may perform an action (criterion 6dd2906e): its rules of
 * the permissions category, as an action the rule lines read, and how many
 * of its other rules the feature's page holds.
 */
export function whoMayDecide(action: FeatureActionView): { readonly decides: FeatureActionView; readonly others: number } {
	const decides = action.rules.filter((r) => r.category === 'permissions');
	return { decides: { ...action, rules: decides }, others: action.rules.length - decides.length };
}

/** Where an action sits in the tree, so a link to its discussion opens its level. */
export function levelOfAction(tree: readonly ReachCore[], capabilityId: string): { coreId: string; featureId: string } | null {
	for (const core of tree)
		for (const f of core.features) if (f.rows.some((r) => r.capabilityId === capabilityId)) return { coreId: core.id, featureId: f.id };
	return null;
}

/** The anchor of one action discussed for one user, apart from the action's own (criterion ddd20a3e). */
export function userActionAnchor(userId: string, capabilityId: string): string {
	return anchorOf('permissions', userId, capabilityId);
}

/** The action an anchor discusses for this user, or null when it is not one of the user's. */
export function actionOfUserAnchor(anchor: string, userId: string): string | null {
	const prefix = `${anchorOf('permissions', userId)}:`;
	return anchor.startsWith(prefix) && anchor.length > prefix.length ? anchor.slice(prefix.length) : null;
}

/** The topics still open on a user and on its actions: what its page's head counts. */
export function openTopicsOfUser(threads: readonly DiscussionThread[], userId: string): number {
	const own = anchorOf('role', userId);
	return threads.filter((t) => t.state === 'open' && (t.anchor === own || actionOfUserAnchor(t.anchor, userId) !== null)).length;
}
