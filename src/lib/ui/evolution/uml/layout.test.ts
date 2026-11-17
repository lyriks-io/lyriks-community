import { describe, expect, it } from 'vitest';
import { readFunctionalDiagram } from '$domain/evolution';
import { layoutFlow, layoutMachine, layoutUseCases, wrapText } from './layout';

/**
 * The layout is computed from the diagram alone (ac-evo-func-uml-edit): what
 * these pin is that it never stacks two things on one another, whatever the
 * diagram holds, so nothing has to be moved by hand.
 */
const { diagram } = readFunctionalDiagram(`actor Baker
actor Customer
system SMS provider
use case Mark a bag ready: Baker, Customer, SMS provider
use case Collect the bag: Customer
flow Mark a bag ready
  Baker: marks the bag ready
  Product: sends one text with the pickup slot
    refused when the order has no phone number: the baker sees "no number on file"
    goes wrong when the SMS provider is down: the text is retried for an hour
  SMS provider: delivers the text
  Customer: reads the pickup slot
states Order
  placed -> ready: Mark a bag ready
  ready -> collected: the customer picks it up
  ready -> not collected: the shop closes
  not collected -> placed: the baker puts it back`);

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the functional diagram lays itself out [criterion:ac-leaf-ac-evo-func-uml-edit]', () => {
	it('wraps a text in lines that fit, and cuts the last one on an ellipsis', () => {
		expect(wrapText('sends one text with the pickup slot', 100)).toEqual(['sends one text', 'with the pickup', 'slot']);
		expect(wrapText('a b c d e f g h i j k l m n o p', 30, 2).at(-1)).toMatch(/…$/);
	});

	it('stands every person level with its use cases, never two on one another', () => {
		const layout = layoutUseCases(diagram);
		const people = layout.actors.filter((a) => a.side === 'left').map((a) => a.y);
		expect(people.every((y, i) => i === 0 || y - people[i - 1] >= 80)).toBe(true);
		expect(layout.actors.find((a) => a.name === 'SMS provider')?.side).toBe('right');
		expect(layout.links).toHaveLength(4);
		// An arrow from whoever starts a use case, a lighter one from it to whoever it involves.
		expect(layout.links.filter((l) => l.starts).map((l) => `${l.actor}>${l.useCase}`)).toEqual(['Baker>Mark a bag ready', 'Customer>Collect the bag']);
		const level = (actor: string, useCase: string) =>
			Math.abs(layout.actors.find((a) => a.name === actor)!.y - layout.useCases.find((u) => u.name === useCase)!.cy);
		expect(level('Baker', 'Mark a bag ready')).toBeLessThan(2);
		expect(level('Customer', 'Collect the bag')).toBeLessThan(2);
		// The lines of one person leave from one point per kind: the use cases they start, those that involve them.
		const fromCustomer = layout.links.filter((l) => l.actor === 'Customer').map((l) => (l.starts ? l.from.y : l.to.y));
		expect(new Set(fromCustomer).size).toBe(2);
		for (const uc of layout.useCases) expect(uc.cx).toBe(layout.frame.x + layout.frame.w / 2);
	});

	it('puts each step on its own row in its lane, and every way out in the column on the right', () => {
		const layout = layoutFlow(diagram, diagram.flows[0]);
		expect(layout.lanes.map((l) => l.name)).toEqual(['Baker', 'Customer', 'Product', 'SMS provider']);
		const boxes = layout.nodes.flatMap((n) => (n.kind === 'step' || n.kind === 'exit' ? [n as Box & { kind: string }] : []));
		for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false);
		const exits = layout.nodes.filter((n) => n.kind === 'exit');
		expect(exits).toHaveLength(2);
		expect(exits.every((e) => layout.exits && e.x === layout.exits.x)).toBe(true);
		expect(layout.edges.filter((e) => e.label === 'else')).toHaveLength(1);
	});

	it('places each state in the column of how far it is from where the thing starts', () => {
		const layout = layoutMachine(diagram.machines[0]);
		const x = Object.fromEntries(layout.states.map((s) => [s.name, s.x]));
		expect(x.placed).toBeLessThan(x.ready);
		expect(x.collected).toBe(x['not collected']);
		expect(layout.edges).toHaveLength(4);
		for (const [i, a] of layout.states.entries()) for (const b of layout.states.slice(i + 1)) expect(overlap(a, b)).toBe(false);
		expect(layout.initial).not.toBeNull();
		// Every state nothing leaves leads to the end; the causes are written apart from one another.
		expect(layout.finals).toHaveLength(1);
		const labels = layout.edges.map((e) => e.labelAt.y);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

describe('the use case lines run at right angles around every shape [criterion:ac-leaf-59998858]', () => {
	const { diagram: game } = readFunctionalDiagram(`actor Player 1
actor Player 2
use case Start a two-player game: Player 1, Player 2
use case Steer one's piece: Player 1, Player 2
use case Clear lines and score: Player 1, Player 2
use case Lose one's game: Player 1, Player 2
use case Pause both boards: Player 1, Player 2
use case See the winner: Player 1, Player 2`);
	/** Whether the segment from a to b runs through the inside of a box. */
	const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, box: Box) => {
		const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
		const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
		return x0 < box.x + box.w - 1 && x1 > box.x + 1 && y0 < box.y + box.h - 1 && y1 > box.y + 1;
	};

	for (const [name, d] of [['the bakery', diagram], ['a game for two', game]] as const) {
		it(`draws every line of ${name} in horizontal and vertical runs, never through a use case`, () => {
			const layout = layoutUseCases(d);
			expect(layout.links.length).toBeGreaterThan(0);
			for (const link of layout.links) {
				const p = link.points;
				expect(p[0]).toEqual(link.from);
				expect(p.at(-1)).toEqual(link.to);
				for (let i = 1; i < p.length; i++) expect(p[i].x === p[i - 1].x || p[i].y === p[i - 1].y).toBe(true);
				// Its own use case it only enters on its last run, level, onto the ellipse.
				const end = layout.useCases.find((u) => u.name === link.useCase)!;
				for (const uc of layout.useCases) {
					const box = { x: uc.cx - uc.rx, y: uc.cy - uc.ry, w: 2 * uc.rx, h: 2 * uc.ry };
					const runs = p.slice(1).map((q, i) => [p[i], q] as const);
					const inside = runs.filter(([a, b]) => crosses(a, b, box));
					if (uc !== end) expect(inside).toEqual([]);
					else expect(inside.length).toBeLessThanOrEqual(1);
				}
				const onEllipse = link.starts ? link.to : link.from;
				expect(((onEllipse.x - end.cx) / end.rx) ** 2 + ((onEllipse.y - end.cy) / end.ry) ** 2).toBeCloseTo(1, 3);
			}
		});
	}

	it('starts the lines of one person and one kind from one point, on the side that faces the frame, and lands each at its own', () => {
		const layout = layoutUseCases(game);
		for (const name of ['Player 1', 'Player 2']) {
			const person = layout.actors.find((a) => a.name === name)!;
			const ends = layout.links.filter((l) => l.actor === name).map((l) => (l.starts ? l.from : l.to));
			expect(new Set(ends.map((e) => `${e.x},${e.y}`)).size).toBe(1);
			for (const e of ends) expect(e.x).toBeGreaterThan(person.x);
		}
		for (const uc of layout.useCases) {
			const landings = layout.links.filter((l) => l.useCase === uc.name).map((l) => (l.starts ? l.to.y : l.from.y));
			expect(new Set(landings).size).toBe(landings.length);
		}
	});
});
