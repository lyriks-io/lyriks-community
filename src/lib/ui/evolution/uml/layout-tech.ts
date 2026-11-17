import { sameName, sequenceParticipants, type TechElementKind, type TechSequence, type TechnicalDiagram } from '$domain/evolution';
import { LINE_H, TITLE_H, linkLines, linkMark, wrapText, type LinkMark, type Point } from './layout';

/**
 * Where each element of the Technical spec's diagram is drawn (ac-evo-tech-uml),
 * computed from the diagram alone like the functional one. The components view
 * puts what the change involves in the product's frame (its parts, then the
 * stores where its data lives), the other systems outside it and the people who
 * use them; the sequences view draws one exchange as lifelines in the order
 * the parts first act.
 */

/** The least size of each kind of part: a part grows taller to hold its words (ac-evo-uml-legible). */
const SIZE: Record<TechElementKind, { w: number; h: number }> = {
	actor: { w: 72, h: 64 },
	component: { w: 196, h: 58 },
	store: { w: 176, h: 64 },
	system: { w: 184, h: 58 }
};
/** A part's name and its link, wrapped, and the height that holds them. */
function measurePart(e: TechnicalDiagram['elements'][number]): { w: number; h: number; lines: readonly string[]; uses: LinkMark | null } {
	const { w, h } = SIZE[e.kind];
	const uses = linkMark(e.link, e.name, w - 30);
	const lines = wrapText(e.name, e.kind === 'actor' ? 130 : w - 24, 3);
	return { w, h: e.kind === 'actor' ? h : Math.max(h, 22 + (lines.length + linkLines(uses)) * 13 + 14), lines, uses };
}
const PITCH = 104;
const FRAME_PAD = 34;
const FRAME_TITLE = 34;
const NOTE_LINE = 15;

export interface PlacedPart {
	readonly name: string;
	readonly kind: TechElementKind;
	readonly isNew: boolean;
	/** The middle of the part. */
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly lines: readonly string[];
	/** The feature or the table the product already has that it is (ac-evo-tech-uml-link). */
	readonly uses: LinkMark | null;
	/** The numbers of the notes that bear on it. */
	readonly notes: readonly number[];
}
export interface PlacedLink {
	readonly index: number;
	readonly from: Point;
	readonly to: Point;
	/** The path from `from` to `to`: straight, or around the boxes it would cross. */
	readonly points: readonly Point[];
	readonly labelAt: Point;
	/** How the label is anchored on `labelAt`: centred above a link across, from its left beside a link down. */
	readonly anchor: 'middle' | 'start';
	readonly lines: readonly string[];
}
/** A person using a part, read from the sequences: a UML dependency. */
export interface PlacedUse {
	readonly actor: string;
	readonly component: string;
	readonly from: Point;
	readonly to: Point;
}
export interface PlacedNote {
	readonly index: number;
	readonly number: number;
	readonly on: string;
	readonly y: number;
	readonly lines: readonly string[];
}
export interface ComponentLayout {
	readonly width: number;
	readonly height: number;
	readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
	readonly parts: readonly PlacedPart[];
	readonly links: readonly PlacedLink[];
	readonly uses: readonly PlacedUse[];
	readonly notesTop: number;
	readonly notes: readonly PlacedNote[];
}

/** Spread wanted positions so no two are closer than `gap`, keeping their order. */
function spread(want: readonly number[], gap: number, min: number): number[] {
	const order = want.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
	const out = new Array<number>(want.length);
	let last = -Infinity;
	for (const { y, i } of order) {
		out[i] = Math.max(y, min, last + gap);
		last = out[i];
	}
	return out;
}

/** Whether the segment from `p` to `q` runs through the box. */
function crossesBox(p: Point, q: Point, box: { x: number; y: number; w: number; h: number }): boolean {
	for (let k = 0; k <= 60; k++) {
		const t = k / 60;
		const x = p.x + (q.x - p.x) * t;
		const y = p.y + (q.y - p.y) * t;
		if (Math.abs(x - box.x) * 2 < box.w && Math.abs(y - box.y) * 2 < box.h) return true;
	}
	return false;
}

