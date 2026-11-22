import { describe, expect, it } from 'vitest';
import { layerLayout, shelf, type LayerBox, type LayerLink } from './erd-layout';

/**
 * The layered placement of a database's tables (criterion c1f51729), checked on what the picture must hold rather
 * than on coordinates: every table placed, none over another, each table right of the tables it points at, the
 * tables related to none after the related ones, the drawing about as wide as it is tall.
 */

const box = (id: string, w = 160, h = 90): LayerBox => ({ id, w, h });
const link = (child: string, parent: string): LayerLink => ({ child, parent, childPort: 20, parentPort: 20 });
type Placed = { x: number; y: number; w: number; h: number };
const placed = (boxes: readonly LayerBox[], links: readonly LayerLink[]) => {
	const r = layerLayout(boxes, links);
	const at = new Map(boxes.map((b) => [b.id, { ...r.pos.get(b.id)!, w: b.w, h: b.h }]));
	return { ...r, at };
};
const overlap = (a: Placed, b: Placed) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const noneOverlap = (cards: Placed[]) => cards.every((a, i) => cards.slice(i + 1).every((b) => !overlap(a, b)));

// A small shop: orders point at customers, lines at orders and products, payments at orders; audit and settings stand alone.
const shop = [box('customer'), box('order'), box('line', 160, 140), box('product'), box('payment'), box('audit', 120, 60), box('settings', 120, 60)];
const shopLinks = [link('order', 'customer'), link('line', 'order'), link('line', 'product'), link('payment', 'order')];

describe('the layered placement of the tables of a database [criterion:c1f51729]', () => {
	it('places every table, none over another, inside the size it reports', () => {
		const r = placed(shop, shopLinks);
		expect([...r.at.keys()].sort()).toEqual(shop.map((b) => b.id).sort());
		expect(noneOverlap([...r.at.values()])).toBe(true);
		for (const c of r.at.values()) {
			expect(c.x).toBeGreaterThanOrEqual(0);
			expect(c.y).toBeGreaterThanOrEqual(0);
			expect(c.x + c.w).toBeLessThanOrEqual(r.width);
			expect(c.y + c.h).toBeLessThanOrEqual(r.height);
		}
	});

	it('sets each table in a column to the right of the tables it points at', () => {
		const r = placed(shop, shopLinks);
		for (const l of shopLinks) {
			const child = r.at.get(l.child)!;
			const parent = r.at.get(l.parent)!;
			expect(child.x, `${l.child} right of ${l.parent}`).toBeGreaterThanOrEqual(parent.x + parent.w);
		}
	});

	it('puts the tables related to none after the related ones, clear of them', () => {
		const r = placed(shop, shopLinks);
		const related = ['customer', 'order', 'line', 'product', 'payment'].map((id) => r.at.get(id)!);
		const right = Math.max(...related.map((c) => c.x + c.w));
		const bottom = Math.max(...related.map((c) => c.y + c.h));
		for (const id of ['audit', 'settings']) {
			const c = r.at.get(id)!;
			expect(c.x >= right || c.y >= bottom, id).toBe(true);
		}
	});

	it('lays the same tables out the same way, whatever else ran before', () => {
		const first = placed(shop, shopLinks);
		placed([box('x'), box('y')], [link('y', 'x')]);
		expect([...placed(shop, shopLinks).pos]).toEqual([...first.pos]);
	});

	it('ignores a relation to an unknown table or to the table itself', () => {
		const r = placed([box('a'), box('b')], [link('a', 'a'), link('a', 'ghost')]);
		expect(noneOverlap([...r.at.values()])).toBe(true);
		// Related to nothing that exists, both read as tables related to none.
		expect([...r.pos]).toEqual([...placed([box('a'), box('b')], []).pos]);
	});

	it('breaks a loop of tables once, and still places them all apart', () => {
		const r = placed([box('a'), box('b'), box('c')], [link('a', 'b'), link('b', 'c'), link('c', 'a')]);
		expect(r.at.size).toBe(3);
		expect(noneOverlap([...r.at.values()])).toBe(true);
		// Two of the three links still read left to right: only the one closing the loop is left out of the ranking.
		const forward = [['a', 'b'], ['b', 'c'], ['c', 'a']].filter(([child, parent]) => r.at.get(child)!.x > r.at.get(parent)!.x);
		expect(forward).toHaveLength(2);
	});

	it('wraps a column too tall to read, keeping the drawing about as wide as it is tall', () => {
		const children = Array.from({ length: 24 }, (_, i) => box(`child-${i}`));
		const r = placed([box('root'), ...children], children.map((c) => link(c.id, 'root')));
		expect(noneOverlap([...r.at.values()])).toBe(true);
		expect(r.height / r.width).toBeLessThan(3);
		const root = r.at.get('root')!;
		for (const c of children) expect(r.at.get(c.id)!.x).toBeGreaterThanOrEqual(root.x + root.w);
	});
});

describe('shelf packing', () => {
	it('keeps each box its size and flows them in rows, none over another, about as wide as tall', () => {
		const boxes = Array.from({ length: 12 }, (_, i) => ({ w: 100 + (i % 3) * 20, h: 60 + (i % 2) * 30 }));
		const size = shelf(boxes, 10);
		const cards = boxes as (typeof boxes[number] & { x: number; y: number })[];
		expect(noneOverlap(cards)).toBe(true);
		for (const c of cards) {
			expect(c.x + c.w).toBeLessThanOrEqual(size.width);
			expect(c.y + c.h).toBeLessThanOrEqual(size.height);
		}
		expect(new Set(cards.map((c) => c.y)).size).toBeGreaterThan(1);
		expect(size.width / size.height).toBeLessThan(4);
	});

	it('never wraps below the widest box, and gives nothing for no box', () => {
		// Two small boxes before a wide one share a row as wide as it.
		const boxes = [{ w: 100, h: 10 }, { w: 100, h: 10 }, { w: 300, h: 10 }] as { w: number; h: number; y?: number }[];
		expect(shelf(boxes, 10).width).toBe(300);
		expect(boxes[0].y).toBe(boxes[1].y);
		expect(shelf([], 10)).toEqual({ width: 0, height: 0 });
	});
});
