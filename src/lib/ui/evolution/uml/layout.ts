import {
	PRODUCT_LANE,
	flowLanes,
	sameName,
	startedBy,
	type DiagramActorKind,
	type DiagramBranchKind,
	type DiagramFlow,
	type DiagramMachine,
	type FunctionalDiagram
} from '$domain/evolution';
import { routeLines, type Box, type Port, type RouteAsk } from '$ui/data/board/erd-route';

/**
 * Where each element of the functional diagram is drawn (ac-evo-func-uml-edit):
 * the layout is computed from the diagram alone, so nothing is ever placed by
 * hand and an edit made as text or on the drawing redraws the same way.
 * Coordinates are SVG user units; text is wrapped by an estimate of its width,
 * since the layout runs before anything is measured on screen. What makes each
 * view readable (ac-evo-func-uml) is decided here: who starts what, titles and
 * frames, where a thing ends, labels clear of their lines.
 */

const CHAR_W = 6.6;
export const LINE_H = 15;
/** The band each view opens on, holding its title. */
export const TITLE_H = 34;

/** A text cut into lines of at most `width` units, `max` lines at most, the last one ending on an ellipsis when cut. */
export function wrapText(text: string, width: number, max = 4): string[] {
	const chars = Math.max(4, Math.floor(width / CHAR_W));
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter((w) => w !== '')) {
		const piece = word.length > chars ? `${word.slice(0, chars - 1)}…` : word;
		if (line === '') line = piece;
		else if (line.length + 1 + piece.length <= chars) line = `${line} ${piece}`;
		else {
			lines.push(line);
			line = piece;
		}
	}
	if (line !== '') lines.push(line);
	if (lines.length <= max) return lines.length > 0 ? lines : [''];
	const kept = lines.slice(0, max);
	const last = kept[max - 1];
	kept[max - 1] = last.length >= chars ? `${last.slice(0, chars - 1)}…` : `${last}…`;
	return kept;
}

/** How wide a line of text is drawn, by the same estimate as the wrapping. */
export const textWidth = (text: string) => text.length * CHAR_W;
/** A step reads as a sentence in its box: its first letter in capital. */
export const asSentence = (text: string) => (text === '' ? text : text[0].toLocaleUpperCase() + text.slice(1));

/**
 * Every text of a diagram reads in full (ac-evo-uml-legible): a name or a step
 * wraps on up to this many lines before a sentence too long for them is cut,
 * the whole of it read on hover.
 */
export const MAX_LINES = 5;
/** What links an element to the product, and how many lines it is written on. */
export type LinkKind = 'feature' | 'action' | 'entity';
export interface LinkMark {
	readonly kind: LinkKind;
	/** The name of what it links to, in full; empty when that name is the element's own, which the view then says by its kind. */
	readonly lines: readonly string[];
}
/** The link of an element as it reads under its name: its target's name, or only its kind when the names are the same. */
export function linkMark(link: { readonly name: string; readonly ref: string } | undefined, own: string, width: number): LinkMark | null {
	if (!link) return null;
	const prefix = link.ref.split(':')[0];
	const kind: LinkKind = prefix === 'action' || prefix === 'entity' ? prefix : 'feature';
	return { kind, lines: sameName(link.name, own) ? [] : wrapText(link.name, width, 2) };
}
/** The least zoom a request's diagram opens at, so its words read (ac-evo-uml-legible). */
export const READABLE_ZOOM = 0.9;
/** The most a fitted diagram of a request is enlarged in its card. */
export const READING_MAX_FIT = 1.25;
/**
 * The height of a diagram's frame in its card: as tall as the drawing fitted to
 * its width, between the card's usual 400 px and the height of the window, past
 * which the drawing is moved inside it (ac-evo-uml-legible).
 */
export const readingCanvasHeight = (drawn: number) => (drawn > 0 ? `clamp(400px, ${Math.ceil(drawn)}px, calc(100vh - 200px))` : '400px');

/** How many lines a link takes under its element. */
export const linkLines = (mark: LinkMark | null) => (mark === null ? 0 : Math.max(1, mark.lines.length));

export interface Point {
	readonly x: number;
	readonly y: number;
}

/** `n` points spread evenly between `from` and `to`, never on the ends. */
function spreadBetween(from: number, to: number, n: number): number[] {
	return Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / (n + 1));
}

// ---------------------------------------------------------------- use cases

