/**
 * Layered placement of the tables of one database, the way relational
 * diagramming tools draw a schema (criterion c1f51729): every table sits in a
 * column to the right of the tables it points at, a column is ordered and
 * placed so that most relation lines run straight across, a column too tall to
 * read wraps into the next one, and the tables related to none come after the
 * related ones. Pure and deterministic: the same boxes and links give the same
 * picture. The lines themselves are drawn by erd-route.ts.
 */

/** A card to place: its id and its size. */
export interface LayerBox {
	id: string;
	w: number;
	h: number;
}

/** A relation between two cards: the child holds the key, the parent is the table it points at. */
export interface LayerLink {
	child: string;
	parent: string;
	/** Where the line meets each card, measured from the card's top. */
	childPort: number;
	parentPort: number;
}

export interface LayerResult {
	/** The top-left corner of every card, relative to the block's own origin. */
	pos: Map<string, { x: number; y: number }>;
	width: number;
	height: number;
}

/** The gap between two columns: room for both ends' cardinality marks and the trunks between them. */
const COL_GAP = 104;
/** What each further bundle of lines crossing a gap adds to it, up to TRACKS_MAX of them. */
const TRACK = 8;
const TRACKS_MAX = 8;
/** The gap between two cards of one column: wide enough for a line to pass between them. */
const ROW_GAP = 40;
/** The room a line passing through a column keeps for itself there. */
const PASS_H = 16;
/** Between two groups of related tables, and before the tables related to none. */
export const BLOCK_GAP = 72;
/** Between two tables related to none. */
const LONE_GAP = 36;
/** The width a laid-out group aims at for each unit of its height. */
const ASPECT = 1.6;
const ORDER_SWEEPS = 8;
const PLACE_SWEEPS = 12;

interface Item {
	id: string;
	w: number;
	h: number;
	/** Set on the room a line keeps where it passes through a column. */
	pass?: true;
	col: number;
	order: number;
	y: number;
}

/** A segment of a line between two neighbouring columns, with where it meets each end. */
interface Hop {
	a: Item;
	b: Item;
	aPort: number;
	bPort: number;
	/** The parent table the whole line lands on: lines landing on one table share a trunk. */
	bundle: string;
}

function pushTo<K, V>(map: Map<K, V[]>, k: K, v: V) {
	const list = map.get(k);
	if (list) list.push(v);
	else map.set(k, [v]);
}

/**
 * Shelf packing: boxes keep their own size and flow left to right, wrapping
 * once a row passes a width chosen from their total area (never below the
 * widest box), so a group is about as wide as it is tall and hugs its content.
 * Writes each box's x / y relative to the packing origin.
 */
export function shelf<T extends { w: number; h: number }>(boxes: T[], gap: number): { width: number; height: number } {
	if (boxes.length === 0) return { width: 0, height: 0 };
	const area = boxes.reduce((a, b) => a + b.w * b.h, 0);
	const limit = Math.max(Math.max(...boxes.map((b) => b.w)), Math.sqrt(area) * 1.4);
	let x = 0;
	let y = 0;
	let rowH = 0;
	let width = 0;
	for (const b of boxes as (T & { x?: number; y?: number })[]) {
		if (x > 0 && x + b.w > limit) {
			x = 0;
			y += rowH + gap;
			rowH = 0;
		}
		b.x = x;
		b.y = y;
		x += b.w + gap;
		rowH = Math.max(rowH, b.h);
		width = Math.max(width, x - gap);
	}
	return { width, height: y + rowH };
}

/** Lay the boxes out: each group of related tables in columns, then the tables related to none. */
export function layerLayout(boxes: readonly LayerBox[], links: readonly LayerLink[]): LayerResult {
	const known = new Map(boxes.map((b, i) => [b.id, i] as const));
	const usable = links.filter((l) => l.child !== l.parent && known.has(l.child) && known.has(l.parent));

	// Groups of tables joined by relations (union-find), in the order their first table comes.
	const root = boxes.map((_, i) => i);
	const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
	for (const l of usable) root[find(known.get(l.child)!)] = find(known.get(l.parent)!);
	const groups = new Map<number, LayerBox[]>();
	const lone: LayerBox[] = [];
	const linked = new Set(usable.flatMap((l) => [l.child, l.parent]));
	for (const b of boxes) {
		if (!linked.has(b.id)) {
			lone.push(b);
			continue;
		}
		pushTo(groups, find(known.get(b.id)!), b);
	}

	const blocks: { w: number; h: number; x?: number; y?: number; place: (dx: number, dy: number) => void }[] = [];
	const pos = new Map<string, { x: number; y: number }>();
	// The largest group first: it is the schema's spine, the rest reads around it.
	const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
	for (const members of ordered) {
		const ids = new Set(members.map((m) => m.id));
		const r = layerGroup(members, usable.filter((l) => ids.has(l.child)));
		blocks.push({
			w: r.width,
			h: r.height,
			place: (dx, dy) => {
				for (const [id, p] of r.pos) pos.set(id, { x: p.x + dx, y: p.y + dy });
			}
		});
	}
	if (lone.length) {
		const cards = lone.map((b) => ({ ...b }));
		const size = shelf(cards, LONE_GAP);
		blocks.push({
			w: size.width,
			h: size.height,
			place: (dx, dy) => {
				for (const c of cards as (LayerBox & { x: number; y: number })[]) pos.set(c.id, { x: c.x + dx, y: c.y + dy });
			}
		});
	}
	const size = shelf(blocks, BLOCK_GAP);
	for (const b of blocks) b.place(b.x!, b.y!);
	return { pos, width: size.width, height: size.height };
}

