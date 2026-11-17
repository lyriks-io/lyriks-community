import { describe, expect, it } from 'vitest';
import { applyJourneyAct, journeysOnFeature, keepPersonJourneys, layoutJourney, canLink, journeyThrough, parseActionJourneys, stepNumbers, type ActionJourney, type JourneyAct } from './action-journeys';

const ACTIONS = new Set(['a', 'b', 'c', 'd']);
const journey = (nodes: string[], links: [string, string][] = [], origin: ActionJourney['origin'] = 'person', id = 'j1'): ActionJourney => ({
	id,
	name: 'Sign up',
	nodes,
	links: links.map(([from, to]) => ({ from, to })),
	origin
});

function after(start: ActionJourney, act: JourneyAct): ActionJourney {
	const out = applyJourneyAct([start], act, ACTIONS);
	if (!out.ok) throw new Error(out.refusal);
	return out.journeys[0];
}
const refusal = (start: ActionJourney, act: JourneyAct) => {
	const out = applyJourneyAct([start], act, ACTIONS);
	return out.ok ? null : out.refusal;
};

describe('applyJourneyAct (rule 89ee6d29)', () => {
	it('draws an arrow, adding both actions to the journey when they were not in it', () => {
		const j = after(journey(['a']), { kind: 'link', journeyId: 'j1', from: 'a', to: 'b' });
		expect(j.nodes).toEqual(['a', 'b']);
		expect(j.links).toEqual([{ from: 'a', to: 'b' }]);
	});

	it('draws the same arrow once, and never one from an action to itself', () => {
		expect(after(journey(['a', 'b'], [['a', 'b']]), { kind: 'link', journeyId: 'j1', from: 'a', to: 'b' }).links).toHaveLength(1);
		expect(refusal(journey(['a']), { kind: 'link', journeyId: 'j1', from: 'a', to: 'a' })).toMatch(/one action to another/);
	});

	it('refuses an arrow that would loop back', () => {
		expect(refusal(journey(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]), { kind: 'link', journeyId: 'j1', from: 'c', to: 'a' })).toMatch(/loop back/);
	});

	it('takes an action out with its arrows, and removes one arrow alone', () => {
		const j = journey(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]);
		expect(after(j, { kind: 'take-out', journeyId: 'j1', actionId: 'b' })).toMatchObject({ nodes: ['a', 'c'], links: [] });
		expect(after(j, { kind: 'unlink', journeyId: 'j1', from: 'a', to: 'b' }).links).toEqual([{ from: 'b', to: 'c' }]);
	});

	it('keeps where a person put a card, never past the top or left edge, and forgets it when taken out or tidied', () => {
		const moved = after(journey(['a', 'b']), { kind: 'move', journeyId: 'j1', actionId: 'a', x: 120.4, y: -30 });
		expect(moved.positions).toEqual({ a: { x: 120, y: 0 } });
		expect(after(moved, { kind: 'take-out', journeyId: 'j1', actionId: 'a' }).positions).toEqual({});
		expect(after(moved, { kind: 'tidy', journeyId: 'j1' }).positions).toEqual({});
		expect(after(journey(['a']), { kind: 'move', journeyId: 'j1', actionId: 'b', x: 1, y: 1 }).nodes).toEqual(['a', 'b']);
		expect(refusal(journey(['a']), { kind: 'move', journeyId: 'j1', actionId: 'zz', x: 1, y: 1 })).toMatch(/not on the feature/);
	});

	it('refuses an action the feature does not have', () => {
		expect(refusal(journey([]), { kind: 'add', journeyId: 'j1', actionId: 'zz' })).toMatch(/not on the feature/);
	});

	it('makes a suggested journey the person’s once they change or keep it', () => {
		expect(after(journey(['a'], [], 'ai'), { kind: 'keep', journeyId: 'j1' }).origin).toBe('person');
		expect(after(journey(['a'], [], 'ai'), { kind: 'add', journeyId: 'j1', actionId: 'b' }).origin).toBe('person');
	});

	it('declares a journey as the person’s and refuses one with no name', () => {
		const out = applyJourneyAct([], { kind: 'declare', id: 'j2', name: ' Checkout ' }, ACTIONS);
		expect(out.ok && out.journeys[0]).toEqual({ id: 'j2', name: 'Checkout', nodes: [], links: [], origin: 'person' });
		expect(applyJourneyAct([], { kind: 'declare', id: 'j3', name: '  ' }, ACTIONS).ok).toBe(false);
		const all = applyJourneyAct([], { kind: 'declare', id: 'j4', name: 'Main journey', nodes: ['a', 'b', 'zz', 'a'] }, ACTIONS);
		expect(all.ok && all.journeys[0].nodes).toEqual(['a', 'b']);
	});
});