export interface PlacedActor {
	readonly name: string;
	readonly kind: DiagramActorKind;
	/** Named by a use case without being declared: drawn dashed. */
	readonly declared: boolean;
	readonly x: number;
	readonly y: number;
	readonly side: 'left' | 'right';
	readonly lines: readonly string[];
	/** The height of a system's box, grown to hold its name. */
	readonly h: number;
}
export interface PlacedUseCase {
	readonly name: string;
	readonly cx: number;
	readonly cy: number;
	readonly rx: number;
	readonly ry: number;
	readonly lines: readonly string[];
	/** The feature the product already has that it is, drawn under its name (ac-evo-func-uml-link). */
	readonly uses: LinkMark | null;
}
/**
 * One association, drawn from `from` to `to` with the arrow at `to`: from
 * whoever starts the use case to it, or from the use case to someone it
 * involves. It runs along `points`, at right angles around the shapes, as the
 * data map's lines do (criterion 59998858).
 */
export interface UseCaseLink {
	readonly actor: string;
	readonly useCase: string;
	readonly starts: boolean;
	readonly from: Point;
	readonly to: Point;
	readonly points: readonly Point[];
}
export interface UseCaseLayout {
	readonly width: number;
	readonly height: number;
	readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
	readonly actors: readonly PlacedActor[];
	readonly useCases: readonly PlacedUseCase[];
	readonly links: readonly UseCaseLink[];
	/** Where the legend of the two arrows stands, under the frame. */
	readonly legend: Point;
}

const UC_W = 200;
/** An ellipse grows to hold its words, up to this half-width. */
const UC_MAX_RX = 170;
/** A use case's name wraps at about 28 characters a line. */
const UC_TEXT_W = 186;
const UC_GAP = 34;
const ACTOR_COL = 196;
const ACTOR_X = 76;
/** The systems stand clear of the frame: their boxes are wider than a person's mark. */
const SYSTEM_COL = 240;
export const SYSTEM_W = 140;
const ACTOR_H = 118;
const FRAME_PAD = 44;
const FRAME_TITLE = 32;
/** The estimated width of a character at the use case's name size, and at its link's. */
const NAME_CHAR_W = 7.2;
const LINK_CHAR_W = 6.1;

/** The half-axes of an ellipse that holds lines of these widths, each one inside its curve. */
function ellipseAround(widths: readonly number[]): { rx: number; ry: number } {
	const n = widths.length;
	const ry = Math.max(26, (n * LINE_H) / 2 + 16);
	const rx = Math.max(
		UC_W / 2,
		...widths.map((w, i) => {
			const dy = Math.abs(-((n - 1) * LINE_H) / 2 + i * LINE_H) + 6;
			return w / 2 / Math.sqrt(Math.max(0.05, 1 - (dy / ry) ** 2)) + 10;
		})
	);
	return { rx: Math.min(rx, UC_MAX_RX), ry };
}

/** Spread items at `want` positions so no two are closer than `gap`, keeping their order. */
function spread(want: readonly number[], gap: number, min: number): number[] {
	const order = want.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
	const out = new Array<number>(want.length);
	let last = -Infinity;
	for (const { y, i } of order) {
		const placed = Math.max(y, min, last + gap);
		out[i] = placed;
		last = placed;
	}
	return out;
}

/**
 * People on the left, the other systems on the right, the use cases as
 * ellipses in a frame named after the product between them. Each person
 * stands level with the use case they start (else with those they take part
 * in), and the lines of one actor leave from points spread along their side,
 * ordered like the use cases they reach, so they fan out instead of knotting.
 */
