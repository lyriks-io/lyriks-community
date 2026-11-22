import { anchorOf } from '$domain/discussions';
import type { SpecElement } from '$domain/retrospec';
import type { SpecOwner } from '$domain/retrospec';
import type { FeatureActionIndex } from '../specification/index-feature-actions';
import type { KernelRulesReadModel } from '../specification/index-feature-rules';
import type { ExperienceView } from './experience';
import { productRuleAnchor, type ProductRule } from './product-rules';
import { journeyOf } from './features';
import { text } from './labels';
import type { SpecOutline } from './outline';
import type { FactItem, RequirementGroup, StackLayer, TechnicalConstraint } from './tech';
import type { SpecUser } from './users';

/**
 * Every element a team validates on the Specification 360°, in the order the
 * pages show them, each under the anchor its discussion and its validation
 * share. Built from the same read models the pages draw, so the count the
 * validation progress gives is exactly the blocks a person can validate. An
 * element the spec says nothing about is not produced (the page shows no block
 * for it either).
 */

export interface SpecElementsInput {
	/** The product's one-line pitch (At a glance). */
	readonly pitch: string;
	readonly hasProblem: boolean;
	readonly hasTarget: boolean;
	readonly users: readonly SpecUser[];
	/** The rules the whole product keeps, at the head of the Features page (ac-rules-product-card). */
	readonly productRules?: readonly ProductRule[];
	/** The permission matrix holds at least one row. */
	readonly hasPermissions: boolean;
	readonly outline: SpecOutline;
	readonly actions: FeatureActionIndex;
	readonly rules: KernelRulesReadModel;
	/** The features disabled as a whole, by id: each leaves the counts with everything it holds. */
	readonly disabledFeatures?: Readonly<Record<string, unknown>>;
	readonly experience: ExperienceView;
	readonly entityCount: number;
	readonly dataFacts: readonly FactItem[];
	readonly stack: readonly StackLayer[];
	readonly health: readonly FactItem[];
	readonly requirements: readonly RequirementGroup[];
	readonly constraints: readonly TechnicalConstraint[];
	readonly terms: readonly { readonly id: string; readonly term: string }[];
	/**
	 * The whole of what an element reads when the row the page draws it from
	 * carries less (a feature's description, a term's definition, the problem's
	 * symptoms), by anchor: what its fingerprint is taken from.
	 */
	readonly contents?: Readonly<Record<string, unknown>>;
}

/** Which job owns each kind of element (see `spec-validators`). */
const OWNER: Readonly<Record<string, SpecOwner>> = {
	product: 'product',
	problem: 'product',
	target: 'product',
	role: 'product',
	permissions: 'product',
	core: 'product',
	feature: 'product',
	action: 'product',
	rule: 'product',
	term: 'product',
	flow: 'design',
	branding: 'design',
	journey: 'design',
	component: 'design',
	datamap: 'tech',
	data: 'tech',
	stack: 'tech',
	health: 'tech',
	requirements: 'tech',
	constraint: 'tech'
};

/** The page of Knowledge an element sits on, when no core feature and feature say more. */
const PAGE: Readonly<Record<string, string>> = {
	product: 'Overview',
	problem: 'Overview',
	target: 'Overview',
	role: 'Users',
	permissions: 'Users',
	core: 'Features',
	rule: 'Features',
	branding: 'Experience',
	journey: 'Experience',
	component: 'Experience',
	datamap: 'Technology & data',
	data: 'Technology & data',
	stack: 'Technology & data',
	health: 'Technology & data',
	requirements: 'Technology & data',
	constraint: 'Technology & data',
	term: 'Glossary'
};

/** The job that owns an element, read from its anchor alone. */
export function ownerOfElement(id: string): SpecOwner {
	return OWNER[id.split(':', 1)[0]] ?? 'product';
}

/** Stable JSON: the same content reads the same whatever order its keys were written in. */
function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
		return `{${entries
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value ?? null);
}

/** What an element reads, condensed (FNV-1a over its stable JSON): equal while nothing of it changed. */
export function fingerprintOf(content: unknown): string {
	let h = 0x811c9dc5;
	const s = stable(content);
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

export function specElements(input: SpecElementsInput): SpecElement[] {
	const out: SpecElement[] = [];
	const add = (id: string, title: string, content?: unknown, at?: { readonly place: string; readonly under?: string }) =>
		out.push({ id, title, owner: ownerOfElement(id), fingerprint: fingerprintOf([title, input.contents?.[id] ?? content ?? null]), place: at?.place ?? PAGE[id.split(':', 1)[0]], ...(at?.under ? { under: at.under } : {}) });

	if (text(input.pitch)) add('product', 'Product summary', input.pitch);
	if (input.hasProblem) add('problem', 'Current situation');
	if (input.hasTarget) add('target', 'Target situation');
	for (const u of input.users) add(anchorOf('role', u.id), u.name, u);
	for (const core of input.outline.cores) add(anchorOf('core', core.id), core.name, { name: core.name, description: core.description });

	for (const r of input.productRules ?? []) add(productRuleAnchor(r.id), r.text, r);

	for (const core of input.outline.cores) {
		for (const feature of core.features) {
			// A feature disabled as a whole is read, not validated (criterion 8642c6f0).
			if (input.disabledFeatures?.[feature.id]) continue;
			add(anchorOf('feature', feature.id), feature.name, undefined, { place: core.name });
			const place = `${core.name} › ${feature.name}`;
			const own = input.actions[feature.id] ?? [];
			const rules = input.rules.groups.find((g) => g.featureId === feature.id)?.rules ?? [];
			// A disabled element is read, not validated: it leaves the counts while
			// it is disabled, and comes back with its validations when enabled (criterion 8642c6f0).
			for (const action of own) {
				if (action.disabled) continue;
				const under = anchorOf('action', feature.id, action.id);
				add(under, text(action.name) || action.id, action, { place });
				for (const rule of rules) {
					if (rule.disabled) continue;
					if (rule.origin.kind === 'action' && rule.origin.actionId === action.id) add(anchorOf('rule', feature.id, rule.nodeId), rule.statement, rule, { place, under });
				}
			}
			if (journeyOf(own).length > 0) add(anchorOf('flow', feature.id), `Actions · ${feature.name}`, journeyOf(own), { place });
		}
	}

	if (input.users.length > 0 && input.hasPermissions) add('permissions', 'Permissions');

	const xp = input.experience;
	if (xp.authored) {
		add('branding', 'Branding');
		for (const j of xp.journeys) add(anchorOf('journey', j.id), `Journey · ${j.name}`, j);
		for (const c of xp.components) add(anchorOf('component', c.id), c.name, c);
	}

	if (input.entityCount > 0) add('datamap', 'Datamap');
	for (const f of input.dataFacts) add(anchorOf('data', f.key), f.title, f);
	for (const layer of input.stack) for (const c of layer.components) add(anchorOf('stack', c.id), c.name, c);
	for (const h of input.health) add(anchorOf('health', h.key), h.title, h);
	for (const g of input.requirements) add(anchorOf('requirements', g.key), g.title, g);
	for (const c of input.constraints) add(anchorOf('constraint', c.id), c.title, c);
	for (const t of input.terms) if (text(t.term)) add(anchorOf('term', t.id), `Term · ${text(t.term)}`);

	// One element per anchor, the first place it shows winning.
	const seen = new Set<string>();
	return out.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}