/** Room for the links that go around: one lane each, apart enough for its label. */
const LANE_STEP = 26;
const laneRoom = (count: number) => (count === 0 ? 0 : 30 + (count - 1) * LANE_STEP);

/** The box a link's label is written in, from how it is anchored (an 11 px text, 13 px a line). */
function labelBox(l: PlacedLink): { x: number; y: number; w: number; h: number } {
	const w = Math.max(0, ...l.lines.map((line) => line.length * 6.1));
	const h = l.lines.length * 13;
	const top = l.anchor === 'middle' ? l.labelAt.y - (l.lines.length - 1) * 13 - 10 : l.labelAt.y - 10;
	return { x: l.anchor === 'middle' ? l.labelAt.x - w / 2 : l.labelAt.x, y: top, w, h };
}

/** Labels of links that cross are moved apart, each lower than the one it would cover, so every one reads (ac-evo-uml-legible). */
function spaceLabels(links: readonly PlacedLink[]): PlacedLink[] {
	const out = [...links];
	for (let pass = 0; pass < 4; pass++) {
		let moved = false;
		for (let j = 0; j < out.length; j++) {
			if (out[j].lines.length === 0) continue;
			for (let i = 0; i < j; i++) {
				if (out[i].lines.length === 0) continue;
				const a = labelBox(out[i]);
				const b = labelBox(out[j]);
				if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
					out[j] = { ...out[j], labelAt: { x: out[j].labelAt.x, y: out[j].labelAt.y + (a.y + a.h - b.y) + 4 } };
					moved = true;
				}
			}
		}
		if (!moved) break;
	}
	return out;
}