export function layoutUseCases(diagram: FunctionalDiagram): UseCaseLayout {
	const undeclared = diagram.useCases
		.flatMap((u) => u.actors)
		.filter((name, i, all) => !diagram.actors.some((a) => sameName(a.name, name)) && all.findIndex((n) => sameName(n, name)) === i);
	const everyone = [
		...diagram.actors.map((a) => ({ name: a.name, kind: a.kind, declared: true })),
		...undeclared.map((name) => ({ name, kind: 'person' as const, declared: false }))
	];
	const hasRight = everyone.some((a) => a.kind === 'system');
	const frameX = ACTOR_COL;
	const top = 12;
	// Each ellipse is sized to its own words first (ac-evo-uml-legible), the frame to the widest.
	const sized = diagram.useCases.map((u) => {
		const lines = wrapText(u.name, UC_TEXT_W, MAX_LINES - 1);
		const uses = linkMark(u.link, u.name, UC_TEXT_W);
		const widths = [...lines.map((l) => l.length * NAME_CHAR_W), ...(uses ? (uses.lines.length > 0 ? uses.lines : ['↳ existing feature']).map((l) => (l.length + 2) * LINK_CHAR_W) : [])];
		return { u, lines, uses, ...ellipseAround(widths) };
	});
	const frameW = 2 * Math.max(UC_W / 2, ...sized.map((s) => s.rx)) + FRAME_PAD * 2;
	let y = top + FRAME_TITLE + 14;
	// Two use cases stand at least as far apart as two people, so each person can stand level with the one they start.
	const pitch = everyone.filter((a) => a.kind === 'person').length > 1 ? ACTOR_H : 0;
	const useCases: PlacedUseCase[] = sized.map(({ u, lines, uses, rx, ry }) => {
		const placed = { name: u.name, cx: frameX + frameW / 2, cy: y + ry, rx, ry, lines, uses };
		y += Math.max(2 * ry + UC_GAP, pitch);
		return placed;
	});
	const frameH = Math.max(130, y - top - UC_GAP + FRAME_PAD - 20);
	const starters = diagram.useCases.map((u) => startedBy(diagram, u.name));
	const wantedY = (name: string, i: number): number => {
		const started = diagram.useCases.flatMap((u, k) => (starters[k] && sameName(starters[k]!, name) ? [useCases[k].cy] : []));
		const involved = diagram.useCases.flatMap((u, k) => (u.actors.some((a) => sameName(a, name)) ? [useCases[k].cy] : []));
		const ys = started.length > 0 ? started : involved;
		return ys.length > 0 ? ys.reduce((s, v) => s + v, 0) / ys.length : top + 50 + i * ACTOR_H;
	};
	const place = (side: 'left' | 'right') => {
		const group = everyone
			.filter((a) => (side === 'left' ? a.kind === 'person' : a.kind === 'system'))
			.map((a) => {
				const lines = wrapText(a.name, side === 'left' ? ACTOR_COL - 56 : SYSTEM_W - 16, 3);
				return { ...a, lines, h: side === 'left' ? 0 : Math.max(52, 26 + lines.length * 13 + 8) };
			});
		// People stand apart enough for their names, systems for their boxes.
		const gap = side === 'left' ? ACTOR_H + Math.max(0, ...group.map((a) => a.lines.length - 2)) * LINE_H : Math.max(ACTOR_H, ...group.map((a) => a.h + 40));
		const ys = spread(
			group.map((a, i) => wantedY(a.name, i)),
			gap,
			top + 40
		);
		const x = side === 'left' ? ACTOR_X : frameX + frameW + SYSTEM_COL / 2;
		return group.map((a, i): PlacedActor => ({ ...a, x, y: ys[i], side }));
	};
	const actors = [...place('left'), ...place('right')];
	const links = routeUseCaseLinks(diagram, actors, useCases, starters);
	const legend = { x: frameX, y: top + frameH + 30 };
	const lowest = Math.max(legend.y + 12, ...actors.map((a) => (a.side === 'left' ? a.y + 36 + a.lines.length * LINE_H : a.y + a.h / 2)));
	return {
		width: Math.max(frameX + frameW + (hasRight ? SYSTEM_COL : 24), legend.x + 420),
		height: lowest + 16,
		frame: { x: frameX, y: top, w: frameW, h: frameH },
		actors,
		useCases,
		links,
		legend
	};
}

/** The radius of a person's mark (ActorMark's tile), and how far under it their name starts. */
const MARK_R = 24;
const NAME_TOP = 28;

/** Where a person's mark and name, or a system's box, stand: the shapes a line runs around. */
function actorBoxes(actor: PlacedActor): Box[] {
	if (actor.side === 'right') return [{ x: actor.x - SYSTEM_W / 2, y: actor.y - actor.h / 2, w: SYSTEM_W, h: actor.h }];
	const nameW = Math.max(...actor.lines.map((l) => l.length * NAME_CHAR_W), MARK_R * 2);
	return [
		{ x: actor.x - MARK_R, y: actor.y - MARK_R - 2, w: MARK_R * 2, h: MARK_R * 2 },
		{ x: actor.x - nameW / 2, y: actor.y + NAME_TOP, w: nameW, h: actor.lines.length * LINE_H + 4 }
	];
}

/** `n` offsets around 0, `gap` apart, never past `max` either side. */
function offsets(n: number, gap: number, max: number): number[] {
	const step = n > 1 ? Math.min(gap, (2 * max) / (n - 1)) : 0;
	return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
}

/**
 * The associations at right angles around every shape, with the data map's
 * routing (criteria 59998858, c1f51729): the lines of one actor and one kind
 * (the use cases it starts, those that involve it) leave it together from one
 * point on the side that faces the frame, share one trunk in the gap between
 * the actors and the frame, and part to land each on the side of its use case
 * that faces it, at a point of its own on the ellipse itself.
 */
