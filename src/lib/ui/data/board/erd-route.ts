/**
 * Relation lines at right angles around the table cards (criterion c1f51729),
 * after the orthogonal connector routing of Wybrow, Marriott and Stuckey: the
 * candidate lines of an orthogonal visibility grid (each card's edges pushed
 * out by a clearance, each port's straight run, the gaps between columns), a
 * shortest-path search over it weighing length and bends, then a nudging pass
 * that spreads the segments sharing a grid line, except the lines landing on
 * one key, which keep one trunk. Pure and deterministic.
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Where a line meets a card: on its left edge (it leaves leftwards, out -1) or its right edge (out 1). */
export interface Port {
	x: number;
	y: number;
	out: -1 | 1;
}

export interface RouteAsk {
	id: string;
	/** Lines of one bundle (landing on the same key) share their trunk instead of being spread apart. */
	bundle: string;
	/** The pairs of ports the line may use; the cheapest route wins. */
	options: readonly { from: Port; to: Port }[];
}

export interface Route {
	points: { x: number; y: number }[];
	from: Port;
	to: Port;
}

/** How far a line keeps from any card. */
export const CLEARANCE = 12;
/** The straight run at each end of a line, room for its cardinality marks. */
export const STUB = 36;
/** The run a nudge may never shorten an end below: the marks need it. */
const MARK_ROOM = 26;
/** A bend costs as much as this much more line. */
const BEND = 48;
/** A vertical run in the middle of a gap between columns costs a little less, so lines prefer it. */
const CHANNEL_RATE = 0.85;
/** The distance between two spread segments. */
const SPREAD = 7;
/** The rounding of a corner. */
const RADIUS = 5;

const key = (v: number) => Math.round(v * 2) / 2;

function pushTo<K, V>(map: Map<K, V[]>, k: K, v: V) {
	const list = map.get(k);
	if (list) list.push(v);
	else map.set(k, [v]);
}

function sortedUnique(values: Iterable<number>): number[] {
	return [...new Set([...values].map(key))].sort((a, b) => a - b);
}

