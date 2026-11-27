/**
 * The journeys of a feature's actions (actions f3bbf419, 2d9a8378, e2470294):
 * named flowcharts through the feature's actions, read left to right. A
 * journey holds some of the feature's actions and the arrows a person drew
 * between them; where each action stands is computed from the arrows, so
 * nobody places anything by hand. The actions themselves are the behavior
 * kernel's: a journey only names them, so it never changes what one does.
 *
 * A person decides the journeys. An AI may suggest some, and a write from an
 * AI never replaces, changes or removes a journey a person declared or kept.
 */

export type JourneyOrigin = 'person' | 'ai';

/**
 * What an arrow says (criterion 415a3006): the person goes on to the next
 * action (then), the action puts the product in the state the next one needs
 * (enables), it sets the next one off with no one acting (triggers), or it
 * leads there when it is refused or fails (fails).
 */
export const JOURNEY_LINK_KINDS = ['then', 'enables', 'triggers', 'fails'] as const;
export type JourneyLinkKind = (typeof JOURNEY_LINK_KINDS)[number];

/** How each kind reads on the page. */
export const JOURNEY_LINK_LABELS: Readonly<Record<JourneyLinkKind, string>> = {
	then: 'Then',
	enables: 'Makes possible',
	triggers: 'Triggers',
	fails: 'On failure'
};

/** An arrow: the journey goes from one action to the next. Without a kind, it reads Then. */
export interface JourneyLink {
	from: string;
	to: string;
	kind?: JourneyLinkKind;
}

/** The kind an arrow reads as: Then when it carries none. */
export const linkKindOf = (link: Pick<JourneyLink, 'kind'>): JourneyLinkKind => link.kind ?? 'then';

const kindFrom = (v: unknown): JourneyLinkKind | null => (JOURNEY_LINK_KINDS as readonly unknown[]).includes(v) ? (v as JourneyLinkKind) : null;

/** An arrow as stored: Then is the kind it reads without one, so it is never written. */
function arrow(from: string, to: string, kind: JourneyLinkKind | null | undefined): JourneyLink {
	return kind && kind !== 'then' ? { from, to, kind } : { from, to };
}

export interface ActionJourney {
	id: string;
	name: string;
	/** The actions the journey holds, each once, in the order they joined it. */
	nodes: string[];
	/** The arrows between them; never a loop, never the same arrow twice. */
	links: JourneyLink[];
	/** Where a person put a card, in pixels from the drawing's top left; a card without one stands where the arrows place it. */
	positions?: Record<string, JourneyPosition>;
	/** Who stands behind it: a person, or an AI whose suggestion nobody kept yet. */
	origin: JourneyOrigin;
}

export interface JourneyPosition {
	x: number;
	y: number;
}

/** The journeys of every feature, keyed by feature id. */
export type ActionJourneys = Record<string, ActionJourney[]>;

export type JourneyAct =
	| { readonly kind: 'declare'; readonly id: string; readonly name: string; readonly nodes?: readonly string[] }
	| { readonly kind: 'rename'; readonly journeyId: string; readonly name: string }
	| { readonly kind: 'remove'; readonly journeyId: string }
	| { readonly kind: 'keep'; readonly journeyId: string }
	| { readonly kind: 'add'; readonly journeyId: string; readonly actionId: string }
	| { readonly kind: 'take-out'; readonly journeyId: string; readonly actionId: string }
	| { readonly kind: 'link'; readonly journeyId: string; readonly from: string; readonly to: string; readonly linkKind?: JourneyLinkKind }
	| { readonly kind: 'retype'; readonly journeyId: string; readonly from: string; readonly to: string; readonly linkKind: JourneyLinkKind }
	| { readonly kind: 'unlink'; readonly journeyId: string; readonly from: string; readonly to: string }
	| { readonly kind: 'move'; readonly journeyId: string; readonly actionId: string; readonly x: number; readonly y: number }
	| { readonly kind: 'tidy'; readonly journeyId: string };

/** A position as stored: whole pixels, never above or left of the drawing's edge, within reason. */
function sanePosition(x: unknown, y: unknown): JourneyPosition | null {
	if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
	const clamp = (v: number) => Math.min(20000, Math.max(0, Math.round(v)));
	return { x: clamp(x), y: clamp(y) };
}

export type JourneyActOutcome = { readonly ok: true; readonly journeys: ActionJourney[] } | { readonly ok: false; readonly refusal: string };