function routeUseCaseLinks(
	diagram: FunctionalDiagram,
	actors: readonly PlacedActor[],
	useCases: readonly PlacedUseCase[],
	starters: readonly (string | null | undefined)[]
): UseCaseLink[] {
	type Pending = { id: string; actor: PlacedActor; k: number; starts: boolean; from: Port; to?: Port; dy?: number };
	const pending: Pending[] = actors.flatMap((actor) => {
		const targets = diagram.useCases
			.map((u, k) => ({ u, k }))
			.filter(({ u }) => u.actors.some((a) => sameName(a, actor.name)))
			.sort((p, q) => useCases[p.k].cy - useCases[q.k].cy);
		const starts = (k: number) => !!starters[k] && sameName(starters[k]!, actor.name);
		// One point and one trunk for the use cases the actor starts, another for those that involve it.
		const kinds = [...new Set(targets.map(({ k }) => starts(k)))].sort((a, b) => Number(b) - Number(a));
		const ys = actor.side === 'left' ? spreadBetween(actor.y - 18, actor.y + 8, kinds.length) : spreadBetween(actor.y - 16, actor.y + 16, kinds.length);
		return targets.map(({ k }): Pending => {
			const y = ys[kinds.indexOf(starts(k))];
			return {
				id: `${actor.name}>${useCases[k].name}`,
				actor,
				k,
				starts: starts(k),
				from: actor.side === 'left' ? { x: actor.x + MARK_R, y, out: 1 } : { x: actor.x - SYSTEM_W / 2, y, out: -1 }
			};
		});
	});
	// Each use case takes the lines of one side at points of its own, in the order of where they come from.
	useCases.forEach((uc, k) => {
		for (const side of ['left', 'right'] as const) {
			const mine = pending.filter((p) => p.k === k && p.actor.side === side).sort((a, b) => a.from.y - b.from.y);
			offsets(mine.length, 10, uc.ry * 0.55).forEach((dy, i) => {
				mine[i].dy = dy;
				mine[i].to = { x: side === 'left' ? uc.cx - uc.rx : uc.cx + uc.rx, y: uc.cy + dy, out: side === 'left' ? -1 : 1 };
			});
		}
	});
	const shapes: Box[] = [...actors.flatMap(actorBoxes), ...useCases.map((u) => ({ x: u.cx - u.rx, y: u.cy - u.ry, w: 2 * u.rx, h: 2 * u.ry }))];
	// The trunks run in the middle of the gap between the actors and the use cases, on either side.
	const edge = (side: 'left' | 'right') => actors.filter((a) => a.side === side).flatMap(actorBoxes);
	const left = edge('left');
	const right = edge('right');
	const channels = [
		...(left.length ? [(Math.max(...left.map((b) => b.x + b.w)) + Math.min(...useCases.map((u) => u.cx - u.rx))) / 2] : []),
		...(right.length ? [(Math.min(...right.map((b) => b.x)) + Math.max(...useCases.map((u) => u.cx + u.rx))) / 2] : [])
	];
	const asks: RouteAsk[] = pending.map((p) => ({ id: p.id, bundle: `${p.actor.name}:${p.starts ? 'starts' : 'involves'}`, options: [{ from: p.from, to: p.to! }] }));
	const routes = routeLines(shapes, asks, channels);
	return pending.map((p) => {
		const uc = useCases[p.k];
		const route = routes.get(p.id)!;
		// The router lands on the use case's box; the line goes on to the ellipse, level.
		const dy = p.dy ?? 0;
		const reach = uc.rx * Math.sqrt(Math.max(0, 1 - (dy / uc.ry) ** 2));
		const onEllipse = { x: uc.cx + (p.actor.side === 'left' ? -reach : reach), y: route.to.y };
		const points = [...route.points.map((q) => ({ x: q.x, y: q.y })), onEllipse];
		const at = points[0];
		return {
			actor: p.actor.name,
			useCase: uc.name,
			starts: p.starts,
			from: p.starts ? at : onEllipse,
			to: p.starts ? onEllipse : at,
			points: p.starts ? points : [...points].reverse()
		};
	});
}

// -------------------------------------------------------------------- flows

export interface FlowLane {
	readonly name: string;
	readonly kind: DiagramActorKind | 'product';
	readonly x: number;
	readonly w: number;
	readonly lines: readonly string[];
}
export type FlowNode =
	| { readonly kind: 'start' | 'end'; readonly x: number; readonly y: number }
	| {
			readonly kind: 'step';
			readonly step: number;
			readonly x: number;
			readonly y: number;
			readonly w: number;
			readonly h: number;
			readonly lines: readonly string[];
			/** The action the product already has that this step is, drawn under its text (ac-evo-func-uml-link). */
			readonly uses: LinkMark | null;
	  }
	| { readonly kind: 'decision'; readonly step: number; readonly x: number; readonly y: number }
	| {
			readonly kind: 'exit';
			readonly step: number;
			readonly branch: number;
			readonly branchKind: DiagramBranchKind;
			readonly x: number;
			readonly y: number;
			readonly w: number;
			readonly h: number;
			readonly when: readonly string[];
			readonly then: readonly string[];
			/** Where the line between the condition and what then happens is drawn, from the top of the box. */
			readonly divider: number;
	  };