describe('layoutJourney', () => {
	it('puts each action one column past the farthest action leading to it, branches at the same level', () => {
		const places = layoutJourney(journey(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]));
		expect(places).toEqual([
			{ actionId: 'a', column: 0, row: 0 },
			{ actionId: 'b', column: 1, row: 0 },
			{ actionId: 'c', column: 1, row: 1 },
			{ actionId: 'd', column: 2, row: 0 }
		]);
	});

	it('puts the actions no arrow touches at the left, under the linked ones of the first step', () => {
		expect(layoutJourney(journey(['c', 'a', 'b'], [['a', 'b']]))).toEqual([
			{ actionId: 'c', column: 0, row: 1 },
			{ actionId: 'a', column: 0, row: 0 },
			{ actionId: 'b', column: 1, row: 0 }
		]);
		expect(layoutJourney(journey(['a', 'b'], [])).map((p) => [p.column, p.row])).toEqual([[0, 0], [0, 1]]);
	});

	it('takes the longest way in, so a shortcut does not pull an action left', () => {
		const places = layoutJourney(journey(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']]));
		expect(places.find((p) => p.actionId === 'c')?.column).toBe(2);
	});
});

describe('canLink', () => {
	it('allows a new arrow between two actions, never to itself, twice or into a loop', () => {
		const j = journey(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]);
		expect(canLink(j, 'a', 'c')).toBe(true);
		expect(canLink(j, 'a', 'a')).toBe(false);
		expect(canLink(j, 'a', 'b')).toBe(false);
		expect(canLink(j, 'c', 'a')).toBe(false);
	});
});

describe('journeyThrough', () => {
	it('keeps the action, what leads to it and what it leads to, not a sibling branch', () => {
		const j = journey(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'c'], ['a', 'd'], ['e', 'b']]);
		expect([...journeyThrough(j, 'b')].sort()).toEqual(['a', 'b', 'c', 'e']);
		expect([...journeyThrough(j, 'x')]).toEqual(['x']);
	});
});

describe('stepNumbers', () => {
	it('gives 1 to a card no arrow leads into, and shares a number between cards at the same step', () => {
		const n = stepNumbers(journey(['a', 'b', 'c', 'd', 'e'], [['a', 'c'], ['b', 'c'], ['c', 'd'], ['a', 'e']]));
		expect(Object.fromEntries(n)).toEqual({ a: 1, b: 1, c: 2, d: 3, e: 2 });
	});

	it('counts the longest chain, and a loose card reads 1', () => {
		const n = stepNumbers(journey(['a', 'b', 'c', 'x'], [['a', 'b'], ['b', 'c'], ['a', 'c']]));
		expect(n.get('c')).toBe(3);
		expect(n.get('x')).toBe(1);
	});
});

describe('keepPersonJourneys (rule ab71c48c)', () => {
	it('keeps every journey a person declared and stores the rest as suggestions', () => {
		const stored = { f: [journey(['a'], [], 'person', 'mine'), journey(['b'], [], 'ai', 'old')] };
		const incoming = { f: [journey(['c'], [], 'person', 'mine'), journey(['d'], [], 'person', 'claims')] };
		expect(keepPersonJourneys(stored, incoming).f).toEqual([journey(['a'], [], 'person', 'mine'), journey(['d'], [], 'ai', 'claims')]);
	});

	it('cannot remove a person’s journey', () => {
		expect(keepPersonJourneys({ f: [journey(['a'])] }, {}).f).toEqual([journey(['a'])]);
	});
});

describe('parseActionJourneys', () => {
	it('keeps only known features, distinct ids, sound arrows', () => {
		const raw = {
			f: [{ id: 'j', name: 'X', nodes: ['a', 'a', 'b'], links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'zz' }], origin: 'person' }, { id: 'j' }],
			gone: [{ id: 'k' }]
		};
		expect(parseActionJourneys(raw, new Set(['f']))).toEqual({ f: [{ id: 'j', name: 'X', nodes: ['a', 'b'], links: [{ from: 'a', to: 'b' }], origin: 'person' }] });
	});

	it('reads a journey stored in steps as arrows from each step to the next', () => {
		const out = parseActionJourneys({ f: [{ id: 'j', steps: [['a'], ['b', 'c']], origin: 'person' }] }, new Set(['f']));
		expect(out.f[0]).toMatchObject({ nodes: ['a', 'b', 'c'], links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }] });
	});

	it('keeps only the positions of its own actions', () => {
		const out = parseActionJourneys({ f: [{ id: 'j', nodes: ['a'], positions: { a: { x: 10, y: 20 }, zz: { x: 1, y: 1 }, b: 'x' } }] }, new Set(['f']));
		expect(out.f[0].positions).toEqual({ a: { x: 10, y: 20 } });
	});

	it('takes a journey without an origin for a suggestion', () => {
		expect(parseActionJourneys({ f: [{ id: 'j' }] }, new Set(['f'])).f[0].origin).toBe('ai');
	});
});

describe('journeysOnFeature', () => {
	it('drops actions the feature lost with their arrows, and lists the ones no journey holds', () => {
		const view = journeysOnFeature([journey(['a', 'gone'], [['a', 'gone']])], ['a', 'b']);
		expect(view.journeys[0]).toMatchObject({ nodes: ['a'], links: [] });
		expect(view.unplaced).toEqual(['b']);
	});
});