/** Where the line from the middle of a box toward `p` leaves the box. */
function boxEdge(c: { x: number; y: number; w: number; h: number }, p: Point, gap = 4): Point {
	const dx = p.x - c.x;
	const dy = p.y - c.y;
	if (dx === 0 && dy === 0) return { x: c.x, y: c.y };
	const t = Math.min(Math.abs((c.w / 2 + gap) / (dx || 1e-9)), Math.abs((c.h / 2 + gap) / (dy || 1e-9)));
	return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * The components view, laid out the way architecture is usually read: the
 * people on top, the product's frame with its parts on one row and the stores
 * where their data lives on the row under the parts that use them, the other
 * systems on the right. A part that calls another system stands on the right
 * of the row, a part people use on its left, so links run down and to the
 * right. A link that would still run through a box it does not join goes
 * around it instead: over the row of parts, or under the stores when it joins
 * one, each in a lane of its own. A link's label sits above a link that runs
 * across and beside one that runs down; the notes are numbered on their part
 * and written in full under the drawing.
 */
export function layoutComponents(d: TechnicalDiagram, width = 0): ComponentLayout {
	// The lanes of the links that go around are only known once the boxes stand: lay out once, then again with their room.
	const first = arrange(d, width, { above: 0, below: 0 });
	return first.around.above === 0 && first.around.below === 0 ? first.layout : arrange(d, width, first.around).layout;
}

function arrange(d: TechnicalDiagram, width: number, room: { readonly above: number; readonly below: number }): { layout: ComponentLayout; around: { above: number; below: number } } {
	const of = (kind: TechElementKind) => d.elements.filter((e) => e.kind === kind);
	const kindOf = (name: string) => d.elements.find((e) => sameName(e.name, name))?.kind ?? null;
	const partners = (name: string): string[] => [
		...d.links.flatMap((l) => (sameName(l.from, name) ? [l.to] : sameName(l.to, name) ? [l.from] : [])),
		...d.sequences.flatMap((s) => s.messages.flatMap((m) => (sameName(m.from, name) ? [m.to] : sameName(m.to, name) ? [m.from] : [])))
	];
	const towards = (name: string, kind: TechElementKind) => partners(name).filter((p) => kindOf(p) === kind).length;
	const actors = of('actor');
	// Who calls other systems stands right, who people use stands left.
	const components = of('component')
		.map((e, i) => ({ e, i, lean: towards(e.name, 'system') - towards(e.name, 'actor') }))
		.sort((a, b) => a.lean - b.lean || a.i - b.i)
		.map(({ e }) => e);
	const stores = of('store');
	const systems = of('system');
	const top = 8;
	const peopleY = top + 34;
	const frameY = actors.length > 0 ? peopleY + 72 : top;
	const frameX = 16;
	const measured = new Map(d.elements.map((e) => [e, measurePart(e)]));
	const tallestOf = (list: readonly (typeof d.elements)[number][], kind: TechElementKind) => Math.max(SIZE[kind].h, ...list.map((e) => measured.get(e)!.h));
	// A row is as tall as its tallest part.
	const C = { w: SIZE.component.w, h: tallestOf(components, 'component') };
	const S = { w: SIZE.store.w, h: tallestOf(stores, 'store') };
	const systemPitch = Math.max(PITCH, tallestOf(systems, 'system') + 46);
	const compRowY = frameY + FRAME_TITLE + 18 + laneRoom(room.above) + C.h / 2;
	const storeRowY = compRowY + C.h / 2 + 96 + S.h / 2;
	const COMP_GAP = 150;
	const compX = components.map((_, i) => frameX + FRAME_PAD + C.w / 2 + i * (C.w + COMP_GAP));
	const xOfComponent = (name: string) => {
		const k = components.findIndex((c) => sameName(c.name, name));
		return k >= 0 ? compX[k] : null;
	};
	const under = (name: string, i: number, fallback: number) => {
		const xs = partners(name).flatMap((p) => {
			const x = xOfComponent(p);
			return x === null ? [] : [x];
		});
		return xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : fallback + i * (S.w + 50);
	};
	const firstX = frameX + FRAME_PAD + S.w / 2;
	const storeX = spread(stores.map((e, i) => under(e.name, i, firstX)), S.w + 50, firstX);
	const rowEnd = Math.max(
		components.length > 0 ? compX[compX.length - 1] + C.w / 2 : frameX + FRAME_PAD,
		stores.length > 0 ? Math.max(...storeX) + S.w / 2 : frameX + FRAME_PAD,
		frameX + 240
	);
	const frameRight = rowEnd + FRAME_PAD;
	const rowsBottom = stores.length > 0 ? storeRowY + S.h / 2 : compRowY + C.h / 2;
	const frameBottom = rowsBottom + laneRoom(room.below) + FRAME_PAD;
	const systemX = frameRight + 100 + SIZE.system.w / 2;
	// A system stands level with the row it is linked to: the parts, or the stores when only they reach it.
	const systemY = spread(
		systems.map((e, i) => (partners(e.name).some((p) => kindOf(p) === 'component') || partners(e.name).length === 0 ? compRowY + i * systemPitch : storeRowY)),
		systemPitch,
		compRowY
	);
	const peopleX = spread(
		actors.map((e, i) => under(e.name, i, frameX + 60)),
		150,
		frameX + 40
	);
	const notesOn = (name: string) => d.notes.flatMap((n, i) => (sameName(n.on, name) ? [i + 1] : []));
	const place = (e: (typeof d.elements)[number], x: number, y: number): PlacedPart => {
		const { w, h, lines, uses } = measured.get(e)!;
		return { name: e.name, kind: e.kind, isNew: e.isNew, x, y, w, h, lines, uses, notes: notesOn(e.name) };
	};
	const parts: PlacedPart[] = [
		...actors.map((e, i) => place(e, peopleX[i], peopleY)),
		...components.map((e, i) => place(e, compX[i], compRowY)),
		...stores.map((e, i) => place(e, storeX[i], storeRowY)),
		...systems.map((e, i) => place(e, systemX, systemY[i]))
	];
	const partOf = (name: string) => parts.find((p) => sameName(p.name, name));
	const around = { above: 0, below: 0 };
	const drawnLinks: PlacedLink[] = d.links.flatMap((l, index) => {
		const a = partOf(l.from);
		const b = partOf(l.to);
		if (!a || !b || a === b) return [];
		const straight = { from: boxEdge(a, b), to: boxEdge(b, a) };
		if (parts.some((p) => p !== a && p !== b && crossesBox(straight.from, straight.to, p))) {
			// Around the boxes in the way: over the parts, or under the stores when it joins one.
			const under = a.kind === 'store' || b.kind === 'store';
			const k = under ? around.below++ : around.above++;
			const lane = under ? rowsBottom + 22 + k * LANE_STEP : compRowY - C.h / 2 - 18 - k * LANE_STEP;
			const side = under ? 1 : -1;
			const toward = Math.sign(b.x - a.x) || 1;
			const start = { x: a.x + (toward * a.w) / 4, y: a.y + side * (a.h / 2 + 4) };
			const end = { x: b.x - (toward * b.w) / 4, y: b.y + side * (b.h / 2 + 4) };
			const lines = l.label ? wrapText(l.label, Math.max(100, Math.abs(end.x - start.x) - 16), 2) : [];
			return [
				{
					index,
					from: start,
					to: end,
					points: [start, { x: start.x, y: lane }, { x: end.x, y: lane }, end],
					labelAt: { x: (start.x + end.x) / 2, y: under ? lane + 14 : lane - 6 - (lines.length - 1) * 13 },
					anchor: 'middle' as const,
					lines
				}
			];
		}
		// Two links between the same parts, one each way, stand apart.
		const twin = d.links.some((o) => sameName(o.from, l.to) && sameName(o.to, l.from));
		const nx = -(b.y - a.y);
		const ny = b.x - a.x;
		const norm = Math.hypot(nx, ny) || 1;
		const off = twin ? { x: (nx / norm) * 7, y: (ny / norm) * 7 } : { x: 0, y: 0 };
		const { from, to } = straight;
		const across = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
		const mid = { x: (from.x + to.x) / 2 + off.x, y: (from.y + to.y) / 2 + off.y };
		const lines = l.label ? wrapText(l.label, across ? Math.max(100, Math.abs(to.x - from.x) - 16) : 150, 4) : [];
		return [
			{
				index,
				from: { x: from.x + off.x, y: from.y + off.y },
				to: { x: to.x + off.x, y: to.y + off.y },
				points: [
					{ x: from.x + off.x, y: from.y + off.y },
					{ x: to.x + off.x, y: to.y + off.y }
				],
				// Above a link that runs across, beside one that runs down.
				labelAt: across ? { x: mid.x, y: mid.y - 8 } : { x: mid.x + 10, y: mid.y + 4 - ((lines.length - 1) * 13) / 2 },
				anchor: across ? ('middle' as const) : ('start' as const),
				lines
			}
		];
	});
	const links = spaceLabels(drawnLinks);
	// A person uses the parts they talk to in a sequence: drawn as a dependency when no link says it already.
	const uses: PlacedUse[] = actors.flatMap((actor) =>
		components
			.filter((c) => partners(actor.name).some((p) => sameName(p, c.name)))
			.filter((c) => !d.links.some((l) => (sameName(l.from, actor.name) && sameName(l.to, c.name)) || (sameName(l.to, actor.name) && sameName(l.from, c.name))))
			.flatMap((c) => {
				const a = partOf(actor.name);
				const b = partOf(c.name);
				if (!a || !b) return [];
				return [{ actor: actor.name, component: c.name, from: { x: a.x, y: a.y + 52 }, to: boxEdge(b, { x: a.x, y: a.y + 52 }) }];
			})
	);
	const right = Math.max(frameRight, ...parts.map((p) => p.x + p.w / 2), ...links.filter((l) => l.anchor === 'start').map((l) => l.labelAt.x + 160)) + 16;
	const drawnWidth = Math.max(right, width);
	const notesTop = frameBottom + 52;
	let y = notesTop + 22;
	const notes: PlacedNote[] = d.notes.map((n, index) => {
		const lines = wrapText(`${n.on}: ${n.text}`, drawnWidth - 60, 6);
		const placed = { index, number: index + 1, on: n.on, y, lines };
		y += lines.length * NOTE_LINE + 8;
		return placed;
	});
	return {
		layout: {
			width: drawnWidth,
			// Room for the legend of what is new, under the frame, even with no note.
			height: (d.notes.length > 0 ? y : notesTop + 4) + 10,
			frame: { x: frameX, y: frameY, w: frameRight - frameX, h: frameBottom - frameY },
			parts,
			links,
			uses,
			notesTop,
			notes
		},
		around
	};
}

export interface SequenceParticipant {
	readonly name: string;
	readonly kind: TechElementKind;
	readonly isNew: boolean;
	readonly x: number;
	/** The size of its box in the header, grown to hold its name. */
	readonly w: number;
	readonly h: number;
	readonly lines: readonly string[];
}
export interface PlacedMessage {
	readonly index: number;
	readonly y: number;
	readonly x1: number;
	readonly x2: number;
	readonly self: boolean;
	readonly reply: boolean;
	readonly lines: readonly string[];
	readonly labelX: number;
	readonly labelY: number;
}
export interface PlacedFragment {
	readonly message: number;
	readonly failure: number;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly when: readonly string[];
	readonly then: readonly string[];
}
export interface SequenceLayout {
	readonly width: number;
	readonly height: number;
	readonly headerY: number;
	readonly headerH: number;
	readonly participants: readonly SequenceParticipant[];
	readonly lifelineTop: number;
	readonly lifelineBottom: number;
	readonly messages: readonly PlacedMessage[];
	readonly fragments: readonly PlacedFragment[];
}

const LIFE_GAP = 230;
const HEADER_H = 58;

/**
 * One exchange as a UML sequence diagram: each part a lifeline in the order it
 * first acts, each message an arrow in order with its label above it, an answer
 * dashed, a message to itself a loop; what happens when a message goes wrong is
 * a frame under it, across the lifelines it joins, saying when and what then.
 */
export function layoutSequence(d: TechnicalDiagram, s: TechSequence): SequenceLayout {
	const parts = sequenceParticipants(d, s);
	const participants: SequenceParticipant[] = parts.map((p, i) => {
		const lines = wrapText(p.name, p.kind === 'actor' ? 130 : 164, 3);
		const w = p.kind === 'actor' ? 72 : 188;
		const h = p.kind === 'actor' ? 50 : Math.max(p.kind === 'store' ? 56 : 50, 22 + lines.length * 13 + 14);
		return { name: p.name, kind: p.kind, isNew: p.isNew, x: 90 + i * LIFE_GAP, w, h, lines };
	});
	const xOf = (name: string) => participants.find((p) => sameName(p.name, name))?.x ?? 90;
	const headerY = TITLE_H + 6;
	// The header is as tall as the tallest box, or as a person's mark with a long name under it.
	const headerH = Math.max(HEADER_H, ...participants.map((p) => (p.kind === 'actor' ? 56 + p.lines.length * LINE_H : p.h + 8)));
	const lifelineTop = headerY + headerH;
	let y = lifelineTop + 26;
	const messages: PlacedMessage[] = [];
	const fragments: PlacedFragment[] = [];
	s.messages.forEach((m, index) => {
		const x1 = xOf(m.from);
		const x2 = xOf(m.to);
		const self = Math.abs(x1 - x2) < 1;
		const span = self ? 170 : Math.abs(x2 - x1) - 24;
		const lines = wrapText(m.text, span, 4);
		const labelY = y + 4;
		y += lines.length * 14 + 10;
		messages.push({ index, y, x1, x2, self, reply: m.reply, lines, labelX: self ? x1 + 48 : (x1 + x2) / 2, labelY });
		y += self ? 34 : 18;
		m.failures.forEach((f, failure) => {
			const lo = Math.min(x1, x2) - 50;
			const hi = Math.max(x1, x2) + (self ? 150 : 50);
			const when = wrapText(f.when || '…', hi - lo - 110, 4);
			const then = wrapText(f.then || '…', hi - lo - 34, 6);
			const h = 26 + Math.max(when.length * 14, 14) + then.length * LINE_H + 10;
			fragments.push({ message: index, failure, x: lo, y, w: hi - lo, h, when, then });
			y += h + 12;
		});
	});
	const lifelineBottom = y + 14;
	const right = Math.max(90 + (participants.length - 1) * LIFE_GAP + 110, ...fragments.map((f) => f.x + f.w + 16), ...messages.filter((m) => m.self).map((m) => m.x1 + 230));
	return { width: right, height: lifelineBottom + 16, headerY, headerH, participants, lifelineTop, lifelineBottom, messages, fragments };
}