export interface FlowEdge {
	readonly path: string;
	/** The guard of the edge, said by the view in the spec's language. */
	readonly label: 'else' | 'refused' | 'goes_wrong' | null;
	readonly labelAt: Point | null;
	/** An edge into a way out. */
	readonly exit: boolean;
}
export interface FlowLayout {
	readonly width: number;
	readonly height: number;
	/** Where the lanes' header starts, under the title, and how tall it is. */
	readonly headerTop: number;
	readonly header: number;
	/** How far the lanes reach, the column of the ways out excluded. */
	readonly lanesEnd: number;
	readonly lanes: readonly FlowLane[];
	/** The column of the ways out, when a step has one. */
	readonly exits: { readonly x: number; readonly w: number } | null;
	readonly nodes: readonly FlowNode[];
	readonly edges: readonly FlowEdge[];
	/** Who starts the use case the flow walks through. */
	readonly startedBy: string | null;
}

const LANE_W = 220;
/** A step's text wraps at about 26 characters a line. */
const STEP_W = 196;
const HEADER_H = 46;
const ROW_GAP = 26;
/** The gap between the lanes and the ways out, where their bus runs: never inside a lane. */
const EXIT_GAP = 104;
/** How far left of the ways out their bus runs, so each guard reads on its own segment. */
const BUS_ROOM = 76;
const EXIT_W = 280;
const DIAMOND = 15;
/** A way out says when it happens and what then happens on up to this many lines each. */
const EXIT_LINES = 6;

/**
 * An activity diagram in swimlanes under its title: a start, each step in the
 * lane of whoever does it, an end. A step with ways out is followed by a
 * decision whose branches leave to the right, each to the column of the ways
 * out, where the box says when it happens and, under a line, what then
 * happens, which ends there; the flow goes on below it, [else].
 */
