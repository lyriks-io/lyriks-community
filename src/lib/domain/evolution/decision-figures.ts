import { COHERENCE_AXES, IMPACT_SECTIONS, type CoherenceAxis, type ImpactHypothesis } from './enums';

/**
 * The figures a person decides on (ac-evo-scores-charts).
 *
 * Every figure here is a COUNT a person can act on, never a score: what the
 * request decided itself, how much moves and how far, where the findings sit,
 * how the code stands against the frozen version, and who the board waits on.
 * Each part carries the tone of the dossier's colour law (green holds, amber a
 * person decides, red blocks, blue not there yet, grey already there before),
 * so a chart and the list beside it always read alike. Parts of a whole are
 * drawn as one bar, never a pie: a pie of two slices says nothing and two pies
 * cannot be compared side by side.
 */
export type FigureTone = 'ok' | 'decide' | 'blocks' | 'todo' | 'before';

export interface FigurePart {
	readonly key: string;
	readonly label: string;
	readonly count: number;
	readonly tone: FigureTone;
}

/* ------------------------------------------------------------------- impact */

export interface ImpactFindingLike {
	readonly nodeId: string;
	readonly label: string;
	readonly section: string;
	readonly verb: string;
	readonly depth: number;
	readonly kind?: string;
	readonly from?: string;
	readonly via?: string;
	readonly note?: string;
}

export interface ImpactRow {
	readonly nodeId: string;
	readonly label: string;
	readonly section: string;
	readonly verb: string;
	readonly depth: number;
	readonly via?: string;
	readonly note: string;
}

/**
 * One row per node that moves, read from the walk the request asks for
 * (d17092da): the walk declared by the draft standing for the feature the node
 * was reached from, or, for a node no such walk reached, the walk of what the
 * request does overall. A core is where things live, not something that moves,
 * so it is left out.
 */
export function impactRows(
	walks: Readonly<Record<ImpactHypothesis, { readonly findings: readonly ImpactFindingLike[] }>>,
	proposes: { readonly byLeaf: Readonly<Record<string, ImpactHypothesis>>; readonly main: ImpactHypothesis }
): ImpactRow[] {
	const hypotheses: ImpactHypothesis[] = ['add', 'change', 'remove'];
	const own = (hypothesis: ImpactHypothesis, f: ImpactFindingLike) =>
		hypothesis === ((f.from && proposes.byLeaf[f.from]) || proposes.main);
	const ownNodes = new Set<string>();
	for (const h of hypotheses) for (const f of walks[h].findings) if (own(h, f)) ownNodes.add(f.nodeId);
	const byNode = new Map<string, ImpactRow>();
	for (const h of hypotheses) {
		for (const f of walks[h].findings) {
			if (f.kind === 'core') continue;
			const readHere = own(h, f) || (!ownNodes.has(f.nodeId) && h === proposes.main);
			if (!readHere || byNode.has(f.nodeId)) continue;
			byNode.set(f.nodeId, {
				nodeId: f.nodeId,
				label: f.label,
				section: f.section,
				verb: f.verb,
				depth: f.depth,
				via: f.via,
				note: f.note ?? ''
			});
		}
	}
	return [...byNode.values()];
}

/** The tone of what the request does to what it touches itself: blue adds, amber changes, red removes. */
export const PROPOSES_TONE: Record<ImpactHypothesis, FigureTone> = { add: 'todo', change: 'decide', remove: 'blocks' };

export interface ImpactBar {
	readonly code: string;
	readonly label: string;
	/** What the change touches itself. */
	readonly direct: number;
	/** What it only reaches, one link or more further. */
	readonly reached: number;
}

/**
 * What moves, one bar per section, split between what the change touches
 * itself and what it only reaches further (ac-evo-imp-section-bars). Sections
 * where nothing moves are left out; the order is the report's own.
 */
export function impactBars(rows: readonly Pick<ImpactRow, 'section' | 'depth'>[]): ImpactBar[] {
	return IMPACT_SECTIONS.map((s) => {
		const inSection = rows.filter((r) => r.section === s.code);
		return {
			code: s.code,
			label: s.label,
			direct: inSection.filter((r) => r.depth <= 1).length,
			reached: inSection.filter((r) => r.depth > 1).length
		};
	}).filter((b) => b.direct + b.reached > 0);
}

/**
 * How far the change ripples (ac-evo-imp-depth-histogram): touched directly,
 * one link further, two links or more. A change whose weight sits on the left
 * stays local; weight on the right is what surprises a team in review.
 */