const MAX_NAME = 120;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Whether `to` already leads back to `from` along the arrows, so `from → to` would close a loop. */
function leadsTo(links: readonly JourneyLink[], start: string, target: string): boolean {
	const seen = new Set<string>();
	const stack = [start];
	while (stack.length) {
		const at = stack.pop()!;
		if (at === target) return true;
		if (seen.has(at)) continue;
		seen.add(at);
		for (const l of links) if (l.from === at) stack.push(l.to);
	}
	return false;
}

/** Whether an arrow from one action to another may be drawn: two different actions, not drawn yet, closing no loop. */
export function canLink(journey: Pick<ActionJourney, 'links'>, from: string, to: string): boolean {
	return from !== to && !journey.links.some((l) => l.from === from && l.to === to) && !leadsTo(journey.links, to, from);
}

/** The arrows that can stand among these actions: no self arrow, no duplicate, no loop. */
function soundLinks(nodes: ReadonlySet<string>, raw: readonly JourneyLink[]): JourneyLink[] {
	const out: JourneyLink[] = [];
	for (const l of raw) {
		if (!nodes.has(l.from) || !nodes.has(l.to) || l.from === l.to) continue;
		if (out.some((k) => k.from === l.from && k.to === l.to)) continue;
		if (leadsTo(out, l.to, l.from)) continue;
		out.push(arrow(l.from, l.to, l.kind));
	}
	return out;
}

/** The steps a journey was first stored in, read as actions and the arrows from each step to the next. */
function fromSteps(steps: unknown[]): { nodes: string[]; links: JourneyLink[] } {
	const columns = steps.map((s) => (Array.isArray(s) ? s : [s]).map(text).filter(Boolean));
	const links: JourneyLink[] = [];
	for (let i = 1; i < columns.length; i++) for (const from of columns[i - 1]) for (const to of columns[i]) links.push({ from, to });
	return { nodes: columns.flat(), links };
}

/** One journey from untrusted input, or null when it cannot stand: an id is required. */
function parseJourney(raw: unknown, seen: Set<string>): ActionJourney | null {
	if (!raw || typeof raw !== 'object') return null;
	const src = raw as Record<string, unknown>;
	const id = text(src.id);
	if (!id || seen.has(id)) return null;
	seen.add(id);
	const legacy = !Array.isArray(src.nodes) && Array.isArray(src.steps) ? fromSteps(src.steps) : null;
	const rawNodes = legacy?.nodes ?? (Array.isArray(src.nodes) ? src.nodes.map(text) : []);
	const nodes = [...new Set(rawNodes.filter(Boolean))];
	const rawLinks = legacy?.links ?? (Array.isArray(src.links) ? src.links : []).flatMap((l) => {
		if (!l || typeof l !== 'object') return [];
		const r = l as Record<string, unknown>;
		return [arrow(text(r.from), text(r.to), kindFrom(r.kind))];
	});
	const positions: Record<string, JourneyPosition> = {};
	if (src.positions && typeof src.positions === 'object' && !Array.isArray(src.positions))
		for (const [a, p] of Object.entries(src.positions as Record<string, unknown>)) {
			const at = p && typeof p === 'object' ? sanePosition((p as Record<string, unknown>).x, (p as Record<string, unknown>).y) : null;
			if (at && nodes.includes(a)) positions[a] = at;
		}
	return {
		id,
		name: text(src.name).slice(0, MAX_NAME) || 'Journey',
		nodes,
		links: soundLinks(new Set(nodes), rawLinks),
		...(Object.keys(positions).length ? { positions } : {}),
		origin: src.origin === 'person' ? 'person' : 'ai'
	};
}

/** The journeys of every feature from untrusted input; only the features the tree holds keep theirs. */
export function parseActionJourneys(raw: unknown, featureIds: ReadonlySet<string>): ActionJourneys {
	const out: ActionJourneys = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [featureId, list] of Object.entries(raw as Record<string, unknown>)) {
		if (!featureIds.has(featureId) || !Array.isArray(list)) continue;
		const seen = new Set<string>();
		const journeys = list.map((j) => parseJourney(j, seen)).filter((j): j is ActionJourney => j !== null);
		if (journeys.length) out[featureId] = journeys;
	}
	return out;
}

/**
 * What a write that does not come from the page leaves (rule ab71c48c): every
 * journey a person declared or kept stays as stored, and every other journey
 * the write carries is a suggestion, replacing the suggestions before it.
 */
