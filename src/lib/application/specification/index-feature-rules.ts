import { disabledMarkerOf, type DisabledMarker, type UnspaFeatureSnapshot, type UnspaProjectSnapshot } from '$lib/unspa-schema';
import { isAuxFeatureId } from '../projection/aux-feature-ids';
import {
	earsOfInvariant,
	earsOfRule,
	featureProperNames,
	refusalCase,
	refusalLead,
	statesRead,
	type ActionContext,
	type Constants
} from '$lib/unspa-schema/requirement-sentences';
import type { SpecLanguage } from '$domain/language';
import type { VariableHint } from '$domain/rules';
import { ruleVariableHints } from './rule-variable-hints';

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
	/** What the rule requires, as one EARS sentence built from its logic by a
	 *  fixed template: never empty, never out of step with the condition. */
	statement: string;
	/** Why the rule exists: the node's own description (or the effect's). When it
	 *  has none, the EARS statement, so a row always reads; `hasDescription` then
	 *  says the reason is missing. */
	description: string;
	/** Whether the node gave a real reason. A description that only repeats the
	 *  refusal message, already quoted in the statement, gives none. */
	hasDescription: boolean;
	/** Rules only: whether the rule allows or blocks the action. */
	effect?: 'allow' | 'block';
	/** Rules only: the kernel category tag (permissions, validation, …). */
	category?: string;
	/** The state paths the rule or statement reads, for the filter by state. */
	reads: string[];
	/** Exact identifiers at the positions the canonical sentence renders them. */
	variables?: readonly VariableHint[];
	/** Action rules that refuse under a condition: the sentence all the refusals of
	 *  that action share, this rule's condition as one line under it, and the
	 *  message the refusal shows. */
	refusal?: { lead: string; case: string; message: string; variables?: readonly VariableHint[] };
	/** Where inside the feature it lives — the action/surface it constrains. */
	origin: RuleOrigin;
	/** Set while the rule is disabled, on its own or with the action or feature holding it: who, when and why. */
	disabled?: DisabledMarker;
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
	featureSnapshots: ReadonlyArray<{
		featureId: string;
		snapshot: UnspaFeatureSnapshot | null;
	}>
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

/** A bare kernel tag like `permissions` or `billing_quota` as a row label: "Billing Quota". */
function titleCase(value: string): string {
	return value
		.trim()
		.split(/[\s_]+/)
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');
}

/** Whether two texts say the same words, whatever their case, spacing and final punctuation. */
function sameWords(a: string, b: string): boolean {
	const norm = (t: string) =>
		t
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.replace(/[\s.!?]+$/, '')
			.trim();
	return norm(a) === norm(b);
}

/** Project one kernel rule node (action- or surface-level) into a row. */
function projectRule(
	raw: Node,
	origin: RuleOrigin,
	ownerKey: string,
	context: ActionContext | { readonly surfaceName: string },
	constants: Constants,
	lang: SpecLanguage = 'en'
): KernelRule {
	const effectNode = node(raw.effect);
	const effect = str(effectNode.type) === 'block_action' ? 'block' : 'allow';
	const category = str(raw.category);
	const statement = earsOfRule(raw, context, constants, lang);
	const variables = ruleVariableHints(raw, (rule) => earsOfRule(rule, context, constants, lang), statement, lang);
	// The node's own words first, then the effect's prose: the reason it exists.
	// The refusal message is already quoted in the statement, so a description
	// that only repeats it gives no reason.
	const prose = str(raw.description) || str(effectNode.description);
	const hasDescription = prose.trim().length > 0 && !sameWords(prose, str(effectNode.reason));
	const description = hasDescription ? prose : statement;
	const refusalText = raw.condition ? refusalCase(raw, constants, lang) : '';
	const refusalVariables = effect === 'block' && raw.condition
		? ruleVariableHints(raw, (rule) => refusalCase(rule, constants, lang), refusalText, lang)
		: [];
	const refusal =
		effect === 'block' && raw.condition && !('surfaceName' in context)
			? {
					lead: refusalLead(context, lang),
					case: refusalText,
					message: str(effectNode.reason),
					...(refusalVariables.length ? { variables: refusalVariables } : {})
				}
			: undefined;
	return {
		id: `${ownerKey}:rule:${str(raw.id) || 'anon'}`,
		nodeId: str(raw.id),
		kind: 'rule',
		title: category ? titleCase(category) : 'Rule',
		statement,
		description,
		hasDescription,
		effect,
		category: category || undefined,
		reads: statesRead(raw.condition),
		...(variables.length ? { variables } : {}),
		...(refusal ? { refusal } : {}),
		origin
	};
}