/** The first index whose value is at least v. */
function lowerBound(arr: readonly number[], v: number): number {
	let lo = 0;
	let hi = arr.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (arr[mid] < v) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Route every line around the cards; a line the grid cannot route runs as a plain three-segment step. */
export function routeLines(cards: readonly Box[], asks: readonly RouteAsk[], channels: readonly number[]): Map<string, Route> {
	const stubOf = (p: Port) => ({ x: key(p.x + p.out * STUB), y: key(p.y) });
	const xs = sortedUnique([
		...cards.flatMap((c) => [c.x - CLEARANCE, c.x + c.w + CLEARANCE]),
		...asks.flatMap((a) => a.options.flatMap((o) => [stubOf(o.from).x, stubOf(o.to).x])),
		...channels
	]);
	const ys = sortedUnique([
		...cards.flatMap((c) => [c.y - CLEARANCE, c.y + c.h + CLEARANCE]),
		...asks.flatMap((a) => a.options.flatMap((o) => [key(o.from.y), key(o.to.y)]))
	]);
	const grid = new Grid(xs, ys, cards, new Set(channels.map(key)));

	const routes = new Map<string, Route>();
	const bundles = new Map<string, string>();
	// Ports on the grid itself, so each end run is one straight segment.
	const onGrid = (p: Port): Port => ({ x: key(p.x), y: key(p.y), out: p.out });
	for (const ask of asks) {
		let best: { cost: number; route: Route } | null = null;
		for (const { from, to } of ask.options.map((o) => ({ from: onGrid(o.from), to: onGrid(o.to) }))) {
			const found = grid.search(from, stubOf(from), to, stubOf(to));
			if (found && (!best || found.cost < best.cost)) best = { cost: found.cost, route: { points: found.points, from, to } };
		}
		const fallback = { from: onGrid(ask.options[0].from), to: onGrid(ask.options[0].to) };
		routes.set(ask.id, best?.route ?? { points: step(fallback.from, stubOf(fallback.from), fallback.to, stubOf(fallback.to)), from: fallback.from, to: fallback.to });
		bundles.set(ask.id, ask.bundle);
	}
	nudge(routes, bundles, cards);
	return routes;
}

/** A line the grid could not route: out of its card, one step, into the other. */
function step(from: Port, a: { x: number; y: number }, to: Port, b: { x: number; y: number }) {
	const mid = (a.x + b.x) / 2;
	return simplify([{ x: from.x, y: from.y }, a, { x: mid, y: a.y }, { x: mid, y: b.y }, b, { x: to.x, y: to.y }]);
}

/** Drop the points in the middle of a straight run. */
function simplify(points: { x: number; y: number }[]) {
	const out: { x: number; y: number }[] = [];
	for (const p of points) {
		if (out.length && out[out.length - 1].x === p.x && out[out.length - 1].y === p.y) continue;
		if (out.length >= 2) {
			const a = out[out.length - 2];
			const b = out[out.length - 1];
			if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
		}
		out.push(p);
	}
	return out;
}

/**
 * The orthogonal visibility grid: a node where a candidate vertical line meets
 * a candidate horizontal one, a move between two neighbouring nodes unless it
 * runs within a card's clearance. The search state is a node and the direction
 * the line runs in, so a bend has its own cost.
 */
class Grid {
	private readonly nx: number;
	private readonly ny: number;
	/** A horizontal move from node (i, j) to (i + 1, j) is blocked. */
	private readonly hBlock: Uint8Array;
	/** A vertical move from node (i, j) to (i, j + 1) is blocked. */
	private readonly vBlock: Uint8Array;
	private readonly rate: Float64Array;
	private readonly g: Float64Array;
	private readonly prev: Int32Array;
	private readonly stamp: Int32Array;
	private readonly done: Int32Array;
	private run = 0;

	constructor(
		private readonly xs: readonly number[],
		private readonly ys: readonly number[],
		cards: readonly Box[],
		channels: ReadonlySet<number>
	) {
		this.nx = xs.length;
		this.ny = ys.length;
		const n = this.nx * this.ny;
		this.hBlock = new Uint8Array(n);
		this.vBlock = new Uint8Array(n);
		this.rate = new Float64Array(this.nx).map((_, i) => (channels.has(xs[i]) ? CHANNEL_RATE : 1));
		for (const c of cards) {
			const x0 = key(c.x - CLEARANCE);
			const x1 = key(c.x + c.w + CLEARANCE);
			const y0 = key(c.y - CLEARANCE);
			const y1 = key(c.y + c.h + CLEARANCE);
			const ia = lowerBound(xs, x0);
			const ib = lowerBound(xs, x1);
			const ja = lowerBound(ys, y0);
			const jb = lowerBound(ys, y1);
			for (let j = ja; j <= jb && j < this.ny; j++) {
				if (ys[j] <= y0 || ys[j] >= y1) continue;
				for (let i = ia; i < ib; i++) this.hBlock[i * this.ny + j] = 1;
			}
			for (let i = ia; i <= ib && i < this.nx; i++) {
				if (xs[i] <= x0 || xs[i] >= x1) continue;
				for (let j = ja; j < jb; j++) this.vBlock[i * this.ny + j] = 1;
			}
		}
		this.g = new Float64Array(n * 2);
		this.prev = new Int32Array(n * 2);
		this.stamp = new Int32Array(n * 2);
		this.done = new Int32Array(n * 2);
	}

	/** The cheapest route from one port's stub to the other's, both runs horizontal, or null. */
	search(from: Port, a: { x: number; y: number }, to: Port, b: { x: number; y: number }) {
		const { xs, ys, nx, ny } = this;
		const ia = lowerBound(xs, a.x);
		const ja = lowerBound(ys, a.y);
		const ib = lowerBound(xs, b.x);
		const jb = lowerBound(ys, b.y);
		if (xs[ia] !== a.x || ys[ja] !== a.y || xs[ib] !== b.x || ys[jb] !== b.y) return null;
		const startNode = ia * ny + ja;
		const goalNode = ib * ny + jb;
		if (startNode === goalNode) return null;
		const goal = goalNode * 2;
		const run = ++this.run;
		const heap = new Heap();
		// What is left at least: the distance, and the bends still owed, since the line lands horizontally
		// (a vertical run turns once more, a horizontal one on another row twice).
		const h = (state: number) => {
			const node = state >> 1;
			const dy = Math.abs(ys[node % ny] - b.y);
			const bends = state & 1 ? 1 : dy > 0 ? 2 : 0;
			return Math.abs(xs[(node / ny) | 0] - b.x) + CHANNEL_RATE * dy + bends * BEND;
		};
		const open = (s: number, cost: number, parent: number) => {
			if (this.stamp[s] === run && this.g[s] <= cost) return;
			this.stamp[s] = run;
			this.g[s] = cost;
			this.prev[s] = parent;
			heap.push(s, cost + h(s));
		};
		open(startNode * 2, 0, -1);
		while (heap.size) {
			const s = heap.pop();
			if (this.done[s] === run) continue;
			this.done[s] = run;
			if (s === goal) break;
			const node = s >> 1;
			const vertical = s & 1;
			const i = (node / ny) | 0;
			const j = node % ny;
			const cost = this.g[s];
			open(node * 2 + (1 - vertical), cost + BEND, s);
			if (vertical) {
				if (j > 0 && !this.vBlock[i * ny + j - 1]) open((node - 1) * 2 + 1, cost + this.rate[i] * (ys[j] - ys[j - 1]), s);
				if (j < ny - 1 && !this.vBlock[node]) open((node + 1) * 2 + 1, cost + this.rate[i] * (ys[j + 1] - ys[j]), s);
			} else {
				// Never back towards the card along an end's own run, whether leaving it or arriving.
				const left = i > 0 && !this.hBlock[(i - 1) * ny + j] && !(node === startNode && from.out > 0) && !(node - ny === goalNode && to.out < 0);
				const right = i < nx - 1 && !this.hBlock[node] && !(node === startNode && from.out < 0) && !(node + ny === goalNode && to.out > 0);
				if (left) open((node - ny) * 2, cost + (xs[i] - xs[i - 1]), s);
				if (right) open((node + ny) * 2, cost + (xs[i + 1] - xs[i]), s);
			}
		}
		if (this.done[goal] !== run) return null;
		const nodes: number[] = [];
		for (let s = goal; s !== -1; s = this.prev[s]) if (!nodes.length || nodes[nodes.length - 1] !== s >> 1) nodes.push(s >> 1);
		nodes.reverse();
		const points = [{ x: from.x, y: from.y }, ...nodes.map((nd) => ({ x: xs[(nd / ny) | 0], y: ys[nd % ny] })), { x: to.x, y: to.y }];
		return { cost: this.g[goal], points: simplify(points) };
	}
}

/** A binary min-heap of search states by their estimated cost. */
class Heap {
	private readonly states: number[] = [];
	private readonly keys: number[] = [];
	get size() {
		return this.states.length;
	}
	push(s: number, k: number) {
		const { states, keys } = this;
		let i = states.length;
		states.push(s);
		keys.push(k);
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (keys[p] <= k) break;
			states[i] = states[p];
			keys[i] = keys[p];
			i = p;
		}
		states[i] = s;
		keys[i] = k;
	}
	pop(): number {
		const { states, keys } = this;
		const top = states[0];
		const s = states.pop()!;
		const k = keys.pop()!;
		if (states.length) {
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				if (l >= states.length) break;
				const c = l + 1 < states.length && keys[l + 1] < keys[l] ? l + 1 : l;
				if (keys[c] >= k) break;
				states[i] = states[c];
				keys[i] = keys[c];
				i = c;
			}
			states[i] = s;
			keys[i] = k;
		}
		return top;
	}
}

