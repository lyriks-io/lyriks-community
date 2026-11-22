import type { ImpactHypothesis } from './enums';

/**
 * The figures a person decides on (ac-evo-scores-charts).
 *
 * Every figure here is a COUNT a person can act on, never a score: what moves
 * and how far, how the code stands against the frozen version, when a request
 * last moved a step, and what its drafts create, change and remove.
 * Each part carries the tone of the dossier's colour law (green holds, amber a
 * person decides, red blocks, blue not there yet, grey already there before),
 * so a chart and the list beside it always read alike. Parts of a whole are
 * drawn as one bar, never a pie: a pie of two slices says nothing and two pies
 * cannot be compared side by side.
 */
export type FigureTone = 'ok' | 'decide' | 'blocks' | 'todo' | 'before';

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