export function keepPersonJourneys(stored: ActionJourneys, incoming: ActionJourneys): ActionJourneys {
	const out: ActionJourneys = {};
	for (const featureId of new Set([...Object.keys(stored), ...Object.keys(incoming)])) {
		const people = (stored[featureId] ?? []).filter((j) => j.origin === 'person');
		const taken = new Set(people.map((j) => j.id));
		const suggested = (incoming[featureId] ?? []).filter((j) => !taken.has(j.id)).map((j) => ({ ...j, origin: 'ai' as const }));
		const journeys = [...people, ...suggested];
		if (journeys.length) out[featureId] = journeys;
	}
	return out;
}

const named = (name: string): string | null => name.trim().slice(0, MAX_NAME) || null;

/** One change to the journey itself, or the refusal that says why it cannot be made. */
function changed(j: ActionJourney, act: Exclude<JourneyAct, { kind: 'declare' | 'remove' }>, actionIds: ReadonlySet<string>): ActionJourney | string {
	switch (act.kind) {
		case 'keep':
			return j;
		case 'rename': {
			const name = named(act.name);
			return name ? { ...j, name } : 'Name the journey.';
		}
		case 'add':
			if (!actionIds.has(act.actionId)) return 'This action is not on the feature.';
			return j.nodes.includes(act.actionId) ? j : { ...j, nodes: [...j.nodes, act.actionId] };
		case 'take-out': {
			const { [act.actionId]: _gone, ...positions } = j.positions ?? {};
			return { ...j, nodes: j.nodes.filter((a) => a !== act.actionId), links: j.links.filter((l) => l.from !== act.actionId && l.to !== act.actionId), positions };
		}
		case 'move': {
			// The diagram holds every action of the feature, one added since included.
			if (!actionIds.has(act.actionId)) return 'This action is not on the feature.';
			const at = sanePosition(act.x, act.y);
			if (!at) return 'A card is placed with two numbers.';
			return { ...j, nodes: j.nodes.includes(act.actionId) ? j.nodes : [...j.nodes, act.actionId], positions: { ...j.positions, [act.actionId]: at } };
		}
		case 'tidy':
			return { ...j, positions: {} };
		case 'unlink':
			return { ...j, links: j.links.filter((l) => !(l.from === act.from && l.to === act.to)) };
		case 'link': {
			if (!actionIds.has(act.from) || !actionIds.has(act.to)) return 'This action is not on the feature.';
			if (act.from === act.to) return 'An arrow goes from one action to another.';
			if (j.links.some((l) => l.from === act.from && l.to === act.to)) return j;
			if (leadsTo(j.links, act.to, act.from)) return 'This arrow would loop back: a journey reads left to right.';
			const nodes = [...j.nodes, ...[act.from, act.to].filter((a, i, all) => !j.nodes.includes(a) && all.indexOf(a) === i)];
			return { ...j, nodes, links: [...j.links, arrow(act.from, act.to, act.linkKind)] };
		}
		case 'retype': {
			if (!kindFrom(act.linkKind)) return 'An arrow reads Then, Makes possible, Triggers or On failure.';
			if (!j.links.some((l) => l.from === act.from && l.to === act.to)) return 'This arrow is not on the diagram any more.';
			return { ...j, links: j.links.map((l) => (l.from === act.from && l.to === act.to ? arrow(l.from, l.to, act.linkKind) : l)) };
		}
	}
}

/**
 * One change a person makes to a feature's journeys (rule 89ee6d29): a journey
 * never loops, an arrow runs between two different actions and is drawn once,
 * taking an action out takes its arrows with it, and a person's change to a
 * suggested journey makes it theirs.
 */
export function applyJourneyAct(journeys: readonly ActionJourney[], act: JourneyAct, actionIds: ReadonlySet<string>): JourneyActOutcome {
	if (act.kind === 'declare') {
		const name = named(act.name);
		if (!name) return { ok: false, refusal: 'Name the journey.' };
		if (journeys.some((j) => j.id === act.id)) return { ok: false, refusal: 'This journey exists already.' };
		const nodes = [...new Set((act.nodes ?? []).filter((a) => actionIds.has(a)))];
		return { ok: true, journeys: [...journeys, { id: act.id, name, nodes, links: [], origin: 'person' }] };
	}
	const target = journeys.find((j) => j.id === act.journeyId);
	if (!target) return { ok: false, refusal: 'This journey is not on the feature any more.' };
	if (act.kind === 'remove') return { ok: true, journeys: journeys.filter((j) => j.id !== act.journeyId) };
	const next = changed(target, act, actionIds);
	if (typeof next === 'string') return { ok: false, refusal: next };
	return { ok: true, journeys: journeys.map((j) => (j.id === target.id ? { ...next, origin: 'person' } : j)) };
}

