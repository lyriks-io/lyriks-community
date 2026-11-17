import type { EvolutionRequest } from './draft';
import { SPEC_PAGES } from './section-drafts';

/**
 * Whether everything a live request carried is in the official specification
 * (ac-evo-verd-landed-check), read again on the specification as it stands:
 * each element its behaviour model added or changed is there (a change as it
 * wrote it), each one it removed is gone; each acceptance criterion it added,
 * reworded or retired; each change to the data; each change to another page;
 * each change to the rules the whole product keeps. Pure: the edge hands the
 * specification over through `LandingSpec`, read once per page.
 */

type Rec = Readonly<Record<string, unknown>>;

/** The behaviour of an official feature, every element by its id and every state by its path. */
export interface LandedFeature {
	readonly elements: ReadonlyMap<string, Rec>;
	readonly statePaths: ReadonlySet<string>;
}

export interface LandingSpec {
	/** The official behaviour of a feature; null when the engine has none. */
	readonly feature: (featureId: string) => LandedFeature | null;
	/** A leaf of the feature tree, with its acceptance criteria; null when the tree has none. */
	readonly leaf: (leafId: string) => { readonly name: string; readonly criteria: readonly { readonly id: string; readonly text: string }[] } | null;
	/** A table of the Data section, with its fields; null when it is not there. */
	readonly entity: (entityId: string) => { readonly name: string; readonly fields: readonly { readonly id: string; readonly name: string }[] } | null;
	/** Laying the change on its page again changes nothing: it is there. */
	readonly sectionHolds: (sectionDraftId: string) => boolean;
	/** The rules the whole product keeps, by id and by name. */
	readonly invariants: readonly { readonly id: string; readonly name: string }[];
}

export interface LandingMiss {
	/** The feature, table, page or rules it belongs to. */
	readonly where: string;
	readonly what: string;
}

export interface LandingCheck {
	readonly carried: number;
	readonly found: number;
	readonly missing: readonly LandingMiss[];
}

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const same = (a: string, b: string) => a.trim() === b.trim();

/** Every element of a feature snapshot by its id, and every state by its path. */
export function landedFeatureOf(feature: unknown): LandedFeature {
	const elements = new Map<string, Rec>();
	const statePaths = new Set<string>();
	const walk = (v: unknown, key: string) => {
		if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
		if (!isRec(v)) return;
		if (typeof v.id === 'string' && v.id !== '') elements.set(v.id, v);
		if (key === 'stateDefinitions' && typeof v.path === 'string') statePaths.add(v.path);
		for (const [k, child] of Object.entries(v)) walk(child, k);
	};
	walk(feature, '');
	return { elements, statePaths };
}

/**
 * The element holds what the patch wrote: every value it sets, objects read
 * key by key and lists item by item, so the order the engine stores keys in
 * never reads as a difference.
 */
function holds(element: unknown, patch: unknown): boolean {
	if (isRec(patch)) return isRec(element) && Object.entries(patch).every(([k, v]) => v === undefined || holds(element[k], v));
	if (Array.isArray(patch)) return Array.isArray(element) && element.length === patch.length && patch.every((v, i) => holds(element[i], v));
	return element === patch;
}

const KIND_WORD: Readonly<Record<string, string>> = {
	surface: 'screen',
	action: 'action',
	action_rule: 'rule',
	rule: 'rule',
	surface_rule: 'rule',
	invariant: 'invariant',
	surface_invariant: 'invariant',
	transition: 'transition',
	event: 'event',
	scenario: 'scenario',
	effect: 'effect',
	parameter: 'parameter',
	entity: 'entity'
};
const TARGET_KEYS = ['ruleId', 'scenarioId', 'effectId', 'parameterId', 'invariantId', 'transitionId', 'eventId', 'entityId', 'actionId', 'surfaceId'] as const;

/** The element an update or a removal names: the most specific id it carries. */
function targetOf(element: string, op: Rec): string | undefined {
	const own: Readonly<Record<string, string>> = { rule: 'ruleId', scenario: 'scenarioId', effect: 'effectId', parameter: 'parameterId', invariant: 'invariantId', transition: 'transitionId', event: 'eventId', entity: 'entityId', action: 'actionId', surface: 'surfaceId' };
	const key = own[element];
	return text(key ? op[key] : undefined) ?? text(op.id) ?? TARGET_KEYS.map((k) => text(op[k])).find(Boolean);
}

/** What the operation says of its element, to name it when it is missing. */
function wordsOf(op: Rec): string | undefined {
	const patch = isRec(op.patch) ? op.patch : {};
	const rule = isRec(op.rule) ? op.rule : {};
	return [op.name, op.description, op.title, patch.name, patch.description, rule.description, op.path].map(text).find(Boolean);
}

interface Tally {
	carried: number;
	found: number;
	missing: LandingMiss[];
}

const count = (t: Tally, ok: boolean, miss: LandingMiss) => {
	t.carried += 1;
	if (ok) t.found += 1;
	else t.missing.push(miss);
};