export function rippleDepth(rows: readonly Pick<ImpactRow, 'depth'>[]): { key: string; label: string; count: number }[] {
	return [
		{ key: 'direct', label: 'Touched directly', count: rows.filter((r) => r.depth <= 1).length },
		{ key: 'one', label: 'One link further', count: rows.filter((r) => r.depth === 2).length },
		{ key: 'more', label: 'Two links or more', count: rows.filter((r) => r.depth >= 3).length }
	];
}

/**
 * The sentence under the ripple chart, in everyday words (ac-evo-imp-depth-histogram):
 * what the three counts mean for a reader who never opened the spec.
 */
export function rippleReading(buckets: readonly { count: number }[]): string | undefined {
	const [direct = 0, one = 0, more = 0] = buckets.map((b) => b.count);
	if (direct + one + more === 0) return undefined;
	if (one + more === 0) return 'The change only affects what it touches directly. Nothing further away is affected.';
	if (more > direct) return 'Most of what is affected is two or more links away from the change: these are the easy ones to miss, check them.';
	return 'Most of what is affected is touched directly by the change; a few things further away are affected too.';
}

/**
 * Whether the change stays local (ac-evo-imp-proportional): every point fits,
 * nothing is reached beyond what it touches directly, the request brings no
 * coherence finding of its own and no proof gets worse. Such a change reads as
 * its verdict and what it touches, its details folded until someone asks.
 */
export function impactStaysLocal(reading: {
	readonly misfits: number;
	readonly rows: readonly Pick<ImpactRow, 'depth'>[];
	readonly ownFindings: number;
	readonly proofsWorse: boolean;
}): boolean {
	return reading.misfits === 0 && reading.rows.every((r) => r.depth <= 1) && reading.ownFindings === 0 && !reading.proofsWorse;
}

/* ---------------------------------------------------------------- coherence */

export interface CoherenceFindingLike {
	readonly axis: string;
	readonly severity: string;
	readonly scope?: string;
	readonly risk?: unknown;
}

export interface CoherenceGridRow {
	readonly axis: CoherenceAxis;
	readonly label: string;
	readonly blocking: number;
	readonly major: number;
	readonly minor: number;
	/** What the product already carried before the request: never holds it. */
	readonly before: number;
}

/**
 * The findings counted by axis and severity (ac-evo-coh-grid). A blocking
 * finding a person accepted as a known risk rubs instead of colliding
 * (ac-evo-coh-risk), so it is counted with the major ones. What the product
 * already carried has its own column. Every axis is a row, so an empty axis
 * reads as checked and clean rather than forgotten.
 */
export function coherenceGrid(findings: readonly CoherenceFindingLike[]): CoherenceGridRow[] {
	return COHERENCE_AXES.map((a) => {
		const onAxis = findings.filter((f) => f.axis === a.code);
		const own = onAxis.filter((f) => f.scope !== 'inherited');
		return {
			axis: a.code,
			label: a.label,
			blocking: own.filter((f) => f.severity === 'blocking' && !f.risk).length,
			major: own.filter((f) => f.severity === 'major' || (f.severity === 'blocking' && !!f.risk)).length,
			minor: own.filter((f) => f.severity === 'minor').length,
			before: onAxis.length - own.length
		};
	});
}

/* ------------------------------------------------------------------- report */

export interface ReportLineLike {
	readonly verdict: string;
	readonly decision: string;
	readonly scope?: string;
}

/**
 * The report's lines as a person reads them (ac-evo-impl-layout): what waits on
 * someone now (a line the code does not prove and nobody decided, or one sent
 * back to the build); what is settled, proved by the code or decided by a
 * person, behind one count; and apart what the touched features already held
 * at the first freeze, so their backlog never reads as the request's.
 */
export function reportReading<L extends ReportLineLike>(lines: readonly L[]): { waiting: L[]; settled: L[]; before: L[] } {
	const own = lines.filter((l) => l.scope !== 'inherited');
	const waits = (l: L) => l.decision === 'invalidated' || (l.decision === 'undecided' && l.verdict !== 'conform');
	return { waiting: own.filter(waits), settled: own.filter((l) => !waits(l)), before: lines.filter((l) => l.scope === 'inherited') };
}

/* -------------------------------------------------------------------- board */

export type WaitsOn = 'person' | 'code' | 'author';