interface Segment {
	route: Route;
	/** Index of the segment in its route: between points k and k + 1. */
	k: number;
	vertical: boolean;
	/** Its coordinate across (x of a vertical run), and its span along. */
	at: number;
	lo: number;
	hi: number;
	bundle: string;
	/** The direction (-1 / 1, across) each end turns into, at the coordinate along where it does. */
	ends: { along: number; turn: number }[];
	shift: number;
}

/**
 * Spread the segments that run along the same grid line over the same stretch,
 * one offset per bundle, ordered so they cross each other as little as
 * possible, never closer to a card than the room around them allows. The two
 * end runs of a line stay where they are, on their rows.
 */
function nudge(routes: Map<string, Route>, bundles: Map<string, string>, cards: readonly Box[]) {
	const all: Segment[] = [];
	for (const [id, route] of routes) {
		const p = route.points;
		for (let k = 1; k < p.length - 2; k++) {
			const vertical = p[k].x === p[k + 1].x;
			const along = (q: { x: number; y: number }) => (vertical ? q.y : q.x);
			const across = (q: { x: number; y: number }) => (vertical ? q.x : q.y);
			all.push({
				route,
				k,
				vertical,
				at: across(p[k]),
				lo: Math.min(along(p[k]), along(p[k + 1])),
				hi: Math.max(along(p[k]), along(p[k + 1])),
				bundle: bundles.get(id) ?? id,
				ends: [
					{ along: along(p[k]), turn: Math.sign(across(p[k - 1]) - across(p[k])) },
					{ along: along(p[k + 1]), turn: Math.sign(across(p[k + 2]) - across(p[k + 1])) }
				],
				shift: 0
			});
		}
	}
	const lines = new Map<string, Segment[]>();
	for (const s of all) pushTo(lines, `${s.vertical ? 'v' : 'h'}${s.at}`, s);
	for (const segs of lines.values()) {
		segs.sort((a, b) => a.lo - b.lo);
		let cluster: Segment[] = [];
		let reach = -Infinity;
		for (const s of [...segs, null]) {
			if (s && s.lo < reach - 1) {
				cluster.push(s);
				reach = Math.max(reach, s.hi);
				continue;
			}
			if (cluster.length > 1) spread(cluster, cards);
			if (s) {
				cluster = [s];
				reach = s.hi;
			}
		}
	}
	for (const s of all) {
		const p = s.route.points;
		for (const q of [p[s.k], p[s.k + 1]]) {
			if (s.vertical) q.x += s.shift;
			else q.y += s.shift;
		}
	}
	for (const route of routes.values()) keepMarkRoom(route);
}