/** Where an action stands in the drawing: its column (arrows that lead to it, at most) and its row in that column. */
export interface JourneyPlacement {
	actionId: string;
	column: number;
	row: number;
}

/**
 * How far along its arrows each action stands: 0 for one no arrow leads into,
 * a loose one included, else one past the farthest action leading to it (the
 * longest chain), so several actions may stand at the same step.
 */
export function stepsOf(journey: Pick<ActionJourney, 'nodes' | 'links'>): Map<string, number> {
	const step = new Map<string, number>(journey.nodes.map((a) => [a, 0]));
	// Longest path on an acyclic graph: relax as many times as there are actions.
	for (let pass = 0; pass < step.size; pass++) {
		let moved = false;
		for (const l of journey.links) {
			const next = (step.get(l.from) ?? 0) + 1;
			if (step.has(l.to) && next > step.get(l.to)!) {
				step.set(l.to, next);
				moved = true;
			}
		}
		if (!moved) break;
	}
	return step;
}

/**
 * The horizontal flowchart of a journey: each action in the column of its
 * step, so the actions at the same step stand at the same level, the loose
 * ones with the first step at the left; within a column, linked actions first,
 * each in the order it joined.
 */
export function layoutJourney(journey: Pick<ActionJourney, 'nodes' | 'links'>): JourneyPlacement[] {
	const column = stepsOf(journey);
	const linked = new Set(journey.links.flatMap((l) => [l.from, l.to]));
	const order = [...journey.nodes.filter((a) => linked.has(a)), ...journey.nodes.filter((a) => !linked.has(a))];
	const rows = new Map<number, number>();
	const placed = new Map(
		order.map((actionId) => {
			const c = column.get(actionId) ?? 0;
			const row = rows.get(c) ?? 0;
			rows.set(c, row + 1);
			return [actionId, { actionId, column: c, row }] as const;
		})
	);
	return journey.nodes.map((a) => placed.get(a)!);
}

/** The journey an action stands in: itself, every action whose arrows lead to it and every one its arrows lead to. */
export function journeyThrough(journey: Pick<ActionJourney, 'links'>, actionId: string): Set<string> {
	const walk = (next: (l: JourneyLink) => [string, string]) => {
		const seen = new Set<string>([actionId]);
		const stack = [actionId];
		while (stack.length) {
			const at = stack.pop()!;
			for (const l of journey.links) {
				const [from, to] = next(l);
				if (from === at && !seen.has(to)) {
					seen.add(to);
					stack.push(to);
				}
			}
		}
		return seen;
	};
	return new Set([...walk((l) => [l.to, l.from]), ...walk((l) => [l.from, l.to])]);
}

/** The number each card reads: its step, counted from 1; several cards may share one, a loose card reads 1. */
export function stepNumbers(journey: Pick<ActionJourney, 'nodes' | 'links'>): Map<string, number> {
	return new Map([...stepsOf(journey)].map(([a, step]) => [a, step + 1]));
}

/** The journeys as the page draws them: only the actions the feature still has, and the ones no journey holds. */
export function journeysOnFeature(journeys: readonly ActionJourney[], actionIds: readonly string[]): { journeys: ActionJourney[]; unplaced: string[] } {
	const known = new Set(actionIds);
	const shown = journeys.map((j) => {
		const nodes = j.nodes.filter((a) => known.has(a));
		return { ...j, nodes, links: j.links.filter((l) => known.has(l.from) && known.has(l.to)) };
	});
	const inSome = new Set(shown.flatMap((j) => j.nodes));
	return { journeys: shown, unplaced: actionIds.filter((a) => !inSome.has(a)) };
}

/**
 * The one diagram a feature's page shows (action f3bbf419): the first a person
 * kept that has an arrow, else the first an AI suggested that has one, else a
 * person's still without arrows; null when the feature has none yet. A
 * person's diagram without arrows decides nothing, so a suggestion that links
 * the actions reads before it.
 */
export function shownDiagram(journeys: readonly ActionJourney[]): ActionJourney | null {
	const linked = (j: ActionJourney) => j.links.length > 0;
	return journeys.find((j) => j.origin === 'person' && linked(j)) ?? journeys.find(linked) ?? journeys.find((j) => j.origin === 'person') ?? journeys[0] ?? null;
}

/** Whether a feature's diagram links any two of these actions, kept or suggested (criterion a0ebe123). */
export function hasJourney(journeys: readonly ActionJourney[], actionIds: readonly string[]): boolean {
	return (shownDiagram(journeysOnFeature(journeys, actionIds).journeys)?.links.length ?? 0) > 0;
}