export interface BoardCardLike {
	readonly status: string;
	readonly stage: string;
	readonly step: string;
	readonly pendingProposals: number;
	readonly blockingFindings: number;
	readonly undecidedLines: number;
	readonly linesToBuild?: number;
	readonly acceptanceDebt: number;
	readonly stepSince?: string | null;
}

const FROZEN_STAGES = new Set(['implementation', 'acceptance', 'delivered']);

/**
 * Who a request waits on (ac-evo-board-overview). A person when something is
 * theirs to decide: a collision, a value to sign, a report line, a remark, the
 * freeze, the approval, the declaration that it is live. The code when the
 * Build has lines still to build and nothing to decide. Its author while the
 * need, the solution and the behaviour are still being written.
 */
export function waitsOn(card: BoardCardLike): WaitsOn {
	const toBuild = card.linesToBuild ?? 0;
	if (card.pendingProposals > 0 || card.acceptanceDebt > 0) return 'person';
	if (card.blockingFindings > 0 && !FROZEN_STAGES.has(card.stage)) return 'person';
	if (card.stage === 'implementation') return card.undecidedLines - toBuild > 0 ? 'person' : 'code';
	if (card.stage === 'acceptance' || card.stage === 'delivered' || card.step === 'impact_analysis') return 'person';
	return 'author';
}

export const WAITS_ON_LABEL: Record<WaitsOn, string> = {
	person: 'Waiting on a person',
	code: 'Waiting on the code',
	author: 'Being written'
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long the open requests have stood at their current step, in four spans
 * a person reads at once: under a day, up to a week, up to a month, longer.
 */
export function stepAges(cards: readonly BoardCardLike[], now: Date): { key: string; label: string; count: number }[] {
	const spans = [
		{ key: 'day', label: 'Under a day', upTo: DAY },
		{ key: 'week', label: 'Up to a week', upTo: 7 * DAY },
		{ key: 'month', label: 'Up to a month', upTo: 30 * DAY },
		{ key: 'longer', label: 'Longer', upTo: Infinity }
	];
	const counts = spans.map(() => 0);
	for (const card of cards) {
		if (card.status !== 'open' || !card.stepSince) continue;
		const age = Math.max(0, now.getTime() - Date.parse(card.stepSince));
		if (Number.isNaN(age)) continue;
		counts[spans.findIndex((s) => age < s.upTo)] += 1;
	}
	return spans.map((s, i) => ({ key: s.key, label: s.label, count: counts[i] }));
}

/**
 * When a request last moved a step: it crossed a stage, froze, crossed on a
 * waiver, or someone validated or set aside a step. Its creation otherwise.
 */
export function stepSinceOf(request: {
	readonly createdAt: string;
	readonly history: readonly { readonly type: string; readonly recordedAt: string }[];
	readonly stepValidations: readonly { readonly validations: readonly { readonly at: string }[] }[];
	readonly skippedSteps?: readonly { readonly at?: string }[];
}): string {
	const moves = [
		request.createdAt,
		...request.history.filter((h) => h.type === 'stage_crossing' || h.type === 'spec_frozen' || h.type === 'waiver').map((h) => h.recordedAt),
		...request.stepValidations.flatMap((s) => s.validations.map((v) => v.at)),
		...(request.skippedSteps ?? []).map((s) => s.at ?? '')
	].filter((at) => at !== '' && !Number.isNaN(Date.parse(at)));
	return moves.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest), moves[0] ?? request.createdAt);
}

/* -------------------------------------------------------------- the purpose */

export interface NeedFieldLike {
	readonly path: string;
	readonly value: string;
	readonly filled: boolean;
}

/** Several answers read as sentences: each closed once, never ".;" nor "..". */
const sentences = (items: readonly string[]) => items.map((i) => (/[.!?]$/.test(i) ? i : `${i}.`)).join(' ');

const lines = (value: string) =>
	value
		.split('\n')
		.map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
		.filter((l) => l !== '');

export interface ParsedMeasure {
	readonly what: string;
	readonly today: string;
	readonly target: string;
}

/**
 * A measure written as "what: today -> target" (ac-evo-need-measure-shape),
 * read as its three parts; any other line is null and reads as written.
 * "->" and "→" both mark the target.
 */
export function parseMeasure(line: string): ParsedMeasure | null {
	const match = /^(.+?)\s*:\s*(.+?)\s*(?:->|→)\s*(.+?)\.?$/.exec(line.trim());
	if (!match) return null;
	const [, what, today, target] = match;
	return what && today && target ? { what: what.trim(), today: today.trim(), target: target.trim() } : null;
}