export function layoutFlow(diagram: FunctionalDiagram, flow: DiagramFlow): FlowLayout {
	const laneList = flowLanes(diagram, flow);
	const lanes: FlowLane[] = laneList.map((l, i) => ({ ...l, x: i * LANE_W, w: LANE_W, lines: wrapText(l.name, LANE_W - 48, 3) }));
	const lanesEnd = lanes.length * LANE_W;
	// The header grows to hold the longest name, under «system» for a system.
	const header = Math.max(HEADER_H, ...lanes.map((l) => l.lines.length * 14 + (l.kind === 'system' ? 30 : 18)));
	const laneX = (name: string) => {
		const lane = lanes.find((l) => sameName(l.name, name)) ?? lanes.find((l) => l.name === PRODUCT_LANE)!;
		return lane.x + lane.w / 2;
	};
	const hasExits = flow.steps.some((s) => s.branches.length > 0);
	const exitX = lanesEnd + EXIT_GAP;
	const nodes: FlowNode[] = [];
	const edges: FlowEdge[] = [];
	const headerTop = TITLE_H;
	let y = headerTop + header + 18;
	const firstLane = flow.steps[0]?.lane ?? PRODUCT_LANE;
	nodes.push({ kind: 'start', x: laneX(firstLane), y: y + 8 });
	let previous: { x: number; bottom: number } = { x: laneX(firstLane), bottom: y + 16 };
	y += 16 + ROW_GAP;
	const connect = (to: { x: number; top: number }, label: FlowEdge['label'] = null) => {
		const from = previous;
		const labelAt = label ? { x: from.x + 8, y: from.bottom + 14 } : null;
		if (Math.abs(from.x - to.x) < 1) edges.push({ path: `M${from.x},${from.bottom} V${to.top}`, label, labelAt, exit: false });
		else edges.push({ path: `M${from.x},${from.bottom} V${to.top - ROW_GAP / 2} H${to.x} V${to.top}`, label, labelAt, exit: false });
	};
	let afterDecision = false;
	flow.steps.forEach((step, index) => {
		const x = laneX(step.lane);
		const lines = wrapText(asSentence(step.text), STEP_W - 22, MAX_LINES);
		const uses = linkMark(step.link, step.text, STEP_W - 34);
		const h = Math.max(40, (lines.length + linkLines(uses)) * LINE_H + 18);
		connect({ x, top: y }, afterDecision ? 'else' : null);
		nodes.push({ kind: 'step', step: index, x: x - STEP_W / 2, y, w: STEP_W, h, lines, uses });
		previous = { x, bottom: y + h };
		y += h + ROW_GAP;
		afterDecision = false;
		if (step.branches.length === 0) return;
		// The decision, then each way out on its own row, the first level with the decision.
		connect({ x, top: y });
		const dy = y + DIAMOND;
		nodes.push({ kind: 'decision', step: index, x, y: dy });
		let rowTop = y;
		step.branches.forEach((branch, b) => {
			const when = wrapText(branch.when || '…', EXIT_W - 24, EXIT_LINES);
			const then = wrapText(branch.then || '…', EXIT_W - 40, EXIT_LINES);
			const divider = 22 + when.length * 14 + 6;
			const bh = divider + 8 + then.length * LINE_H + 10;
			const by = b === 0 ? dy - Math.min(bh / 2, DIAMOND + 8) : rowTop;
			nodes.push({ kind: 'exit', step: index, branch: b, branchKind: branch.kind, x: exitX, y: by, w: EXIT_W, h: bh, when, then, divider });
			const midY = by + Math.min(bh / 2, DIAMOND + 8);
			const busX = exitX - BUS_ROOM;
			const path = b === 0 ? `M${x + DIAMOND},${dy} H${exitX}` : `M${x + DIAMOND},${dy} H${busX} V${midY} H${exitX}`;
			edges.push({
				path,
				label: branch.kind === 'refused' ? 'refused' : 'goes_wrong',
				labelAt: b === 0 ? { x: x + DIAMOND + 8, y: dy - 6 } : { x: busX + 6, y: midY - 6 },
				exit: true
			});
			rowTop = by + bh + 12;
		});
		previous = { x, bottom: dy + DIAMOND };
		y = Math.max(dy + DIAMOND, rowTop - 12) + ROW_GAP;
		afterDecision = true;
	});
	const endX = previous.x;
	connect({ x: endX, top: y }, afterDecision ? 'else' : null);
	nodes.push({ kind: 'end', x: endX, y: y + 11 });
	y += 22 + 24;
	return {
		width: hasExits ? exitX + EXIT_W + 34 : lanesEnd,
		height: y,
		headerTop,
		header,
		lanesEnd,
		lanes,
		exits: hasExits ? { x: exitX, w: EXIT_W } : null,
		nodes,
		edges,
		startedBy: startedBy(diagram, flow.useCase)
	};
}

// ------------------------------------------------------------------- states

export interface PlacedState {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly lines: readonly string[];
	readonly initial: boolean;
}
export interface StateEdge {
	readonly index: number;
	readonly path: string;
	/** Where the cause is written: its first line's anchor, centred, and the lines go down from it. */
	readonly labelAt: Point;
	readonly lines: readonly string[];
}
export interface StateLayout {
	readonly width: number;
	readonly height: number;
	readonly initial: Point | null;
	readonly initialEdge: string | null;
	readonly states: readonly PlacedState[];
	readonly edges: readonly StateEdge[];
	/** The ends: a state nothing leaves leads to one (the UML final state). */
	readonly finals: readonly { readonly at: Point; readonly path: string }[];
}

const STATE_W = 168;
const STATE_H = 44;
const MIN_COL_GAP = 130;
const MAX_LABEL_W = 170;
const MIN_ROW_SPACE = 84;
const LEFT = 70;
const LABEL_LINE = 13;
/** The share of a gap a transition to the next column runs straight, after bending: where its cause is written. */
const STRAIGHT = 0.6;

/**
 * A state machine read from where the thing starts, in a frame named after
 * the thing: each state in the column of how many transitions it takes to
 * reach it, those never reached last. A transition to the next column is a
 * curve between them, its cause written beside the curve and never across it;
 * a transition back, within a column or over a column, arcs around the states
 * it would cross. A state nothing leaves leads to the end.
 */