function checkBehaviour(t: Tally, where: string, model: NonNullable<EvolutionRequest['drafts'][number]['behaviourModel']>, feature: LandedFeature | null) {
	const operations = [...(model.landed?.operations ?? []), ...model.operations];
	const minted = [...(model.landed?.mintedIds ?? []), ...model.mintedIds];
	for (const id of minted) count(t, !!feature?.elements.has(id), { where, what: `An element the change added (${id}) is not in the feature.` });
	for (const op of operations) {
		const match = /^(add|update|remove)_(.+)$/.exec(String(op.kind ?? op.op ?? ''));
		if (!match) continue;
		const [, verb, element] = match;
		if (element === 'state' || element === 'state_definition') {
			const path = text(op.path);
			if (!path) continue;
			const there = !!feature?.statePaths.has(path);
			count(t, verb === 'remove' ? !there : there, { where, what: verb === 'remove' ? `The state ${path} is still there.` : `The state ${path} is not in the feature.` });
			continue;
		}
		if (verb === 'add') continue; // counted by the ids it minted
		const word = KIND_WORD[element] ?? element;
		const id = targetOf(word, op);
		if (!id) continue;
		const found = feature?.elements.get(id);
		const label = wordsOf(op) ?? id;
		if (verb === 'remove') count(t, !found, { where, what: `The ${word} "${label}" the change removed is still there.` });
		else count(t, !!found && holds(found, op.patch ?? {}), { where, what: found ? `The ${word} "${label}" does not read as the change wrote it.` : `The ${word} "${label}" is not in the feature.` });
	}
}

function checkCriteria(t: Tally, where: string, draft: EvolutionRequest['drafts'][number], leaf: ReturnType<LandingSpec['leaf']>) {
	const official = leaf?.criteria ?? [];
	for (const c of draft.acceptanceCriteria)
		count(t, official.some((o) => o.id === c.id || same(o.text, c.text)), { where, what: `The acceptance criterion "${c.text}" is not in the feature.` });
	for (const c of draft.changeCriteria ?? [])
		count(t, official.some((o) => o.id === c.id && same(o.text, c.text)), { where, what: `The acceptance criterion "${c.text}" does not read as the change reworded it.` });
	for (const id of draft.retireCriteria ?? []) count(t, !official.some((o) => o.id === id), { where, what: `The acceptance criterion ${id} the change retired is still there.` });
}

/** Found out of carried, and what is missing, for a request that landed. */
export function landingCheck(request: EvolutionRequest, spec: LandingSpec): LandingCheck {
	const t: Tally = { carried: 0, found: 0, missing: [] };
	for (const draft of request.drafts) {
		if (!draft.materialisedAt) continue;
		const leafId = draft.materialisedAs ?? draft.baseLeafId;
		const leaf = leafId ? spec.leaf(leafId) : null;
		const where = leaf?.name || draft.name || leafId || 'A feature';
		if (draft.kind === 'remove') {
			count(t, !leaf, { where, what: 'The feature the change removed is still in the feature tree.' });
			continue;
		}
		if (draft.kind === 'add') count(t, !!leaf, { where, what: 'The feature the change added is not in the feature tree.' });
		if (draft.behaviourModel && leafId) checkBehaviour(t, where, draft.behaviourModel, spec.feature(leafId));
		checkCriteria(t, where, draft, leaf);
	}
	for (const d of request.dataDrafts) {
		if (!d.materialisedAt) continue;
		const entityId = d.materialisedAs ?? d.entityId;
		const entity = entityId ? spec.entity(entityId) : null;
		const where = entity?.name || d.name || 'A table';
		if (d.kind === 'remove') {
			count(t, !entity, { where, what: 'The table the change removed is still in the Data section.' });
			continue;
		}
		if (d.kind === 'add') count(t, !!entity, { where, what: 'The table the change added is not in the Data section.' });
		const fields = entity?.fields ?? [];
		for (const f of d.addFields) count(t, fields.some((x) => same(x.name, f.name)), { where, what: `The field ${f.name} is not in the table.` });
		for (const c of d.changeFields)
			count(t, fields.some((x) => x.id === c.fieldId && (!c.name || same(x.name, c.name))), { where, what: `The field ${c.name || c.fieldId} does not read as the change wrote it.` });
		for (const id of d.removeFields) count(t, !fields.some((x) => x.id === id), { where, what: `The field ${id} the change removed is still in the table.` });
	}
	for (const s of request.sectionDrafts ?? [])
		if (s.materialisedAt) count(t, spec.sectionHolds(s.id), { where: SPEC_PAGES[s.page]?.name ?? s.page, what: `"${s.summary}" is not on the page.` });
	const landedRules = (request.ruleDrafts ?? []).filter((d) => d.materialisedAt);
	for (const d of landedRules)
		for (const op of d.operations) {
			const kind = String(op.kind ?? op.op ?? '');
			const name = text(op.name) ?? text(isRec(op.patch) ? op.patch.name : undefined);
			const id = text(op.invariantId) ?? text(op.id);
			const where = 'The rules the whole product keeps';
			if (kind === 'add_project_invariant') count(t, spec.invariants.some((i) => !!name && same(i.name, name)), { where, what: `The rule "${name ?? ''}" is not among them.` });
			else if (kind === 'remove_project_invariant') count(t, !spec.invariants.some((i) => i.id === id), { where, what: `The rule ${id ?? ''} the change removed is still among them.` });
			else if (kind === 'update_project_invariant')
				count(t, spec.invariants.some((i) => i.id === id && (!name || same(i.name, name))), { where, what: `The rule "${name ?? id ?? ''}" does not read as the change wrote it.` });
		}
	return t;
}
