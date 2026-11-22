import type { CrossChange, CrossVerdict, DockingQualification, ImpactRow, RequestStage } from '$domain/evolution';

/**
 * The Simulation tab read as a board: one item per thing the change moves, with
 * whether it fits the product as it stands, those items graded the way the
 * design reads them (major, minor, compatible) and counted by the part of the
 * product they belong to, then the sentences the executive summary and the
 * in-progress evolutions are written in. Pure: it only joins and words what the
 * impact walk, the docking and the cross reading already computed.
 */
export interface DockingPointLike {
	readonly nodeId: string;
	readonly label: string;
	readonly qualification: DockingQualification;
	readonly reason: string;
	/** The part of the product the docking placed it in, when the walk did not list it. */
	readonly section?: string | null;
}

export interface ImpactItem<P extends DockingPointLike> {
	readonly nodeId: string;
	readonly label: string;
	/** The section of the product it belongs to; null when neither the walk nor the docking placed it. */
	readonly section: string | null;
	/** Why it is in the list: what joined it to the change. */
	readonly note: string;
	readonly qualification: DockingQualification;
	readonly reason: string;
	/** The docking point behind it, when the platform qualified it; a thing nothing opposes has none. */
	readonly point: P | null;
}

const FITS_REASON = 'Nothing in the specification opposes it.';

/** Every thing that moves with its docking, then any point the walk did not list, so nothing that does not fit is lost. */
export function impactItems<P extends DockingPointLike>(rows: readonly ImpactRow[], points: readonly P[]): ImpactItem<P>[] {
	const byNode = new Map(points.map((p) => [p.nodeId, p]));
	const listed = new Set<string>();
	const items: ImpactItem<P>[] = [];
	for (const row of rows) {
		if (listed.has(row.nodeId)) continue;
		listed.add(row.nodeId);
		const point = byNode.get(row.nodeId) ?? null;
		const note = row.note || (row.depth > 1 ? (row.via ? `rests on "${row.via}"` : 'rests on something the change edits') : '');
		items.push({
			nodeId: row.nodeId,
			label: row.label,
			section: row.section,
			note,
			qualification: point?.qualification ?? 'fits',
			reason: point?.reason ?? FITS_REASON,
			point
		});
	}
	for (const point of points) {
		if (listed.has(point.nodeId)) continue;
		listed.add(point.nodeId);
		items.push({ nodeId: point.nodeId, label: point.label, section: point.section ?? null, note: '', qualification: point.qualification, reason: point.reason, point });
	}
	return items;
}

export type ZoneCounts = Record<DockingQualification, number>;

/** The items counted by section, in the order the sections are given, the ones nothing placed last. */
export function impactZones(
	items: readonly Pick<ImpactItem<DockingPointLike>, 'section' | 'qualification'>[],
	sections: readonly { readonly code: string; readonly label: string }[]
): { code: string; label: string; counts: ZoneCounts }[] {
	const empty = (): ZoneCounts => ({ collision: 0, friction: 0, missing_anchor: 0, fits: 0 });
	const zones = [...sections.map((s) => ({ code: s.code, label: s.label })), { code: '', label: 'Elsewhere' }].map((s) => ({ ...s, counts: empty() }));
	for (const item of items) {
		const zone = zones.find((z) => z.code === (item.section ?? '')) ?? zones[zones.length - 1];
		zone.counts[item.qualification] += 1;
	}
	return zones.filter((z) => Object.values(z.counts).some((n) => n > 0));
}

/* ------------------------------------------------------------------ grades */

/**
 * The design's three grades over the docking's four words: a major impact asks a
 * person's decision (it blocks, or there is something to decide), a minor one is
 * a light adjustment (there is nothing to attach it to yet), the rest holds.
 */
export type SimulationGrade = 'major' | 'minor' | 'compatible';
export const GRADE_OF: Record<DockingQualification, SimulationGrade> = {
	collision: 'major',
	friction: 'major',
	missing_anchor: 'minor',
	fits: 'compatible'
};
const CODE_LETTER: Record<SimulationGrade, string> = { major: 'M', minor: 'N', compatible: 'O' };

export type GradedItem<P extends DockingPointLike> = ImpactItem<P> & { readonly grade: SimulationGrade; readonly code: string };