export function layoutMachine(machine: DiagramMachine): StateLayout {
	const index = (name: string) => machine.states.findIndex((s) => sameName(s, name));
	const depth = new Map<number, number>();
	if (machine.states.length > 0) {
		depth.set(0, 0);
		const queue = [0];
		while (queue.length > 0) {
			const at = queue.shift()!;
			for (const t of machine.transitions) {
				if (index(t.from) !== at) continue;
				const to = index(t.to);
				if (to >= 0 && !depth.has(to)) {
					depth.set(to, depth.get(at)! + 1);
					queue.push(to);
				}
			}
		}
	}
	const reachedMax = Math.max(0, ...depth.values());
	machine.states.forEach((_, i) => {
		if (!depth.has(i)) depth.set(i, reachedMax + 1);
	});
	const columns = new Map<number, number[]>();
	machine.states.forEach((_, i) => columns.set(depth.get(i)!, [...(columns.get(depth.get(i)!) ?? []), i]));
	const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
	// A state grows to hold its name, and its row with it (ac-evo-uml-legible).
	const nameLines = machine.states.map((name) => wrapText(name, STATE_W - 20, 3));
	const ROW_SPACE = Math.max(MIN_ROW_SPACE, ...nameLines.map((l) => l.length * LINE_H + 18 + 30));
	const ARC_ROOM = 64;
	const top = TITLE_H + ARC_ROOM;
	/** Where the middle of each state stands, from its row in its column. */
	const centreY = (i: number) => {
		const members = columns.get(depth.get(i)!)!;
		return top + ((tallest - members.length) * ROW_SPACE) / 2 + members.indexOf(i) * ROW_SPACE + STATE_H / 2;
	};
	// The gap after each column is as wide as the causes written in it, so a cause never runs over a state:
	// the whole gap for a straight transition, its straight end for one that bends.
	const labelOf = (trigger: string) => (trigger ? wrapText(trigger, MAX_LABEL_W, 4) : []);
	const colGap = (col: number) =>
		Math.max(
			MIN_COL_GAP,
			...machine.transitions
				.filter((t) => depth.get(index(t.from)) === col && depth.get(index(t.to)) === col + 1)
				.map((t) => {
					const wide = Math.max(0, ...labelOf(t.trigger).map(textWidth));
					return Math.abs(centreY(index(t.from)) - centreY(index(t.to))) < 4 ? wide + 44 : (wide + 20) / STRAIGHT;
				})
		);
	const columnX = new Map<number, number>();
	let cursor = LEFT;
	for (let col = 0; col <= Math.max(0, ...depth.values()); col++) {
		columnX.set(col, cursor);
		cursor += STATE_W + colGap(col);
	}
	const placed: PlacedState[] = machine.states.map((name, i) => {
		const col = depth.get(i)!;
		const members = columns.get(col)!;
		const row = members.indexOf(i);
		const offset = ((tallest - members.length) * ROW_SPACE) / 2;
		const lines = nameLines[i];
		const h = Math.max(STATE_H, lines.length * LINE_H + 18);
		return { name, x: columnX.get(col)!, y: top + offset + row * ROW_SPACE + (STATE_H - h) / 2, w: STATE_W, h, lines, initial: i === 0 };
	});
	const mid = (s: PlacedState) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
	const bezierAt = (t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point => {
		const u = 1 - t;
		return {
			x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
			y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y
		};
	};
	// The curves to the next column leave and reach each state at points spread along its side.
	const forward = machine.transitions
		.map((t, i) => ({ t, i, a: index(t.from), b: index(t.to) }))
		.filter(({ a, b }) => a >= 0 && b >= 0 && a !== b && depth.get(b) === depth.get(a)! + 1);
	const sideSlot = (state: number, side: 'out' | 'in', transition: number): number => {
		const s = placed[state];
		const mine = forward
			.filter((f) => (side === 'out' ? f.a === state : f.b === state))
			.sort((p, q) => mid(placed[side === 'out' ? p.b : p.a]).y - mid(placed[side === 'out' ? q.b : q.a]).y || p.i - q.i);
		const slots = mine.length === 1 ? [s.y + s.h / 2] : spreadBetween(s.y + 6, s.y + s.h - 6, mine.length);
		return slots[mine.findIndex((f) => f.i === transition)] ?? s.y + s.h / 2;
	};
	const seen = new Map<string, number>();
	let lowest = top + tallest * ROW_SPACE;
	let highest = top;
	const edges: StateEdge[] = machine.transitions.flatMap((t, i) => {
		const ai = index(t.from);
		const bi = index(t.to);
		const a = placed[ai];
		const b = placed[bi];
		if (!a || !b) return [];
		const pair = `${ai}>${bi}`;
		const nth = seen.get(pair) ?? 0;
		seen.set(pair, nth + 1);
		const lines = labelOf(t.trigger);
		const ca = mid(a);
		const cb = mid(b);
		const da = depth.get(ai)!;
		const db = depth.get(bi)!;
		const tall = lines.length * LABEL_LINE;
		let p0: Point, p1: Point, p2: Point, p3: Point, labelAt: Point;
		if (a === b) {
			// Back to itself: a loop over the state, its cause above the loop.
			p0 = { x: ca.x - 14, y: a.y };
			p3 = { x: ca.x + 14, y: a.y };
			p1 = { x: ca.x - 44, y: a.y - 52 - nth * 14 };
			p2 = { x: ca.x + 44, y: a.y - 52 - nth * 14 };
			const apex = bezierAt(0.5, p0, p1, p2, p3);
			labelAt = { x: apex.x, y: apex.y - 8 - tall };
			highest = Math.min(highest, labelAt.y - 6);
		} else if (db === da + 1) {
			// It bends first, then runs straight into the state, its cause written over (or, going down, under) the straight run.
			p0 = { x: a.x + a.w, y: sideSlot(ai, 'out', i) + nth * 6 };
			p3 = { x: b.x, y: sideSlot(bi, 'in', i) + nth * 6 };
			const gap = p3.x - p0.x;
			const bend = p0.x + gap * (1 - STRAIGHT);
			const straightCentre = (bend + p3.x) / 2;
			const down = p3.y > p0.y + 4;
			const path =
				Math.abs(p3.y - p0.y) < 4
					? `M${p0.x},${p0.y} H${p3.x}`
					: `M${p0.x},${p0.y} C${p0.x + gap * 0.22},${p0.y} ${p0.x + gap * 0.18},${p3.y} ${bend},${p3.y} H${p3.x}`;
			const centre = Math.abs(p3.y - p0.y) < 4 ? (p0.x + p3.x) / 2 : straightCentre;
			labelAt = down ? { x: centre, y: p3.y + 15 } : { x: centre, y: p3.y - 8 - (tall - LABEL_LINE) };
			return [{ index: i, path, labelAt, lines }];
		} else if (db > da + 1) {
			// Forward over a column: an arc above, its cause over the arc.
			const lift = Math.min(a.y, b.y) - 44 - nth * 16;
			p0 = { x: ca.x, y: a.y };
			p3 = { x: cb.x, y: b.y };
			p1 = { x: ca.x, y: lift };
			p2 = { x: cb.x, y: lift };
			const apex = bezierAt(0.5, p0, p1, p2, p3);
			labelAt = { x: apex.x, y: apex.y - 8 - (tall - LABEL_LINE) };
			highest = Math.min(highest, labelAt.y - 14);
		} else {
			// Back, or within a column: an arc below, its cause under the arc.
			const drop = Math.max(a.y + a.h, b.y + b.h) + 46 + nth * 16 + (da === db ? 0 : 10);
			p0 = { x: ca.x + (da === db ? 20 : 0), y: a.y + a.h };
			p3 = { x: cb.x + (da === db ? 20 : 0), y: b.y + b.h };
			p1 = { x: p0.x + (da === db ? 70 : 0), y: drop };
			p2 = { x: p3.x + (da === db ? 70 : 0), y: drop };
			const bottom = bezierAt(0.5, p0, p1, p2, p3);
			labelAt = { x: bottom.x, y: bottom.y + 16 };
			lowest = Math.max(lowest, labelAt.y + tall);
		}
		return [{ index: i, path: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`, labelAt, lines }];
	});
	const finals =
		machine.states.length < 2
			? []
			: placed
					.filter((s) => !machine.transitions.some((t) => sameName(t.from, s.name) && !sameName(t.to, s.name)))
					.map((s) => {
						const at = { x: s.x + s.w + 46, y: s.y + s.h / 2 };
						return { at, path: `M${s.x + s.w},${at.y} H${at.x - 11}` };
					});
	// Everything moves down when a cause or an arc reaches above the room left for it.
	const shift = Math.max(0, TITLE_H + 10 - highest);
	const moved = <T extends { x: number; y: number }>(p: T): T => ({ ...p, y: p.y + shift });
	const shiftPath = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, yy) => `${x},${Number(yy) + shift}`);
	const first = placed[0];
	const states = shift === 0 ? placed : placed.map(moved);
	const right = Math.max(LEFT + STATE_W + 40, ...states.map((s) => s.x + s.w + 90), ...edges.map((e) => e.labelAt.x + MAX_LABEL_W / 2));
	return {
		width: right,
		height: Math.max(lowest + shift + 40, ...states.map((s) => s.y + s.h + 40)),
		initial: first ? { x: 26, y: first.y + first.h / 2 + shift } : null,
		initialEdge: first ? `M34,${first.y + first.h / 2 + shift} H${first.x}` : null,
		states,
		edges: shift === 0 ? edges : edges.map((e) => ({ ...e, path: shiftPath(e.path), labelAt: moved(e.labelAt) })),
		finals: shift === 0 ? finals : finals.map((f) => ({ at: moved(f.at), path: shiftPath(f.path) }))
	};
}