/**
 * What the change was for (ac-evo-walk-measures): its objectives and the
 * measures that tell whether it worked. Read at Approval and once it is live.
 * A missing measure is said, never a gate.
 */
export function purposeOf(needFields: readonly NeedFieldLike[]): {
	objectives: string[];
	measures: string[];
	cost: string | null;
	situation: string | null;
} {
	const value = (suffix: string) => needFields.find((f) => f.path.endsWith(suffix) && f.filled)?.value ?? '';
	return {
		objectives: lines(value('.objectives')),
		measures: lines(value('.measures')),
		cost: value('.cost').trim() || null,
		situation: value('.situation').trim() || null
	};
}

/* ------------------------------------------------------------ decision card */

export type DecisionQuestion = 'value' | 'size' | 'risk';

/** One line of a Details panel: what it is, why, and its tone. */
export interface DetailItem {
	readonly label: string;
	readonly note?: string;
	readonly tone?: FigureTone;
}

/** A group of a Details panel, titled. */
export interface DetailGroup {
	readonly title: string;
	readonly tone?: FigureTone;
	readonly items: readonly DetailItem[];
	/** Measures in the shape what / today / target, drawn as three columns (ac-evo-need-measure-shape). */
	readonly measures?: readonly ParsedMeasure[];
}

export interface DecisionAnswer {
	readonly key: DecisionQuestion;
	/** The question, as a person deciding asks it. */
	readonly question: string;
	/** The answer in a few words, or when it will be known. */
	readonly answer: string;
	/** One line of support, or null. */
	readonly detail: string | null;
	readonly tone: FigureTone;
	/** Whether a person stands behind the answer (Worth it): null where it does not apply. */
	readonly validation?: { readonly validated: boolean; readonly text: string } | null;
	/** What the Details link unfolds (ac-evo-form-decision-details); empty when there is nothing to explain. */
	readonly details: readonly DetailGroup[];
}

export interface MissingPiece {
	readonly key: 'why' | 'cost' | 'measure' | 'impact';
	readonly label: string;
	/** Where it is answered. */
	readonly step: 'need' | 'impact_analysis';
}

export interface GraphNodeLike {
	readonly kind: string;
	readonly label: string;
	readonly status: string;
	/** The element's own id, when the operation names one. */
	readonly id?: string;
	/** The action and the screen it belongs to (ac-evo-draft-changes-named). */
	readonly in?: string;
}

/** The element an operation of the behaviour batch writes, by the suffix of its kind. */
const OPERATION_ELEMENT: Record<string, string> = {
	surface: 'surface',
	action: 'action',
	action_rule: 'rule',
	rule: 'rule',
	surface_rule: 'rule',
	state: 'state',
	state_definition: 'state',
	invariant: 'invariant',
	surface_invariant: 'invariant',
	transition: 'transition',
	event: 'event',
	scenario: 'scenario',
	effect: 'effect',
	parameter: 'parameter',
	entity: 'entity'
};

/** Where an operation names the element it writes, by element kind. */
const ELEMENT_ID_KEY: Record<string, string> = {
	surface: 'surfaceId',
	action: 'actionId',
	rule: 'ruleId',
	state: 'path',
	invariant: 'invariantId',
	transition: 'transitionId',
	event: 'eventId',
	scenario: 'scenarioId',
	effect: 'effectId',
	parameter: 'parameterId',
	entity: 'entityId'
};

type Op = Record<string, unknown>;
const words = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const sub = (v: unknown): Op => (v && typeof v === 'object' ? (v as Op) : {});

/**
 * What the drafts of a request create, change and remove, read from the
 * operations they carry, written or not. A request already made official reads
 * its graph all grey, because the feature now holds the change; its operations
 * still say what it did, so its size never falls to nothing.
 *
 * Each element is named, never read by its kind alone (ac-evo-draft-changes-named):
 * by the words the operation carries, else by the name the feature it amends
 * gives that id (`namesOf`, keyed by feature), with its id and the action and
 * screen it sits in.
 */