/** The items under their grade, each numbered within it (M1, N1, O1), what blocks before what is to decide. */
export function gradedItems<P extends DockingPointLike>(items: readonly ImpactItem<P>[]): Record<SimulationGrade, GradedItem<P>[]> {
	const of = (grade: SimulationGrade) =>
		items
			.filter((i) => GRADE_OF[i.qualification] === grade)
			.sort((a, b) => Number(a.qualification !== 'collision') - Number(b.qualification !== 'collision'))
			.map((item, i) => ({ ...item, grade, code: `${CODE_LETTER[grade]}${i + 1}` }));
	return { major: of('major'), minor: of('minor'), compatible: of('compatible') };
}

/** One row of the impacts by area: the zone's counts under the three grades. */
export function simulationAreas(zones: readonly { code: string; label: string; counts: ZoneCounts }[]) {
	return zones.map((z) => ({
		code: z.code,
		label: z.label,
		major: z.counts.collision + z.counts.friction,
		minor: z.counts.missing_anchor,
		compatible: z.counts.fits
	}));
}

/** A major impact a person can decide on the page: a coherence finding stands behind it and nobody decided it yet. */
export interface DecidableLike {
	readonly code: string;
	readonly point: { readonly findingId?: string; readonly risk?: unknown } | null;
}
export const awaitsDecision = (item: DecidableLike): boolean => !!item.point?.findingId && !item.point.risk;

/** The next best action of the tab: the first major impact that awaits a decision, or null once none does. */
export const nextDecision = (majors: readonly DecidableLike[]): string | null => majors.find(awaitsDecision)?.code ?? null;

/* ------------------------------------------------------------------- words */

export const quoted = (name: string): string => `“${name}”`;

