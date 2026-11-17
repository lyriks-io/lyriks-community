import { NEED_KEYS, ORIGIN_ANSWER_KEYS, fieldKey } from './blocks';
import { DESCRIBED_STEPS, STEP_QUESTIONS, type EvolutionRequest, type HistoryEntry, type ImplementationFinding } from './draft';
import type { AuthorKind, RequestStage } from './enums';
import { stepAnswerKey, stepDescriptionKey, versionsOf } from './field-versions';
import { skipOf, validationOf, type ValidatedStep } from './path';
import { complianceSentence, requirementCompliance } from './report-compliance';

/**
 * The decision log of a request: every decision taken on it, who took it and
 * why, newest first, so nothing is lost between two meetings.
 *
 * Every entry is read off what the request records, never written for the
 * log: the answers people validated, the freeze of the specification, the
 * risks accepted with their reason, the gates crossed on a waiver, the lines of
 * the verification decided, the approval, the closing and the cancelling. A
 * step nobody stood behind has no entry, and a reason is only ever text the
 * request holds; where it holds none, the entry says what was decided and
 * stops there.
 */

/** The steps of the page a decision belongs to, coloured alike wherever the log is read. */
export const DECISION_KINDS = ['briefing', 'solution', 'specification', 'simulation', 'verification', 'closed', 'cancelled'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** A person behind a decision, and whether they took it through their AI client. */
export interface DecisionPerson {
	readonly id: string;
	readonly throughAi: boolean;
}

export interface DecisionEntry {
	/** Stable across reads: what the decision is about. */
	readonly id: string;
	readonly at: string;
	readonly kind: DecisionKind;
	readonly what: string;
	/** Why, in the words the request holds; empty when it holds none. */
	readonly why: string;
	readonly who: readonly DecisionPerson[];
}

export interface DecisionLogOptions {
	/** Says a text the request stores with the names people read (a draft by its name, never its id). */
	readonly say?: (text: string) => string;
}

const EXCERPT = 160;

/** One paragraph of the request's own words, shortened on a word. */
export function excerpt(text: string, max = EXCERPT): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	const cut = flat.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Standing = { readonly at: string; readonly who: DecisionPerson[] };

function addPerson(who: DecisionPerson[], id: string, kind: AuthorKind): void {
	const throughAi = kind === 'ai_client';
	const known = who.find((p) => p.id === id);
	if (!known) who.push({ id, throughAi });
	// A person who also validated on the page stood behind it themselves.
	else if (known.throughAi && !throughAi) who[who.indexOf(known)] = { id, throughAi: false };
}

const latest = (a: string, b: string) => (a > b ? a : b);
const earliest = (values: readonly string[]) => values.reduce((min, v) => (min === '' || v < min ? v : min), '');

/**
 * When every written answer stood validated, and by whom: each answer's current
 * version holds a validation its latest verdict did not refuse. Null when an
 * answer still waits, or when nothing was written.
 */
function answersStanding(request: EvolutionRequest, keys: readonly string[]): Standing | null {
	const written = keys.map((key) => versionsOf(request, key)[0]).filter((v) => v !== undefined && v.value.trim() !== '');
	if (written.length === 0) return null;
	let at = '';
	const who: DecisionPerson[] = [];
	for (const version of written) {
		const verdicts = request.fieldValidations.filter((v) => v.key === version.key && v.versionId === version.id);
		if (verdicts.length === 0 || verdicts[verdicts.length - 1].verdict === 'refused') return null;
		const given = verdicts.filter((v) => v.verdict !== 'refused');
		at = latest(at, earliest(given.map((v) => v.at)));
		for (const v of given) addPerson(who, v.by, v.byKind);
	}
	return { at, who };
}

/** When every step asked of the group stood validated as a whole; a step marked not applicable asks nothing. */
function stepsStanding(request: EvolutionRequest, steps: readonly ValidatedStep[]): Standing | null {
	const asked = steps.filter((step) => skipOf(request, step) === null);
	if (asked.length === 0) return null;
	let at = '';
	const who: DecisionPerson[] = [];
	for (const step of asked) {
		const given = validationOf(request, step).validations;
		if (given.length === 0) return null;
		at = latest(at, earliest(given.map((v) => v.at)));
		for (const v of given) addPerson(who, v.by, v.kind);
	}
	return { at, who };
}

/** A group of the page stands validated answer by answer, or step by step: the first of the two that held. */
function groupStanding(request: EvolutionRequest, steps: readonly ValidatedStep[], keys: readonly string[]): Standing | null {
	const held = [answersStanding(request, keys), stepsStanding(request, steps)].filter((s): s is Standing => s !== null);
	if (held.length === 0) return null;
	const who: DecisionPerson[] = [];
	for (const s of held) for (const p of s.who) addPerson(who, p.id, p.throughAi ? 'ai_client' : 'person');
	return { at: earliest(held.map((s) => s.at)), who };
}

const BRIEFING_KEYS = [...NEED_KEYS.map((k) => fieldKey(`00-need.${k}`)), ORIGIN_ANSWER_KEYS.requester, ORIGIN_ANSWER_KEYS.origin];
const SOLUTION_STEPS: readonly ValidatedStep[] = ['solution', 'functional_spec', 'technical_spec'];
const SOLUTION_KEYS = [...DESCRIBED_STEPS.map(stepDescriptionKey), ...STEP_QUESTIONS.map((q) => stepAnswerKey(q.step, q.key))];

/** The key answer of the Briefing: what the change aims at, else the situation it starts from. */
function briefingWhy(request: EvolutionRequest): string {
	const { objectives, situation, description } = request.need;
	if (objectives.trim()) return `Objectives: ${excerpt(objectives)}`;
	if (situation.trim()) return `Situation: ${excerpt(situation)}`;
	return excerpt(description);
}

/** What the Solution says it does, and what it leaves out when it says so. */
function solutionWhy(request: EvolutionRequest): string {
	const said = request.stepDescriptions.solution.trim() || request.stepDescriptions.functional_spec.trim();
	const left = (request.stepAnswers.solution?.out_of_scope ?? '').trim();
	return [said ? excerpt(said, left ? 110 : EXCERPT) : '', left ? `Left out: ${excerpt(left, 90)}` : ''].filter(Boolean).join(' ');
}

/** Whether the act recorded at that moment by that author went through their AI client. */
function kindAt(request: EvolutionRequest, types: readonly HistoryEntry['type'][], at: string, by: string): AuthorKind {
	return request.history.find((h) => types.includes(h.type) && h.recordedAt === at && h.authorId === by)?.authorKind ?? 'person';
}

function freezeEntries(request: EvolutionRequest): DecisionEntry[] {
	return request.frozenVersions.map((v) => {
		const subjects = v.snapshot?.subjects ?? [];
		const count = (kind: string) => subjects.filter((s) => s.kind === kind).length;
		const parts = [
			count('add') ? `${plural(count('add'), 'feature')} added` : '',
			count('amend') ? `${plural(count('amend'), 'feature')} changed` : '',
			count('remove') ? `${plural(count('remove'), 'feature')} removed` : '',
			v.snapshot?.data?.length ? plural(v.snapshot.data.length, 'data change') : ''
		].filter(Boolean);
		return {
			id: `freeze:${v.version}`,
			at: v.at,
			kind: 'specification' as const,
			what: `Specification frozen as version ${v.version}`,
			why: parts.length > 0 ? `${parts.join(', ')}.` : '',
			who: [{ id: v.by, throughAi: kindAt(request, ['spec_frozen'], v.at, v.by) === 'ai_client' }]
		};
	});
}

function riskEntries(request: EvolutionRequest, say: (text: string) => string): DecisionEntry[] {
	return request.coherenceFindings.flatMap((f) =>
		f.risk
			? [
					{
						id: `risk:${f.id}`,
						at: f.risk.at,
						kind: 'simulation' as const,
						what: `Accepted as a known risk · ${say(f.title)}`,
						why: `Why: ${f.risk.reason}`,
						who: [{ id: f.risk.by, throughAi: kindAt(request, ['risk_decision'], f.risk.at, f.risk.by) === 'ai_client' }]
					}
				]
			: []
	);
}

/** The step a gate opens on, as the page groups it: leaving the Solution, the Simulation, the Verification. */
const WAIVED_INTO: Readonly<Record<RequestStage, { readonly kind: DecisionKind; readonly label: string }>> = {
	draft: { kind: 'briefing', label: 'Specification' },
	specification: { kind: 'briefing', label: 'Specification' },
	coherence: { kind: 'solution', label: 'Impact analysis' },
	implementation: { kind: 'simulation', label: 'Implementation' },
	acceptance: { kind: 'verification', label: 'Acceptance testing' },
	delivered: { kind: 'verification', label: 'Deployment' }
};

function waiverEntries(request: EvolutionRequest): DecisionEntry[] {
	return request.waivers.map((w) => ({
		id: `waiver:${w.id}`,
		at: w.grantedAt,
		kind: WAIVED_INTO[w.stage].kind,
		what: `${WAIVED_INTO[w.stage].label} entered on a waiver`,
		why: `Why: ${w.reason}`,
		who: [{ id: w.grantedBy, throughAi: kindAt(request, ['waiver'], w.grantedAt, w.grantedBy) === 'ai_client' }]
	}));
}

/** A line kept compliant as it is is a confirmation; every other decision settles a gap. */
const isGap = (l: ImplementationFinding) => !(l.verdict === 'conform' && l.decision === 'validated');

/** What a decision did to its line, in the order the sentence says them. */
const OUTCOMES: readonly { readonly words: string; readonly of: (l: ImplementationFinding) => boolean }[] = [
	{ words: 'sent back to the code', of: (l) => l.decision === 'invalidated' },
	{ words: 'accepted as built', of: (l) => l.decision === 'validated' && l.verdict === 'non_conform' },
	{ words: 'deferred', of: (l) => l.decision === 'validated' && l.verdict === 'missing' },
	{ words: 'new behaviour accepted', of: (l) => l.decision === 'validated' && l.verdict === 'regression' },
	{ words: 'kept', of: (l) => l.decision === 'validated' && l.verdict === 'out_of_scope' },
	{ words: 'written into the spec', of: (l) => l.decision === 'adopted' },
	{ words: 'to remove from the code', of: (l) => l.decision === 'removed' }
];

/** The lines of the verification each person decided, one entry per person and cycle. */
function verificationEntries(request: EvolutionRequest): DecisionEntry[] {
	const decided = request.implementationFindings.filter((l) => l.scope !== 'inherited' && l.decision !== 'undecided' && l.decidedBy && l.decidedAt);
	const groups = new Map<string, ImplementationFinding[]>();
	for (const l of decided) {
		const key = `${l.iteration}:${l.decidedBy}`;
		groups.set(key, [...(groups.get(key) ?? []), l]);
	}
	const cycles = new Set(request.implementationFindings.map((l) => l.iteration)).size;
	return [...groups.entries()].map(([key, lines]) => {
		const by = lines[0].decidedBy!;
		const at = lines.map((l) => l.decidedAt!).reduce(latest, '');
		const gaps = lines.filter(isGap);
		const confirmed = lines.length - gaps.length;
		const outcomes = OUTCOMES.map((o) => ({ words: o.words, n: gaps.filter(o.of).length })).filter((o) => o.n > 0);
		const cycle = cycles > 1 ? ` · cycle ${lines[0].iteration}` : '';
		const confirmations = confirmed > 0 ? `${plural(confirmed, 'compliant requirement')} confirmed.` : '';
		return {
			id: `lines:${key}`,
			at,
			kind: 'verification' as const,
			what: gaps.length > 0 ? `${plural(gaps.length, 'gap')} decided in the verification${cycle}` : `${plural(confirmed, 'compliant requirement')} confirmed${cycle}`,
			why: gaps.length > 0 ? [`${outcomes.map((o) => `${o.n} ${o.words}`).join(', ')}.`, confirmations].filter(Boolean).join(' ') : '',
			who: [{ id: by, throughAi: kindAt(request, ['verdict_decision'], at, by) === 'ai_client' }]
		};
	});
}

function approvalEntry(request: EvolutionRequest): DecisionEntry[] {
	const given = validationOf(request, 'approval').validations;
	if (given.length === 0) return [];
	const who: DecisionPerson[] = [];
	for (const v of given) addPerson(who, v.by, v.kind);
	return [
		{
			id: 'approval',
			at: given.map((v) => v.at).reduce(latest, ''),
			kind: 'verification',
			what: 'Evolution approved',
			why: complianceSentence(requirementCompliance(request)),
			who
		}
	];
}

/** The closing: the declaration that the change is live, or the close itself when nobody declared it. */
function closedEntry(request: EvolutionRequest): DecisionEntry[] {
	if (request.status !== 'closed') return [];
	const d = request.deployment;
	if (d) {
		const live = `Declared live${d.releaseId ? ` in ${d.releaseId}` : ''}.`;
		return [
			{
				id: 'closed',
				at: d.declaredAt,
				kind: 'closed',
				what: 'Evolution closed',
				why: [live, d.note.trim()].filter(Boolean).join(' '),
				who: [{ id: d.declaredBy, throughAi: kindAt(request, ['stage_crossing'], d.declaredAt, d.declaredBy) === 'ai_client' }]
			}
		];
	}
	// Nothing crosses after the close: the last crossing on the timeline is it.
	const close = [...request.history].reverse().find((h) => h.type === 'stage_crossing');
	if (!close) return [];
	return [{ id: 'closed', at: close.recordedAt, kind: 'closed', what: 'Evolution closed', why: '', who: [{ id: close.authorId, throughAi: close.authorKind === 'ai_client' }] }];
}

function cancelledEntry(request: EvolutionRequest): DecisionEntry[] {
	const c = request.cancellation;
	if (request.status !== 'cancelled' || !c) return [];
	return [{ id: 'cancelled', at: c.at, kind: 'cancelled', what: 'Evolution cancelled', why: `Why: ${c.reason}`, who: [{ id: c.by, throughAi: false }] }];
}

/** The order of the steps, so two decisions of one instant read in the order they were taken. */
const KIND_ORDER: Readonly<Record<DecisionKind, number>> = { briefing: 0, solution: 1, specification: 2, simulation: 3, verification: 4, closed: 5, cancelled: 6 };

/** Every decision of the request, newest first. */
export function decisionLog(request: EvolutionRequest, options: DecisionLogOptions = {}): DecisionEntry[] {
	const say = options.say ?? ((text: string) => text);
	const briefing = groupStanding(request, ['need'], BRIEFING_KEYS);
	const solution = groupStanding(request, SOLUTION_STEPS, SOLUTION_KEYS);
	const entries: DecisionEntry[] = [
		...(briefing ? [{ id: 'briefing', at: briefing.at, kind: 'briefing' as const, what: 'Briefing validated', why: briefingWhy(request), who: briefing.who }] : []),
		...(solution ? [{ id: 'solution', at: solution.at, kind: 'solution' as const, what: 'Solution validated', why: solutionWhy(request), who: solution.who }] : []),
		...freezeEntries(request),
		...waiverEntries(request),
		...riskEntries(request, say),
		...verificationEntries(request),
		...approvalEntry(request),
		...closedEntry(request),
		...cancelledEntry(request)
	];
	return entries.sort((a, b) => b.at.localeCompare(a.at) || KIND_ORDER[b.kind] - KIND_ORDER[a.kind]);
}