export function draftChangeNodes(
	drafts: readonly {
		readonly kind: string;
		readonly name?: string;
		readonly baseLeafId?: string | null;
		readonly behaviourModel?: { readonly operations: readonly Record<string, unknown>[]; readonly landed?: { readonly operations: readonly Record<string, unknown>[] } };
	}[],
	namesOf: (leafId: string) => Readonly<Record<string, { readonly name: string; readonly in?: string }>> | undefined = () => undefined
): GraphNodeLike[] {
	const out: GraphNodeLike[] = [];
	for (const draft of drafts) {
		if (draft.kind === 'add') out.push({ kind: 'feature', label: draft.name || 'New feature', status: 'added' });
		if (draft.kind === 'remove') out.push({ kind: 'feature', label: draft.baseLeafId ?? 'Feature', status: 'removed' });
		const known = (draft.baseLeafId ? namesOf(draft.baseLeafId) : undefined) ?? {};
		const ops = [...(draft.behaviourModel?.landed?.operations ?? []), ...(draft.behaviourModel?.operations ?? [])];
		for (const op of ops) {
			const match = /^(add|update|remove)_(.+)$/.exec(String(op.kind ?? op.op ?? ''));
			if (!match) continue;
			const kind = OPERATION_ELEMENT[match[2]];
			if (!kind) continue;
			const id = words(op[ELEMENT_ID_KEY[kind]]) ?? (kind === 'state' ? undefined : words(op.id));
			const patch = sub(op.patch);
			// What the operation itself says: a new element's words, or what an update makes of it.
			const said = [
				op.name,
				op.text,
				op.path,
				op.title,
				sub(op.rule).description,
				sub(op.effect).description,
				patch.name,
				patch.description,
				patch.text,
				sub(patch.effect).reason,
				sub(sub(op.rule).effect).reason,
				op.description
			]
				.map(words)
				.find((v) => v !== undefined);
			const existing = id ? known[id] : undefined;
			// An element that exists reads by the name people know it by; a new one by its own words.
			const label = (match[1] === 'add' ? (said ?? existing?.name) : (existing?.name ?? said)) ?? (id ? `${kind} ${id}` : kind);
			const holder = [kind === 'action' || kind === 'surface' ? undefined : words(op.actionId), kind === 'surface' ? undefined : words(op.surfaceId)]
				.filter((h): h is string => h !== undefined)
				.map((h) => known[h]?.name ?? h);
			const where = existing?.in ?? (holder.length > 0 ? holder.join(' · ') : undefined);
			out.push({
				kind,
				label,
				status: match[1] === 'add' ? 'added' : match[1] === 'remove' ? 'removed' : 'changed',
				...(id ? { id } : {}),
				...(where ? { in: where } : {})
			});
		}
	}
	return out;
}

export type SizeRank = 'Small' | 'Medium' | 'Large' | 'Very large';

const KIND_WORD: Record<string, [string, string]> = {
	feature: ['feature', 'features'],
	surface: ['screen', 'screens'],
	action: ['action', 'actions'],
	rule: ['rule', 'rules'],
	state: ['state', 'states'],
	invariant: ['invariant', 'invariants'],
	transition: ['transition', 'transitions'],
	event: ['event', 'events'],
	scenario: ['scenario', 'scenarios'],
	effect: ['effect', 'effects'],
	parameter: ['parameter', 'parameters'],
	entity: ['table', 'tables'],
	field: ['field', 'fields']
};
const kindWord = (kind: string, n: number) => (KIND_WORD[kind] ?? [kind, `${kind}s`])[n === 1 ? 0 : 1];
/** What creating or removing an element weighs; changing one weighs half, a feature changed weighs nothing (its content counts). */
const CREATE_WEIGHT: Record<string, number> = { feature: 8, surface: 4, entity: 3, action: 3, rule: 1, state: 1, invariant: 1, transition: 1, event: 1, scenario: 0.5, effect: 0.5, parameter: 0.5 };
const SECTION_WEIGHT: Record<string, number> = { entities_and_fields: 3, screens_and_journeys: 2, permissions: 2, code: 1 };
const RANKS: readonly { rank: SizeRank; upTo: number }[] = [
	{ rank: 'Small', upTo: 5 },
	{ rank: 'Medium', upTo: 15 },
	{ rank: 'Large', upTo: 35 },
	{ rank: 'Very large', upTo: Infinity }
];

/**
 * How big a request is, as a rank (ac-evo-form-decision-size-rank): what it
 * creates, changes and removes in the behaviour model, weighted by what each
 * costs (a screen created costs more than a rule changed), plus the data,
 * permissions and code the impact moves and, lightly, what it only reaches.
 * The points stay visible in the Details so the rank is never a black box.
 */