/** Names in a sentence: “A”, “B” and “C”, the rest counted once there are more than `max`. */
export function nameList(names: readonly string[], max = 3): string {
	if (names.length === 0) return '';
	const shown = names.length > max ? [...names.slice(0, max), `${names.length - max} other${names.length - max === 1 ? '' : 's'}`] : [...names];
	return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** The step of the page a stage is read in, the words a person sees on the tabs. */
const STEP_OF_STAGE: Record<RequestStage, string> = {
	draft: 'Briefing',
	specification: 'Specification',
	coherence: 'Simulation',
	implementation: 'Implementation',
	acceptance: 'Verification',
	delivered: 'Verification'
};
export const stepOfStage = (stage: RequestStage): string => STEP_OF_STAGE[stage] ?? stage;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export interface SummaryInput {
	readonly key: string;
	/** The touched features by what the request does to them. */
	readonly leaves: readonly { readonly name: string; readonly change: 'add' | 'amend' | 'remove' | null }[];
	readonly total: number;
	readonly compatible: number;
	readonly minor: number;
	readonly majors: readonly { readonly label: string; readonly decided: boolean }[];
	readonly cross: readonly CrossLike[];
}

/** What the request does, in one sentence: what it adds, changes and removes, by name. */
function whatItDoes(key: string, leaves: SummaryInput['leaves']): string {
	const names = (pick: (c: SummaryInput['leaves'][number]['change']) => boolean) => leaves.filter((l) => pick(l.change)).map((l) => quoted(l.name));
	const clauses = [
		['adds', names((c) => c === 'add')],
		['changes', names((c) => c === 'amend' || c === null)],
		['removes', names((c) => c === 'remove')]
	]
		.filter(([, n]) => n.length > 0)
		.map(([verb, n]) => `${verb} ${nameList(n as string[])}`);
	return clauses.length === 0 ? `${key} touches no feature directly.` : `${key} ${nameList(clauses, clauses.length)}.`;
}

/** The two paragraphs of the executive summary, composed from the counts and the names the readings hold. */
export function executiveSummary(input: SummaryInput): [string, string] {
	const left = input.majors.filter((m) => !m.decided);
	const existing =
		input.total === 0
			? 'Nothing in the existing system moves with it.'
			: [
					`Against the existing system, ${input.compatible} of ${input.total} ${plural(input.total, 'item', 'items')} ${plural(input.compatible, 'fits', 'fit')} as is, `,
					input.minor === 0 ? 'none needs a light adjustment' : input.minor === 1 ? '1 needs a light adjustment' : `${input.minor} need light adjustments`,
					left.length > 0
						? ` and ${left.length} ${plural(left.length, 'requires', 'require')} a decision: ${nameList(left.map((m) => quoted(m.label)), left.length)}.`
						: input.majors.length === 0
							? ' and none requires a decision.'
							: `, and ${input.majors.length === 1 ? 'the major decision has' : input.majors.length === 2 ? 'both major decisions have' : `all ${input.majors.length} major decisions have`} been made.`
				].join('');
	return [`${whatItDoes(input.key, input.leaves)} ${existing}`, crossParagraph(input.key, input.cross)];
}

function crossParagraph(key: string, cross: readonly CrossLike[]): string {
	const of = (v: CrossVerdict) => cross.filter((c) => c.verdict === v);
	const conflicts = of('conflict');
	const overlaps = of('overlap');
	const compatible = of('compatible').length;
	const pending = of('spec_pending');
	let text: string;
	if (conflicts.length > 0 || overlaps.length > 0) {
		const shared = [...new Set(overlaps.flatMap((o) => o.shared.map(sharedWhat)))];
		text = [
			'Against the evolutions in progress, ',
			conflicts.length > 0 ? `it conflicts with ${nameList(conflicts.map((c) => `${c.title} (${c.key})`), conflicts.length)}` : '',
			conflicts.length > 0 && overlaps.length > 0 ? ', and ' : '',
			overlaps.length > 0 ? `it overlaps with ${overlaps.length} ${plural(overlaps.length, 'evolution', 'evolutions')} on ${nameList(shared)}` : '',
			'.',
			compatible > 0 ? ` ${compatible} other ${plural(compatible, 'evolution is', 'evolutions are')} compatible.` : ''
		].join('');
	} else {
		text = compatible > 0 ? 'It fits with every validated evolution in progress.' : pending.length > 0 ? '' : 'No other evolution is in progress.';
	}
	if (pending.length > 0) {
		const steps = [...new Set(pending.map((p) => stepOfStage(p.stage)))];
		text += `${text ? ' ' : ''}${nameList(pending.map((p) => p.key), pending.length)} ${plural(pending.length, 'is', 'are')} still in ${steps.join(' or ')} and could not be checked yet: this part of the simulation will be completed once ${plural(pending.length, 'its spec is', 'their specs are')} validated.`;
	}
	return text;
}


/* --------------------------------------------------- in-progress evolutions */

/** A rule of a feature or a field of a table, as one side writes it; `was` is what it reads today. */
interface CrossItemLike {
	readonly id: string;
	readonly act: 'add' | 'reword' | 'retire';
	readonly text: string;
	readonly was?: string | null;
}

interface CrossWritesLike {
	readonly summary: string | null;
	readonly items: readonly CrossItemLike[];
}

interface CrossSharedLike {
	readonly kind: 'feature' | 'table';
	readonly name: string;
	readonly here: CrossChange;
	readonly there: CrossChange;
	readonly conflict: boolean;
	readonly hereWrites?: CrossWritesLike | null;
	readonly thereWrites?: CrossWritesLike | null;
	readonly common?: readonly string[];
}

export interface CrossLike {
	readonly key: string;
	readonly title: string;
	readonly stage: RequestStage;
	readonly verdict: CrossVerdict;
	readonly shared: readonly CrossSharedLike[];
	readonly theirs: readonly { readonly kind: 'feature' | 'table'; readonly change: 'add' | 'amend' | 'remove'; readonly name: string }[];
}

const sharedWhat = (e: { kind: 'feature' | 'table'; name: string }) => (e.kind === 'table' ? `the table ${quoted(e.name)}` : quoted(e.name));
const VERB: Record<CrossChange | 'add', string> = { add: 'adds', amend: 'changes', remove: 'removes', use: 'uses' };
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What a side does to one rule of a feature or one field of a table, said the way the product calls it. */
const ITEM_WORDS = {
	feature: { noun: 'rule', add: 'Adds', reword: 'Rewrites', retire: 'Retires' },
	table: { noun: 'field', add: 'Adds', reword: 'Changes', retire: 'Removes' }
} as const;
/** Past this many, a side's list ends on a count: the rest is one click away on the other request. */
const ITEMS_SHOWN = 4;
/** The stages in which the other request is being built against its own spec. */
const BEING_BUILT: readonly RequestStage[] = ['implementation', 'acceptance'];

function itemLine(kind: CrossSharedLike['kind'], item: CrossItemLike): string {
	const words = ITEM_WORDS[kind];
	const verb = words[item.act];
	if (item.act === 'reword' && item.was && item.was !== item.text) return `${verb} the ${words.noun} ${quoted(item.was)} as ${quoted(item.text)}`;
	return item.text ? `${verb} the ${words.noun} ${quoted(item.text)}` : `${verb} a ${words.noun}`;
}

/** What one side does to one shared element, in lines: its own sentence when it wrote one, else each rule or field it writes. */
function sideLines(e: CrossSharedLike, side: 'here' | 'there'): string[] {
	const change = e[side];
	if (change === 'remove') return ['Removes it from the product.'];
	if (change === 'use') return ['Uses it as it is, without changing it.'];
	const writes = side === 'here' ? e.hereWrites : e.thereWrites;
	if (!writes) return ['Lists it among what it changes, without saying how yet.'];
	if (writes.summary) return [writes.summary];
	const lines = writes.items.map((item) => itemLine(e.kind, item));
	if (lines.length === 0) return [`Changes it without naming a ${ITEM_WORDS[e.kind].noun} yet.`];
	return lines.length > ITEMS_SHOWN ? [...lines.slice(0, ITEMS_SHOWN - 1), `And ${lines.length - ITEMS_SHOWN + 1} more ${ITEM_WORDS[e.kind].noun}s.`] : lines;
}

/** The one sentence that says how both sides write the same rule or field. */
function sameItemSentence(e: CrossSharedLike, key: string, id: string): string {
	const words = ITEM_WORDS[e.kind];
	const mine = e.hereWrites?.items.find((i) => i.id === id);
	const theirs = e.thereWrites?.items.find((i) => i.id === id);
	if (!mine || !theirs) return '';
	const was = mine.was ?? theirs.was ?? (mine.act === 'add' ? mine.text : theirs.text);
	if (mine.act === 'retire' && theirs.act === 'retire') return closed(`Both retire the ${words.noun} ${quoted(was)}`);
	if (mine.act === 'retire') return `This evolution retires the ${words.noun} ${quoted(theirs.text)} that ${key} ${theirs.act === 'add' ? 'adds' : 'rewrites'}.`;
	if (theirs.act === 'retire') return `${key} retires the ${words.noun} ${quoted(mine.text)} that this evolution ${mine.act === 'add' ? 'adds' : 'rewrites'}.`;
	if (theirs.act === 'add') return closed(`This evolution rewrites the ${words.noun} ${quoted(theirs.text)} that ${key} adds, as ${quoted(mine.text)}`);
	if (mine.act === 'add') return closed(`${key} rewrites the ${words.noun} ${quoted(mine.text)} that this evolution adds, as ${quoted(theirs.text)}`);
	return closed(`Both rewrite the ${words.noun} ${quoted(was)}: this evolution as ${quoted(mine.text)}, ${key} as ${quoted(theirs.text)}`);
}

/** Ends a sentence once: a quoted rule that already ends on its own stop is not stopped again. */
const closed = (sentence: string): string => (/[.!?]”$/.test(sentence) ? sentence : `${sentence}.`);

/**
 * Where two evolutions meet on one shared feature or table, in the words a
 * person can act on: what each writes into it, whether they write the same
 * rule (the only way two amendments contradict), and what to do about it.
 */
function meetWords(e: CrossSharedLike, cross: CrossLike) {
	const key = cross.key;
	const what = sharedWhat(e);
	const noun = ITEM_WORDS[e.kind].noun;
	const built = BEING_BUILT.includes(cross.stage);
	const base = { what: capital(what), here: sideLines(e, 'here'), there: sideLines(e, 'there') };
	if (e.conflict) {
		const remover = e.here === 'remove' ? 'this evolution' : key;
		const other = e.here === 'remove' ? key : 'this evolution';
		const otherAct = e.here === 'remove' ? e.there : e.here;
		return {
			...base,
			clash: true,
			label: 'Conflict',
			point: capital(`${remover} removes ${what}, which ${other} ${VERB[otherAct]}: once ${remover} is delivered, what ${other} ${otherAct === 'use' ? 'relies on' : 'changes'} there no longer exists.`),
			todo: `Decide with whoever carries ${key} which of the two goes ahead, before either is delivered.`
		};
	}
	const common = e.common ?? [];
	if (common.length > 0) {
		const more = common.length > 1 ? ` They also both write ${common.length - 1} other ${noun}${common.length > 2 ? 's' : ''}.` : '';
		return {
			...base,
			clash: true,
			label: `Same ${noun}`,
			point: `${sameItemSentence(e, key, common[0])}${more} Only one wording can stay.`,
			todo: built
				? `${key} is already being built on its own wording. Agree with whoever carries it on which wording stays, so its code does not implement a ${noun} this evolution rewrites.`
				: `Agree with whoever carries ${key} on which wording stays, before either spec is validated.`
		};
	}
	const unknownHere = !e.hereWrites || e.hereWrites.items.length === 0;
	const unknownThere = !e.thereWrites || e.thereWrites.items.length === 0;
	if (unknownHere || unknownThere) {
		const who = unknownHere && unknownThere ? 'Neither evolution names' : unknownThere ? `${key} does not name` : 'This evolution does not name';
		return {
			...base,
			clash: false,
			label: 'Not comparable yet',
			point: `${who} yet the ${noun}s it changes in ${what}: Lyriks cannot tell whether the two contradict.`,
			todo: unknownThere ? `Ask whoever carries ${key} what it changes in ${what}.` : `Write which ${noun}s this evolution changes in ${what}, so the two can be compared.`
		};
	}
	return {
		...base,
		clash: false,
		label: 'Where they meet',
		point: `Both change ${what}, but not the same ${noun}s: nothing contradicts on paper.`,
		todo: built
			? `No decision needed. Once ${key} is delivered, check that this evolution's changes still read right next to it.`
			: 'No decision needed for now: the check runs again each time this page is opened.'
	};
}

/** The words an in-progress evolution is shown in, against the request read here (`hereKey`). */
export function crossWords(hereKey: string, cross: CrossLike) {
	const issue = cross.verdict === 'conflict' || cross.verdict === 'overlap';
	const conflicting = cross.shared.filter((e) => e.conflict);
	const first = conflicting[0];
	const sameRule = cross.shared.find((e) => (e.common ?? []).length > 0);
	// The summary row already names the other request: its line says what they share.
	const shared =
		cross.verdict === 'conflict' && first
			? `One removes ${sharedWhat(first)}, the other ${VERB[first.here === 'remove' ? first.there : first.here]} it`
			: sameRule
				? `Both write the same ${ITEM_WORDS[sameRule.kind].noun} of ${sharedWhat(sameRule)}`
				: `Both change ${nameList(cross.shared.map(sharedWhat))}`;
	// The details row names it nowhere else until it is opened, so its head says who.
	const head =
		cross.verdict === 'conflict' && first
			? first.here === 'remove'
				? `This evolution removes ${sharedWhat(first)}, which ${cross.key} ${VERB[first.there]}`
				: `${cross.key} removes ${sharedWhat(first)}, which this evolution ${VERB[first.here]}`
			: cross.verdict === 'overlap' && sameRule
				? `${cross.key} and this evolution write the same ${ITEM_WORDS[sameRule.kind].noun} of ${sharedWhat(sameRule)}`
				: cross.verdict === 'overlap'
					? `${cross.key} also changes ${nameList(cross.shared.map(sharedWhat))}`
					: cross.title;
	const step = stepOfStage(cross.stage);
	const theirs = (['add', 'amend', 'remove'] as const).flatMap((change) => {
		const whats = cross.theirs.filter((t) => t.change === change).map(sharedWhat);
		return whats.length > 0 ? [`${VERB[change]} ${nameList(whats)}`] : [];
	});
	const sub =
		cross.verdict === 'compatible'
			? `Nothing shared with ${hereKey}: no friction.`
			: cross.verdict === 'spec_pending'
				? `Still in ${step}: not checked yet. Lyriks will check it once its spec is validated.`
				: shared;
	const explain =
		cross.verdict === 'compatible'
			? `${cross.key} ${theirs.length > 0 ? nameList(theirs, theirs.length) : 'changes nothing that exists'}. ${hereKey} changes none of it: the two fit as is.`
			: cross.verdict === 'spec_pending'
				? `${cross.key} is still in the ${step} step: its spec has no frozen version yet, so it cannot be compared with ${hereKey}. This simulation is therefore incomplete for ${cross.key}. Lyriks reruns the check automatically as soon as its specification is validated.`
				: '';
	return {
		issue,
		head,
		sub,
		explain,
		step,
		meets: issue ? cross.shared.map((e) => meetWords(e, cross)) : []
	};
}

/**
 * The same words for a report where no evolution is "this one": each is named
 * by its key (criterion f70b2e9f).
 */
export function crossWordsNamed(hereKey: string, cross: CrossLike) {
	const named = (text: string) => text.replace(/\b[Tt]his evolution\b/g, hereKey).replace(/This simulation/g, 'This report');
	const words = crossWords(hereKey, cross);
	return {
		...words,
		head: words.issue ? named(words.head) : `${hereKey} and ${cross.key}`,
		sub: named(words.sub),
		explain: named(words.explain),
		meets: words.meets.map((m) => ({ ...m, what: named(m.what), label: named(m.label), point: named(m.point), todo: named(m.todo), here: m.here.map(named), there: m.there.map(named) }))
	};
}

/** The band of the concurrent impact report: its pill, and what it read and found (criterion f70b2e9f). */
export function concurrentSummary(picked: readonly string[], verdicts: readonly CrossVerdict[]) {
	const count = (v: CrossVerdict) => verdicts.filter((x) => x === v).length;
	const said = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const [conflicts, overlaps, compatible, pending] = [count('conflict'), count('overlap'), count('compatible'), count('spec_pending')];
	const scope = picked.length === 1 ? `${picked[0]} read against ${said(verdicts.length, 'other evolution')} in progress` : `${picked.length} evolutions read against each other`;
	const found = verdicts.length === 0 ? 'nothing to compare yet' : [said(conflicts, 'conflict'), said(overlaps, 'overlap'), `${compatible} compatible`, `${pending} not checked yet`].join(', ');
	return {
		// Never "no conflict" over pairs it could not check: what it does not know is said first.
		pill: conflicts > 0 ? said(conflicts, 'conflict') : overlaps > 0 ? said(overlaps, 'overlap') : pending > 0 ? `${pending} not checked yet` : verdicts.length === 0 ? 'Nothing to compare' : 'No conflict',
		warns: conflicts + overlaps + pending > 0,
		sentence: `${scope}: ${found}.`
	};
}

/**
 * What the top of the Simulation says (ac-evo-sim-top-cross): the decisions on
 * the product and the evolutions in progress together, so it never says less
 * than the details below. `ready` is the request past the Simulation, or at it
 * with its gate met and every decision made; `decided` every decision on the
 * product made. An evolution not checked yet changes nothing here.
 */
export function simulationTop<C extends { readonly verdict: CrossVerdict }>(input: { readonly ready: boolean; readonly decided: boolean; readonly cross: readonly C[] }) {
	const issues = input.cross.filter((c) => c.verdict === 'conflict' || c.verdict === 'overlap');
	return {
		/** The green light: every decision made and nothing in progress in the way. */
		green: input.decided && issues.length === 0,
		/** The status of the summary reads 'Implementable', not 'under conditions'. */
		implementable: input.ready && issues.length === 0,
		/** The evolutions in progress it conflicts or overlaps with, named in the amber band once the decisions are made. */
		issues
	};
}

/**
 * What a row of Evolutions in progress reads of the order (EVO-005, criterion
 * 4162228b): the other request lands before this one, after it, or no order is
 * set yet; what a person decided on a conflict follows. Only requests that
 * share a feature or a table are ordered: the others read nothing here.
 */
export function orderWords(
	cross: { readonly key: string; readonly verdict: CrossVerdict; readonly order: 'before' | 'after' | null; readonly decision: { readonly kind: 'order' | 'risk'; readonly reason: string } | null }
): { readonly line: string; readonly decided: string | null } | null {
	if (cross.verdict !== 'conflict' && cross.verdict !== 'overlap') return null;
	const line = cross.order === 'before' ? `Lands before this one` : cross.order === 'after' ? `Lands after this one` : 'Not ordered yet';
	const decided =
		cross.decision?.kind === 'risk'
			? `Conflict accepted as a risk: ${cross.decision.reason}`
			: cross.verdict === 'conflict'
				? cross.decision?.kind === 'order'
					? 'Conflict decided by the order.'
					: `Conflict undecided: set which lands first, or accept the risk with a reason, before ${cross.key} or this one is frozen.`
				: null;
	return { line, decided };
}

/**
 * The line the Simulation opens on once another request landed on what it
 * shares (EVO-005, criteria 550bcc24 and 7e16f2cb): which request landed, on
 * what, and whether the readings caught up with the version it left.
 */
export function landedNoticeWords(landing: { readonly key: string; readonly on: readonly string[]; readonly upToDate: boolean; readonly neverRead: boolean }): { readonly line: string; readonly stale: boolean } {
	const on = landing.on.length > 0 ? ` on ${landing.on.join(', ')}` : '';
	if (landing.neverRead) return { line: `${landing.key} landed${on}: this request is read on the new version at its Impact analysis.`, stale: false };
	if (landing.upToDate) return { line: `${landing.key} landed${on}, read again on the new version.`, stale: false };
	return { line: `${landing.key} landed${on}: this Simulation still reads the version before that landing.`, stale: true };
}
