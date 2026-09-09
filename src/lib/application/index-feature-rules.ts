import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { isAuxFeatureId } from './projection/aux-feature-ids';

/**
 * Read-only fold of the canonical kernel into the RULES the project actually
 * enforces — every rule and invariant the engine holds, at every level it holds
 * them: an action's rules and post-conditions, a surface's rules and invariants,
 * a feature invariant, a project invariant. Pure and framework-free (no engine,
 * no network): it only walks the persisted snapshot the `BehaviorPort` read side
 * already returns.
 *
 * These are NOT authored here and never round-trip into the rules residue — the
 * Rules tab shows them read-only and links each group straight to its feature in
 * the behavior editor to edit. (The residue-owned `inventory`/`issues`/edge cases
 * stay a separate, authorable corpus; see `build-rule-inventory` / rules draft.)
 *
 * Borrowed surfaces are skipped on leaves for the same reason `index-feature-
 * actions` skips them: the Core-bridge mirror lends a Core's journey surfaces to
 * every leaf, so their rules belong to the "Experience" aux feature that owns the
 * journey — counting them per leaf would show the same rule under every sibling.
 */

/** Where a rule/invariant lives, so the reader sees exactly what it constrains. */
export interface RuleOrigin {
	kind: 'action' | 'surface' | 'feature' | 'project';
	/** Owning feature; `null` for a project-level invariant. */
	featureId: string | null;
	featureName: string | null;
	/** Raw surface id — feeds the `?surface=` deep-link param. Action/surface only. */
	surfaceId?: string;
	/** Present for action- and surface-level constraints. */
	surfaceName?: string;
	/** Raw action id — feeds the `?focus=action:` deep-link param. Action only. */
	actionId?: string;
	/** Present for action-level constraints. */
	actionName?: string;
}

export interface KernelRule {
	/** Stable across a project — the raw node id repeats across features, so it is
	 *  composed with the owning path. Used for list keys only. */
	id: string;
	/** Raw kernel node id — feeds the `?focus=rule:<id>` deep-link param. */
	nodeId: string;
	kind: 'rule' | 'invariant';
	/** Short human label — a rule's category, an invariant's name. */
	title: string;
	/** Human sentence, never empty: the node's own description, then the best
	 *  available fallback (effect prose, invariant message, or the condition read
	 *  aloud) so a row is never blank. */
	description: string;
	/** Whether the node carried real prose (its own description or an effect/
	 *  message sentence). False means `description` fell back to the raw condition —
	 *  the signal behind the "missing a description" nudge. */
	hasDescription: boolean;
	/** Rules only: whether the rule allows or blocks the action. */
	effect?: 'allow' | 'block';
	/** Rules only: the kernel category tag (permissions, validation, …). */
	category?: string;
	/** Where inside the feature it lives — the action/surface it constrains. */
	origin: RuleOrigin;
}

/** One feature's (or the project's) rules, in the order the tab renders groups. */
export interface KernelRuleGroup {
	/** `null` → the project-level group (links to the project, not a feature). */
	featureId: string | null;
	label: string;
	rules: KernelRule[];
}

export interface KernelRulesReadModel {
	groups: KernelRuleGroup[];
	/** Total rows and how many lack real prose — drives the header count + nudge. */
	total: number;
	missingDescription: number;
}

type Node = Record<string, unknown>;
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const node = (v: unknown): Node => (v ?? {}) as Node;

/** Surface ids the Experience aux feature owns — the ones the mirror lends out. */
function borrowedSurfaceIds(
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>
): Set<string> {
	const ids = new Set<string>();
	for (const { featureId, snapshot } of featureSnapshots) {
		if (!isAuxFeatureId(featureId)) continue;
		for (const surfaceRaw of arr(node(snapshot?.feature).surfaces)) {
			const id = str(node(surfaceRaw).id);
			if (id) ids.add(id);
		}
	}
	return ids;
}

/** Read a condition tree aloud — the last-resort description when a node has no prose. */
function readCondition(condition: unknown): string {
	const c = node(condition);
	const kind = str(c.kind);
	if (kind === 'any' || kind === 'all') {
		const parts = arr(c.conditions).map(readCondition).filter(Boolean);
		if (parts.length === 0) return '';
		return parts.join(kind === 'any' ? ' or ' : ' and ');
	}
	const left = str(c.left);
	if (!left) return '';
	const op = str(c.operator).replace(/_/g, ' ');
	const right = c.right;
	const rightText =
		right === undefined || right === null
			? ''
			: typeof right === 'string'
				? ` ${right}`
				: ` ${String(right)}`;
	return `${left} ${op}${rightText}`.trim();
}

/** Title Case a bare kernel tag like `permissions` for the row label. */
function titleCase(value: string): string {
	return value
		.trim()
		.split(/\s+/)
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');
}