/** One group of related tables, in columns. */
function layerGroup(members: readonly LayerBox[], links: readonly LayerLink[]): LayerResult {
	const index = new Map(members.map((m, i) => [m.id, i] as const));
	const parentsOf = members.map(() => new Set<number>());
	const childrenOf = members.map(() => new Set<number>());
	for (const l of links) {
		parentsOf[index.get(l.child)!].add(index.get(l.parent)!);
		childrenOf[index.get(l.parent)!].add(index.get(l.child)!);
	}

	// A loop of tables is broken once: the link that closes it is left out of the ranking.
	const state = members.map(() => 0); // 0 unseen, 1 on the path, 2 done
	const kept = members.map(() => new Set<number>());
	const visit = (n: number) => {
		state[n] = 1;
		for (const p of parentsOf[n]) {
			if (state[p] === 1) continue;
			kept[n].add(p);
			if (state[p] === 0) visit(p);
		}
		state[n] = 2;
	};
	members.forEach((_, n) => state[n] === 0 && visit(n));

	// Rank = the longest chain of tables it points at; a table that points at
	// nothing then moves right next to the nearest table that points at it.
	const rank = members.map(() => -1);
	const rankOf = (n: number): number => {
		if (rank[n] >= 0) return rank[n];
		let r = 0;
		for (const p of kept[n]) r = Math.max(r, rankOf(p) + 1);
		return (rank[n] = r);
	};
	members.forEach((_, n) => rankOf(n));
	const keptChildren = members.map(() => [] as number[]);
	kept.forEach((ps, c) => ps.forEach((p) => keptChildren[p].push(c)));
	for (let n = 0; n < members.length; n++) {
		if (kept[n].size === 0 && keptChildren[n].length) rank[n] = Math.min(...keptChildren[n].map((c) => rank[c])) - 1;
	}
	const low = Math.min(...rank);
	const layers: number[][] = [];
	members.forEach((_, n) => (layers[rank[n] - low] ??= []).push(n));
	for (let r = 0; r < layers.length; r++) layers[r] ??= [];

	// Order each layer by where its neighbours sit (barycentre), before any wrap.
	const at = members.map(() => 0);
	const setAt = () => layers.forEach((layer) => layer.forEach((n, i) => (at[n] = (i + 0.5) / layer.length)));
	setAt();
	for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
		const down = sweep % 2 === 0;
		const seq = down ? layers.keys() : [...layers.keys()].reverse();
		for (const r of seq) {
			const score = new Map<number, number>();
			for (const n of layers[r]) {
				const near = [...(down ? kept[n] : keptChildren[n])].map((m) => at[m]);
				score.set(n, near.length ? near.reduce((a, b) => a + b, 0) / near.length : at[n]);
			}
			layers[r].sort((a, b) => score.get(a)! - score.get(b)! || a - b);
			layers[r].forEach((n, i) => (at[n] = (i + 0.5) / layers[r].length));
		}
	}

	// A layer taller than the group should be wraps into further columns.
	const area = members.reduce((a, m) => a + (m.w + COL_GAP) * (m.h + ROW_GAP), 0);
	const tallest = Math.max(...members.map((m) => m.h));
	const limit = Math.max(tallest, Math.sqrt(area / ASPECT));
	const columns: Item[][] = [];
	const itemOf = new Map<number, Item>();
	for (const layer of layers) {
		let column: Item[] = [];
		let height = 0;
		for (const n of layer) {
			const m = members[n];
			if (column.length && height + ROW_GAP + m.h > limit) {
				columns.push(column);
				column = [];
				height = 0;
			}
			const item: Item = { id: m.id, w: m.w, h: m.h, col: columns.length, order: column.length, y: 0 };
			height += (column.length ? ROW_GAP : 0) + m.h;
			column.push(item);
			itemOf.set(n, item);
		}
		if (column.length) columns.push(column);
	}

	// Each line becomes hops between neighbouring columns; where it passes a
	// column, it keeps a little room there so it never has to cross a card.
	const hops: Hop[] = [];
	const ports = new Map<string, { childPort: number; parentPort: number; n: number }>();
	for (const l of links) {
		const key = `${l.child}>${l.parent}`;
		const p = ports.get(key) ?? { childPort: 0, parentPort: 0, n: 0 };
		ports.set(key, { childPort: p.childPort + l.childPort, parentPort: p.parentPort + l.parentPort, n: p.n + 1 });
	}
	for (const [key, p] of ports) {
		const [childId, parentId] = key.split('>');
		const child = itemOf.get(index.get(childId)!)!;
		const parent = itemOf.get(index.get(parentId)!)!;
		if (child.col === parent.col) continue;
		const [from, fromPort, to, toPort] =
			parent.col < child.col
				? [parent, p.parentPort / p.n, child, p.childPort / p.n]
				: [child, p.childPort / p.n, parent, p.parentPort / p.n];
		let prev = from;
		let prevPort = fromPort;
		for (let c = from.col + 1; c < to.col; c++) {
			const pass: Item = { id: `${key}~${c}`, w: 0, h: PASS_H, pass: true, col: c, order: columns[c].length, y: 0 };
			columns[c].push(pass);
			hops.push({ a: prev, b: pass, aPort: prevPort, bPort: PASS_H / 2, bundle: parentId });
			prev = pass;
			prevPort = PASS_H / 2;
		}
		hops.push({ a: prev, b: to, aPort: prevPort, bPort: toPort, bundle: parentId });
	}
	const left = new Map<Item, Hop[]>();
	const right = new Map<Item, Hop[]>();
	for (const h of hops) {
		pushTo(left, h.b, h);
		pushTo(right, h.a, h);
	}

	// Order again now that the passes are in: each column by its neighbours' order.
	const rel = (it: Item) => (it.order + 0.5) / columns[it.col].length;
	for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
		const down = sweep % 2 === 0;
		const seq = down ? [...columns.keys()] : [...columns.keys()].reverse();
		for (const c of seq) {
			const score = new Map<Item, number>();
			for (const it of columns[c]) {
				const near = down ? (left.get(it) ?? []).map((h) => rel(h.a)) : (right.get(it) ?? []).map((h) => rel(h.b));
				score.set(it, near.length ? near.reduce((a, b) => a + b, 0) / near.length : rel(it));
			}
			columns[c].sort((a, b) => score.get(a)! - score.get(b)! || a.order - b.order);
			columns[c].forEach((it, i) => (it.order = i));
		}
	}

	// Heights: each card level with the rows it points at (a table pointing at
	// nothing, with the topmost table pointing at it), the first of a column
	// where it wants to be and the next ones below it, so the map reads from the
	// top like a page rather than hanging each parent in the middle of its children.
	for (const column of columns) {
		let y = 0;
		for (const it of column) {
			it.y = y;
			y += it.h + ROW_GAP;
		}
	}
	for (let sweep = 0; sweep < PLACE_SWEEPS; sweep++) {
		const seq = sweep % 2 === 0 ? [...columns.keys()] : [...columns.keys()].reverse();
		for (const c of seq) {
			let floor = -Infinity;
			for (const it of columns[c]) {
				const lefts = (left.get(it) ?? []).map((h) => h.a.y + h.aPort - h.bPort);
				const rights = (right.get(it) ?? []).map((h) => h.b.y + h.bPort - h.aPort);
				const want = lefts.length ? lefts.reduce((a, b) => a + b, 0) / lefts.length : rights.length ? Math.min(...rights) : it.y;
				it.y = Math.max(want, floor);
				floor = it.y + it.h + ROW_GAP;
			}
		}
	}

	// Columns from left to right, each as wide as its widest card, each gap
	// widened by the bundles of lines crossing it.
	const crossing = columns.map(() => new Set<string>());
	for (const h of hops) crossing[Math.min(h.a.col, h.b.col)].add(h.bundle);
	const xs: number[] = [];
	let x = 0;
	columns.forEach((column, c) => {
		xs[c] = x;
		const w = Math.max(0, ...column.map((it) => it.w));
		const gap = COL_GAP + TRACK * Math.min(TRACKS_MAX, Math.max(0, crossing[c].size - 1));
		x += w + gap;
	});

	const real = columns.flat().filter((it) => !it.pass);
	const top = Math.min(...columns.flat().map((it) => it.y));
	// Whole pixels, so a line's ends sit exactly on the rows they meet.
	const pos = new Map(real.map((it) => [it.id, { x: Math.round(xs[it.col]), y: Math.round(it.y - top) }] as const));
	const width = Math.max(...real.map((it) => pos.get(it.id)!.x + it.w));
	const height = Math.max(...real.map((it) => pos.get(it.id)!.y + it.h));
	return { pos, width, height };
}