export function sizeRank(
	nodes: readonly GraphNodeLike[],
	rows: readonly Pick<ImpactRow, 'section' | 'depth' | 'label'>[]
): { rank: SizeRank; points: number; created: number; changed: number; removed: number; reasons: string[] } {
	const own = nodes.filter((n) => n.kind !== 'core' && (n.status === 'added' || n.status === 'changed' || n.status === 'removed'));
	const reasons: string[] = [];
	let points = 0;
	for (const status of ['added', 'removed', 'changed'] as const) {
		const byKind = new Map<string, number>();
		for (const n of own.filter((x) => x.status === status)) byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);
		for (const [kind, n] of byKind) {
			const weight = status === 'changed' ? (kind === 'feature' ? 0 : Math.max(1, (CREATE_WEIGHT[kind] ?? 1) / 2)) : (CREATE_WEIGHT[kind] ?? 1);
			if (weight === 0) continue;
			points += weight * n;
			reasons.push(`${n} ${kindWord(kind, n)} ${status === 'added' ? 'created' : status} (${weight * n})`);
		}
	}
	for (const [section, weight] of Object.entries(SECTION_WEIGHT)) {
		const n = rows.filter((r) => r.section === section).length;
		if (n === 0) continue;
		points += weight * n;
		const label = IMPACT_SECTIONS.find((s) => s.code === section)?.label.toLowerCase() ?? section;
		reasons.push(`${n} in ${label} (${weight * n})`);
	}
	const reached = rows.filter((r) => r.depth > 1).length;
	if (reached > 0) {
		points += reached / 2;
		reasons.push(`${reached} reached further (${reached / 2})`);
	}
	return {
		rank: RANKS.find((r) => points <= r.upTo)!.rank,
		points,
		created: own.filter((n) => n.status === 'added').length,
		changed: own.filter((n) => n.status === 'changed' && n.kind !== 'feature').length,
		removed: own.filter((n) => n.status === 'removed').length,
		reasons
	};
}

/**
 * The decision card a request opens on (ac-evo-form-decision-brief): three
 * questions a person decides on, worth it, how big, how risky, each with the
 * Details that explain it (ac-evo-form-decision-details), and what is still
 * missing to decide. Nothing the page already says is repeated on the tiles.
 */