/** Project one kernel rule node (action- or surface-level) into a row. */
function projectRule(raw: Node, origin: RuleOrigin, ownerKey: string): KernelRule {
	const effectNode = node(raw.effect);
	const effect = str(effectNode.type) === 'block_action' ? 'block' : 'allow';
	const category = str(raw.category);
	// The node's own words first, then the effect's prose, then the condition.
	const prose = str(raw.description) || str(effectNode.description) || str(effectNode.reason);
	const hasDescription = prose.trim().length > 0;
	const description = hasDescription ? prose : readCondition(raw.condition) || '(no description)';
	return {
		id: `${ownerKey}:rule:${str(raw.id) || 'anon'}`,
		nodeId: str(raw.id),
		kind: 'rule',
		title: category ? titleCase(category) : 'Rule',
		description,
		hasDescription,
		effect,
		category: category || undefined,
		origin
	};
}

/** Project one kernel invariant node (action-, surface- or feature-level) into a row. */
function projectInvariant(raw: Node, origin: RuleOrigin, ownerKey: string): KernelRule {
	const name = str(raw.name);
	const prose = str(raw.description) || str(raw.message);
	const hasDescription = prose.trim().length > 0;
	const description = hasDescription ? prose : readCondition(raw.condition) || '(no description)';
	return {
		id: `${ownerKey}:inv:${str(raw.id) || 'anon'}`,
		nodeId: str(raw.id),
		kind: 'invariant',
		title: name || 'Invariant',
		description,
		hasDescription,
		origin
	};
}

/** Every rule + invariant a single feature snapshot holds, own surfaces only. */
function rulesOfFeature(
	featureId: string,
	snap: UnspaFeatureSnapshot | null,
	borrowed: Set<string>
): KernelRule[] {
	const feature = node(snap?.feature);
	const featureName = str(feature.name) || featureId;
	const aux = isAuxFeatureId(featureId);
	const rows: KernelRule[] = [];

	for (const surfaceRaw of arr(feature.surfaces)) {
		const surface = node(surfaceRaw);
		const surfaceId = str(surface.id);
		if (!aux && borrowed.has(surfaceId)) continue; // mirrored journey — not this feature's
		const surfaceName = str(surface.name) || surfaceId;

		for (const actionRaw of arr(surface.actions)) {
			const action = node(actionRaw);
			const actionId = str(action.id);
			const actionName = str(action.name) || actionId;
			const origin: RuleOrigin = {
				kind: 'action',
				featureId,
				featureName,
				surfaceId,
				surfaceName,
				actionId,
				actionName
			};
			const key = `${featureId}:${surfaceId}:${actionId}`;
			for (const r of arr(action.rules)) rows.push(projectRule(r, origin, key));
			for (const iv of arr(action.invariants)) rows.push(projectInvariant(iv, origin, key));
		}

		const sOrigin: RuleOrigin = { kind: 'surface', featureId, featureName, surfaceId, surfaceName };
		const sKey = `${featureId}:${surfaceId}`;
		for (const r of arr(surface.rules)) rows.push(projectRule(r, sOrigin, sKey));
		for (const iv of arr(surface.invariants)) rows.push(projectInvariant(iv, sOrigin, sKey));
	}

	const fOrigin: RuleOrigin = { kind: 'feature', featureId, featureName };
	for (const iv of arr(feature.featureInvariants)) {
		rows.push(projectInvariant(iv, fOrigin, `${featureId}:feature`));
	}
	return rows;
}

/**
 * Build the read-only kernel-rules model for the Rules tab: one group per feature
 * (in the project's feature order, aux features last) plus a project-level group,
 * each carrying every rule/invariant the engine holds at or under it.
 */
export function indexFeatureRules(
	project: UnspaProjectSnapshot | null,
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>
): KernelRulesReadModel {
	const borrowed = borrowedSurfaceIds(featureSnapshots);
	const order = project?.project.featureIds ?? featureSnapshots.map((f) => f.featureId);
	const bySnap = new Map(featureSnapshots.map((f) => [f.featureId, f.snapshot]));

	const groups: KernelRuleGroup[] = [];
	// Product leaves first, then the aux "Experience"/"Data Model" shared behavior.
	const ordered = [...order].sort((a, b) => Number(isAuxFeatureId(a)) - Number(isAuxFeatureId(b)));
	for (const featureId of ordered) {
		if (!bySnap.has(featureId)) continue;
		const snap = bySnap.get(featureId) ?? null;
		const rules = rulesOfFeature(featureId, snap, borrowed);
		if (rules.length === 0) continue;
		const label = str(node(snap?.feature).name) || featureId;
		groups.push({ featureId, label, rules });
	}

	// Project-level invariants — their own group, linked to the project (no feature).
	const projectInvariants = arr((project?.project as unknown as Node | undefined)?.invariants).map(
		(iv, i) =>
			projectInvariant(iv, { kind: 'project', featureId: null, featureName: null }, `project:${i}`)
	);
	if (projectInvariants.length > 0) {
		groups.push({ featureId: null, label: 'Project-wide', rules: projectInvariants });
	}

	let total = 0;
	let missingDescription = 0;
	for (const g of groups) {
		for (const r of g.rules) {
			total += 1;
			if (!r.hasDescription) missingDescription += 1;
		}
	}
	return { groups, total, missingDescription };
}
