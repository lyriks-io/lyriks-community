/**
 * Relation lines as relational diagramming tools draw them (criterion
 * c1f51729): an elbow with two bends at most. A line leaves its foreign key's
 * row horizontally on the side of its card facing the table it points at,
 * turns into a vertical run in the gap beside that table, and turns again to
 * land horizontally on the key row; level rows give a straight line, two
 * tables of one column are joined around a run on their right. Lines landing
 * on one key share their run (a trunk), the runs of different keys in one gap
 * are spread apart. A line crossing a card in between passes under it (the
 * canvas draws lines first). Pure and deterministic.
 */
import type { Box, Port, Route } from './erd-route';

export interface ElbowAsk {
	id: string;
	/** Lines landing on the same key share their vertical run. */
	bundle: string;
	/** The card the line leaves, at its foreign key's row, and the card it lands on, at its key's row. */
	from: { box: Box; y: number };
	to: { box: Box; y: number };
}

/** The straight run kept at each end before a bend: room for the cardinality marks. */
export const ELBOW_STUB = 36;
/** The distance between the vertical runs of two keys in one gap. */
const SPREAD = 9;
/** The least straight run a spread may leave at the far end. */
const MARK_ROOM = 30;

const right = (b: Box) => b.x + b.w;
const level = (a: number, b: number) => Math.abs(a - b) < 0.5;

interface Plan {
	ask: ElbowAsk;
	from: Port;
	to: Port;
	/** Where the vertical run starts, beside the landing card, and which way the lanes spread. */
	base: number;
	dir: -1 | 1;
	/** The gap the run sits in, shared by every line whose run starts at the same place. */
	gap: string;
}

/** Which sides a line leaves and lands on, and the gap its run sits in. */
function planOf(ask: ElbowAsk): Plan {
	const a = ask.from.box;
	const b = ask.to.box;
	const port = (box: Box, y: number, out: -1 | 1): Port => ({ x: out > 0 ? right(box) : box.x, y, out });
	// The table pointed at stands on the left: leave leftwards, land on its right side.
	if (right(b) + 2 * ELBOW_STUB <= a.x)
		return { ask, from: port(a, ask.from.y, -1), to: port(b, ask.to.y, 1), base: right(b) + ELBOW_STUB, dir: 1, gap: `R${Math.round(right(b))}` };
	// It stands on the right: leave rightwards, land on its left side.
	if (right(a) + 2 * ELBOW_STUB <= b.x)
		return { ask, from: port(a, ask.from.y, 1), to: port(b, ask.to.y, -1), base: b.x - ELBOW_STUB, dir: -1, gap: `L${Math.round(b.x)}` };
	// One column (or one card): both ends on the right, around a run beside them.
	const edge = Math.max(right(a), right(b));
	return { ask, from: port(a, ask.from.y, 1), to: port(b, ask.to.y, 1), base: edge + ELBOW_STUB, dir: 1, gap: `R${Math.round(edge)}` };
}

/** The route of every line, keyed by its id. */
export function elbowRoutes(asks: readonly ElbowAsk[]): Map<string, Route> {
	const plans = asks.map(planOf);
	// One lane per key in each gap, the keys ordered by where they land, so runs side by side cross the least.
	const lanes = new Map<string, number>();
	const byGap = new Map<string, Plan[]>();
	for (const p of plans) byGap.set(p.gap, [...(byGap.get(p.gap) ?? []), p]);
	for (const [gap, inGap] of byGap) {
		const bundles = [...new Map(inGap.map((p) => [p.ask.bundle, p.to.y] as const))].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]));
		bundles.forEach(([bundle], i) => lanes.set(`${gap}|${bundle}`, i));
	}
	const routes = new Map<string, Route>();
	for (const p of plans) {
		const { from, to } = p;
		const facing = from.out === -to.out;
		if (facing && level(from.y, to.y)) {
			routes.set(p.ask.id, { points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], from, to });
			continue;
		}
		const wanted = p.base + p.dir * SPREAD * (lanes.get(`${p.gap}|${p.ask.bundle}`) ?? 0);
		// Facing cards: a spread never eats the far end's room for its marks.
		const x = facing ? (p.dir > 0 ? Math.min(wanted, from.x - MARK_ROOM) : Math.max(wanted, from.x + MARK_ROOM)) : wanted;
		routes.set(p.ask.id, {
			points: [
				{ x: from.x, y: from.y },
				{ x, y: from.y },
				{ x, y: to.y },
				{ x: to.x, y: to.y }
			],
			from,
			to
		});
	}
	return routes;
}