export function decisionReading(input: {
	readonly need: readonly (NeedFieldLike & { readonly validated?: boolean; readonly label?: string })[];
	readonly impactRan: boolean;
	readonly rows: readonly ImpactRow[];
	/** The request's own graph, once read; null while it loads. */
	readonly graph: readonly GraphNodeLike[] | null;
	/** What the drafts' operations create, change and remove: read when the graph shows no difference. */
	readonly changes?: readonly GraphNodeLike[];
	readonly docking: { readonly collision: number; readonly friction: number; readonly missing_anchor: number; readonly fits: number };
	readonly points: readonly { readonly label: string; readonly qualification: string; readonly reason: string }[];
	readonly findings: readonly { readonly title: string; readonly severity: string; readonly scope?: string; readonly holdsGate?: boolean }[];
}): { headline: string; tone: FigureTone; missing: MissingPiece[]; answers: DecisionAnswer[] } {
	const purpose = purposeOf(input.need);
	const missing: MissingPiece[] = [];
	if (!purpose.situation || purpose.objectives.length === 0) missing.push({ key: 'why', label: 'Why it matters', step: 'need' });
	if (!purpose.cost) missing.push({ key: 'cost', label: 'What it costs today', step: 'need' });
	if (purpose.measures.length === 0) missing.push({ key: 'measure', label: 'A measure of success', step: 'need' });
	if (!input.impactRan) missing.push({ key: 'impact', label: 'The impact', step: 'impact_analysis' });

	// Worth it: the targets, what the problem costs, and whether a person stands behind them.
	const field = (suffix: string) => input.need.find((f) => f.path.endsWith(suffix));
	const weighed = ['.situation', '.cost', '.objectives', '.measures'].map(field).filter((f): f is NonNullable<typeof f> => !!f && f.filled);
	const unvalidated = weighed.filter((f) => !f.validated);
	const NAMES: Record<string, string> = { situation: 'situation', cost: 'cost', objectives: 'objectives', measures: 'measures' };
	const nameOf = (f: { path: string; label?: string }) => (f.label ?? NAMES[f.path.split('.').pop() ?? ''] ?? f.path).toLowerCase();
	const valueDetails: DetailGroup[] = [
		{ title: 'Today', items: [
			...(purpose.situation ? [{ label: purpose.situation, note: field('.situation')?.validated ? 'Validated' : 'Not validated', tone: (field('.situation')?.validated ? 'ok' : 'decide') as FigureTone }] : []),
			purpose.cost
				? { label: `Costs: ${purpose.cost}`, note: field('.cost')?.validated ? 'Validated' : 'Not validated', tone: (field('.cost')?.validated ? 'ok' : 'decide') as FigureTone }
				: { label: 'What it costs today is not said.', tone: 'decide' as FigureTone }
		] },
		{ title: 'What should be true', items: purpose.objectives.length > 0 ? purpose.objectives.map((o) => ({ label: o })) : [{ label: 'No objective yet.', tone: 'decide' as FigureTone }] },
		{
			title: 'How we will know',
			measures: purpose.measures.map(parseMeasure).filter((m): m is ParsedMeasure => m !== null),
			items:
				purpose.measures.length === 0
					? [{ label: 'No measure: nobody will be able to tell whether it worked.', tone: 'decide' as FigureTone }]
					: [
							...purpose.measures.filter((m) => !parseMeasure(m)).map((m) => ({ label: m })),
							{ label: field('.measures')?.validated ? 'Validated' : 'Not validated', tone: (field('.measures')?.validated ? 'ok' : 'decide') as FigureTone }
						]
		}
	];
	const notSaid = missing.filter((m) => m.key === 'why' || m.key === 'cost').map((m) => m.label.toLowerCase());
	const value: DecisionAnswer = {
		key: 'value',
		question: 'Worth it?',
		answer:
			purpose.measures.length > 0
				? `${purpose.measures.length} measurable ${purpose.measures.length === 1 ? 'target' : 'targets'}`
				: 'No measure of success',
		// Every piece of its own still missing is named on the tile, as the sentence on top names it.
		detail: [
			purpose.cost ? `Costs today: ${purpose.cost}` : null,
			notSaid.length > 0 ? `Not said yet: ${notSaid.join(', ')}.` : null
		]
			.filter((t): t is string => t !== null)
			.join(' '),
		// Green only once a person stands behind it: an answer nobody validated is still to decide.
		tone: purpose.measures.length > 0 && purpose.cost && weighed.every((f) => f.validated) ? 'ok' : 'decide',
		validation:
			weighed.length === 0
				? null
				: unvalidated.length === 0
					? { validated: true, text: 'Validated' }
					: { validated: false, text: `Not validated: ${unvalidated.map(nameOf).join(', ')}` },
		details: valueDetails
	};

	// How big: a rank, from what the request creates, changes and removes.
	// A changed feature only says the request touches it; what moves is inside it.
	const isOwn = (n: GraphNodeLike) => n.kind !== 'core' && n.kind !== 'feature' && ['added', 'changed', 'removed'].includes(n.status);
	const changes = input.changes ?? [];
	const nodes = input.graph && input.graph.some(isOwn) ? input.graph : changes.length > 0 ? changes : input.graph;
	const sized = nodes ? sizeRank(nodes, input.rows) : null;
	const own = (nodes ?? []).filter((n) => n.kind !== 'core' && n.kind !== 'feature' && ['added', 'changed', 'removed'].includes(n.status));
	const listed = (status: string) => {
		const byKind = new Map<string, string[]>();
		for (const n of own.filter((x) => x.status === status)) byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n.label]);
		return [...byKind].map(([kind, labels]) => ({ label: `${labels.length} ${kindWord(kind, labels.length)}`, note: labels.join(' · ') }));
	};
	const reachedRows = input.rows.filter((r) => r.depth > 1 || r.section === 'code' || r.section === 'entities_and_fields' || r.section === 'permissions');
	// Nothing moved yet and no impact read: a rank would be read on nothing, so it is not given.
	const size: DecisionAnswer = !input.impactRan && own.length === 0
		? { key: 'size', question: 'How big?', answer: 'Not known yet', detail: 'Read at the Impact analysis.', tone: 'todo', details: [] }
		: !sized
		? { key: 'size', question: 'How big?', answer: 'Reading it…', detail: null, tone: 'todo', details: [] }
		: {
				key: 'size',
				question: 'How big?',
				answer: `${sized.rank} change`,
				detail: `${sized.created} created · ${sized.changed} changed · ${sized.removed} removed${input.impactRan ? '' : '; the data and code it moves are read at the Impact analysis'}`,
				tone: sized.rank === 'Very large' ? 'decide' : 'ok',
				details: [
					{ title: 'Created', tone: 'todo' as FigureTone, items: listed('added') },
					{ title: 'Changed', tone: 'decide' as FigureTone, items: listed('changed') },
					{ title: 'Removed', tone: 'blocks' as FigureTone, items: listed('removed') },
					{ title: 'Also moves', tone: 'before' as FigureTone, items: reachedRows.map((r) => ({ label: r.label, note: IMPACT_SECTIONS.find((s) => s.code === r.section)?.label })) },
					{ title: `Why ${sized.rank.toLowerCase()}`, items: [{ label: `${sized.points} points: ${sized.reasons.join(', ') || 'nothing weighs'}.`, note: 'Small up to 5, Medium up to 15, Large up to 35.' }] }
				].filter((g: DetailGroup) => g.items.length > 0) as DetailGroup[]
			};

	// Risky: whether it fits, and the findings this request brings, each with why.
	const d = input.docking;
	const ownFindings = input.findings.filter((f) => f.scope !== 'inherited');
	const blockingOwn = ownFindings.filter((f) => f.holdsGate).length;
	const POINT_TONE: Record<string, FigureTone> = { collision: 'blocks', friction: 'decide', missing_anchor: 'todo', fits: 'ok' };
	const POINT_WORD: Record<string, string> = { collision: 'Collides', friction: 'Rubs', missing_anchor: 'Nothing to attach to', fits: 'Fits' };
	const riskDetails: DetailGroup[] = [
		{ title: 'Where it attaches', items: input.points.map((p) => ({ label: `${POINT_WORD[p.qualification] ?? p.qualification} · ${p.label}`, note: p.reason, tone: POINT_TONE[p.qualification] })) },
		{ title: 'Findings this request brings', items: ownFindings.map((f) => ({ label: f.title, note: f.severity, tone: (f.holdsGate ? 'blocks' : 'decide') as FigureTone })) }
	].filter((g) => g.items.length > 0);
	const risk: DecisionAnswer = !input.impactRan
		? { key: 'risk', question: 'Risky?', answer: 'Not known yet', detail: 'Checked at the Impact analysis.', tone: 'todo', details: [] }
		: d.collision > 0 || blockingOwn > 0
			? { key: 'risk', question: 'Risky?', answer: `${d.collision + blockingOwn} ${d.collision + blockingOwn === 1 ? 'collision' : 'collisions'}`, detail: 'It does not fit the product as it stands: settle it before deciding.', tone: 'blocks', details: riskDetails }
			: d.friction > 0 || ownFindings.length > 0
				? { key: 'risk', question: 'Risky?', answer: `${d.friction + ownFindings.length} ${d.friction + ownFindings.length === 1 ? 'point' : 'points'} to settle`, detail: 'It fits, with points a person arbitrates.', tone: 'decide', details: riskDetails }
				: d.missing_anchor > 0
					? { key: 'risk', question: 'Risky?', answer: 'Fits, once anchored', detail: `${d.missing_anchor} ${d.missing_anchor === 1 ? 'piece has' : 'pieces have'} nothing to attach to yet.`, tone: 'todo', details: riskDetails }
					: { key: 'risk', question: 'Risky?', answer: 'Fits', detail: `${d.fits} ${d.fits === 1 ? 'point checked' : 'points checked'}, nothing opposes it.`, tone: 'ok', details: riskDetails };

	const answers = [value, size, risk];
	if (risk.tone === 'blocks') return { headline: 'Not ready to decide: it collides with the product.', tone: 'blocks', missing, answers };
	// Only what a person owes is counted; the impact the platform reads on its own is named apart.
	const owed = missing.filter((m) => m.step === 'need').length;
	if (owed > 0) {
		return { headline: `Not enough to decide yet: ${owed} ${owed === 1 ? 'answer' : 'answers'} missing.`, tone: 'decide', missing, answers };
	}
	if (value.validation && !value.validation.validated) return { headline: 'Everything is answered; the why is not validated yet.', tone: 'decide', missing, answers };
	if (!input.impactRan) return { headline: 'Everything a person owes is answered; the impact is read at the Impact analysis.', tone: 'todo', missing, answers };
	return { headline: 'Everything needed to decide is here.', tone: 'ok', missing, answers };
}