/** Project one kernel invariant node (action-, surface- or feature-level) into a row. */
function projectInvariant(
	raw: Node,
	origin: RuleOrigin,
	ownerKey: string,
	constants: Constants = {},
	lang: SpecLanguage = 'en'
): KernelRule {
	const name = str(raw.name);
	const statement = earsOfInvariant(raw, constants, lang);
	const variables = ruleVariableHints(raw, (invariant) => earsOfInvariant(invariant, constants, lang), statement, lang);
	const prose = str(raw.description) || str(raw.message);
	const hasDescription = prose.trim().length > 0;
	const description = hasDescription ? prose : statement;
	return {
		id: `${ownerKey}:inv:${str(raw.id) || 'anon'}`,
		nodeId: str(raw.id),
		kind: 'invariant',
		title: name || 'Invariant',
		statement,
		description,
		hasDescription,
		reads: statesRead(raw.condition),
		...(variables.length ? { variables } : {}),
		origin
	};
}

/**
 * A row with the marker that puts it aside: its own, else the one of what holds
 * it. Its sentence still reads (criterion 1344f0bf), only marked disabled.
 */
function marked(row: KernelRule, raw: unknown, held: DisabledMarker | null): KernelRule {
	const disabled = disabledMarkerOf(raw) ?? held;
	return disabled ? { ...row, disabled } : row;
}

/** Every rule + invariant a single feature snapshot holds, own surfaces only. */
function rulesOfFeature(
	featureId: string,
	snap: UnspaFeatureSnapshot | null,
	borrowed: Set<string>,
	lang: SpecLanguage
): KernelRule[] {
	const feature = node(snap?.feature);
	const featureName = str(feature.name) || featureId;
	const aux = isAuxFeatureId(featureId);
	const rows: KernelRule[] = [];
	const constants: Record<string, unknown> = {};
	for (const c of arr(feature.constants)) constants[str(node(c).name)] = node(c).value;
	const properNames = featureProperNames(feature);
	// A disabled feature disables every rule it holds; a disabled action, its own.
	const featureOff = disabledMarkerOf(feature);

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
			const context: ActionContext = {
				name: actionName,
				properNames,
				...(str(action.actor) ? { actor: str(action.actor) } : {}),
				...(str(action.triggeredByEvent) ? { triggeredByEvent: str(action.triggeredByEvent) } : {})
			};
			const held = disabledMarkerOf(action) ?? featureOff;
			for (const r of arr(action.rules)) rows.push(marked(projectRule(r, origin, key, context, constants, lang), r, held));
			for (const iv of arr(action.invariants)) rows.push(marked(projectInvariant(iv, origin, key, constants, lang), iv, held));
		}

		const sOrigin: RuleOrigin = {
			kind: 'surface',
			featureId,
			featureName,
			surfaceId,
			surfaceName
		};
		const sKey = `${featureId}:${surfaceId}`;
		for (const r of arr(surface.rules)) rows.push(marked(projectRule(r, sOrigin, sKey, { surfaceName }, constants, lang), r, featureOff));
		for (const iv of arr(surface.invariants)) rows.push(marked(projectInvariant(iv, sOrigin, sKey, constants, lang), iv, featureOff));
	}

	const fOrigin: RuleOrigin = { kind: 'feature', featureId, featureName };
	for (const iv of arr(feature.featureInvariants)) {
		rows.push(marked(projectInvariant(iv, fOrigin, `${featureId}:feature`, constants, lang), iv, featureOff));
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
	featureSnapshots: ReadonlyArray<{
		featureId: string;
		snapshot: UnspaFeatureSnapshot | null;
	}>,
	/** The spec's language: every statement is written in it. */
	lang: SpecLanguage = 'en'
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
		const rules = rulesOfFeature(featureId, snap, borrowed, lang);
		if (rules.length === 0) continue;
		const label = str(node(snap?.feature).name) || featureId;
		groups.push({ featureId, label, rules });
	}

	// Project-level invariants — their own group, linked to the project (no feature).
	// The engine keeps them under `projectInvariants`; `invariants` is read too so
	// a snapshot written under the older name still shows.
	const projectNode = project?.project as unknown as Node | undefined;
	const projectInvariants = arr(projectNode?.projectInvariants ?? projectNode?.invariants).map(
		(iv, i) =>
			projectInvariant(
				iv,
				{ kind: 'project', featureId: null, featureName: null },
				`project:${i}`,
				{},
				lang
			)
	);
	if (projectInvariants.length > 0) {
		groups.push({
			featureId: null,
			label: 'Project-wide',
			rules: projectInvariants
		});
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