/** One offset per bundle of a cluster of overlapping segments on one line. */
function spread(cluster: Segment[], cards: readonly Box[]) {
	const groups = new Map<string, Segment[]>();
	for (const s of cluster) pushTo(groups, s.bundle, s);
	if (groups.size < 2) return;
	const at = cluster[0].at;
	const vertical = cluster[0].vertical;
	const lo = Math.min(...cluster.map((s) => s.lo));
	const hi = Math.max(...cluster.map((s) => s.hi));
	// The room on either side of the line along the cluster's stretch, short of the cards there.
	let room = Infinity;
	for (const c of cards) {
		const [cLo, cHi, cA, cB] = vertical ? [c.y, c.y + c.h, c.x, c.x + c.w] : [c.x, c.x + c.w, c.y, c.y + c.h];
		if (cHi <= lo || cLo >= hi) continue;
		if (cB <= at) room = Math.min(room, at - cB);
		else if (cA >= at) room = Math.min(room, cA - at);
	}
	const half = Math.max(0, Math.min(room, 60) - 4);
	const ordered = order([...groups.values()]);
	const n = ordered.length;
	const gap = Math.min(SPREAD, (2 * half) / (n - 1));
	ordered.forEach((group, i) => {
		for (const s of group) s.shift = (i - (n - 1) / 2) * gap;
	});
}

/**
 * Order the bundles across the line: a bundle goes first (lower coordinate)
 * when that makes fewer of their turns cross the other's run.
 */
function order(groups: Segment[][]): Segment[][] {
	const crossings = (first: Segment[], second: Segment[]) => {
		let n = 0;
		for (const a of first)
			for (const e of a.ends)
				if (e.turn > 0) for (const b of second) if (e.along > b.lo && e.along < b.hi) n++;
		for (const b of second)
			for (const e of b.ends)
				if (e.turn < 0) for (const a of first) if (e.along > a.lo && e.along < a.hi) n++;
		return n;
	};
	const out: Segment[][] = [];
	for (const g of groups) {
		let i = out.length;
		while (i > 0 && crossings(g, out[i - 1]) < crossings(out[i - 1], g)) i--;
		out.splice(i, 0, g);
	}
	return out;
}

/**
 * A nudge never brings a line's first or last turn so close to its card that
 * the cardinality marks would not fit: that vertical run moves back out.
 */
function keepMarkRoom(route: Route) {
	const p = route.points;
	if (p.length < 4) return;
	for (const [port, turn, run] of [
		[route.from, p[1], p[2]],
		[route.to, p[p.length - 2], p[p.length - 3]]
	] as const) {
		const min = port.x + port.out * MARK_ROOM;
		if ((turn.x - min) * port.out >= 0) continue;
		turn.x = min;
		run.x = min;
	}
}

/** The line as an SVG path, its corners slightly rounded. */
export function routePath(points: readonly { x: number; y: number }[]): string {
	if (points.length === 0) return '';
	let d = `M ${points[0].x} ${points[0].y}`;
	for (let k = 1; k < points.length - 1; k++) {
		const a = points[k - 1];
		const c = points[k];
		const b = points[k + 1];
		const r = Math.min(RADIUS, Math.hypot(c.x - a.x, c.y - a.y) / 2, Math.hypot(b.x - c.x, b.y - c.y) / 2);
		const ux = Math.sign(c.x - a.x);
		const uy = Math.sign(c.y - a.y);
		const vx = Math.sign(b.x - c.x);
		const vy = Math.sign(b.y - c.y);
		d += ` L ${c.x - ux * r} ${c.y - uy * r} Q ${c.x} ${c.y} ${c.x + vx * r} ${c.y + vy * r}`;
	}
	const last = points[points.length - 1];
	return `${d} L ${last.x} ${last.y}`;
}
