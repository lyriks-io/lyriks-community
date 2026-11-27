import { specVersionOf, type Baseline, type SpecVersion } from '../baselines';
import { currentRun, lastPublishedRun, type PersonRef, type RequestValidation, type RetrospecDocument, type RetrospecRun } from './document';
import { writesHeld } from './run-report';
import { eligibleValidators, reviewSeats, samePersonRef, type ReviewSeat, type TeamMember } from './spec-validators';

/**
 * The validation of the Specification 360°: element by element, the people
 * each one waits on, then the whole specification switching from DRAFT to
 * VALIDATED once every element is validated and a person validates it
 * definitively (the retrospecification's publish act, which captures the
 * baseline the version is read from).
 *
 * The verdicts are the retrospecification's own, keyed by the element's spec id
 * (its discussion anchor), on the current run; a run nobody started is created
 * by the first act. Pure: the elements, the team and the baselines arrive read.
 */

/** One element a team validates, by its own spec id. */
export interface SpecElement {
	readonly id: string;
	readonly title: string;
	/** What the element reads, condensed: a validation carried by a complementary run stands while it is the same. */
	readonly fingerprint?: string;
	/** Where it sits: its core feature and its feature, or its page of Knowledge. */
	readonly place?: string;
	/** The anchor of the action a rule belongs to. */
	readonly under?: string;
}

/** What the app bar, Home and the Specification 360° read of the validation. */
export interface SpecValidationSummary {
	readonly state: 'draft' | 'validated';
	/** Elements of the specification. */
	readonly total: number;
	/** Elements every required validator validated. */
	readonly validated: number;
	/** Elements some validated, still waiting for others. */
	readonly waiting: number;
	/** Elements nobody validated yet. */
	readonly toReview: number;
	/** The version the team reads, from the first validation on; null while it never was validated. */
	readonly version: SpecVersion | null;
}

export type ElementState = 'ok' | 'waiting' | 'todo';

/** Where one element stands. */
export interface ElementStanding {
	readonly state: ElementState;
	/** Who must validate it. */
	readonly required: readonly PersonRef[];
	/** Everyone who validated it, required or not. */
	readonly validatedBy: readonly PersonRef[];
	/** Required validators still awaited. */
	readonly missing: readonly PersonRef[];
	/** Rejected in the retrospecification's former review: only an explicit validation restores it. */
	readonly rejected: boolean;
	/** The landed change request that validated it, while that validation stands (EVO-002): it settles the element whatever its required validators. */
	readonly through: RequestValidation | null;
}

export interface SpecValidationInput {
	readonly doc: RetrospecDocument;
	readonly elements: readonly SpecElement[];
	readonly team: readonly TeamMember[];
	/** The person reading: the lead while nobody started a run. */
	readonly viewer: PersonRef | null;
	readonly baselines: readonly Baseline[];
}

export interface SpecValidationBoard {
	readonly summary: SpecValidationSummary;
	/** Validations got over validations needed, 0 to 100. */
	readonly pct: number;
	/** The person leading the validation. */
	readonly lead: PersonRef | null;
	readonly standings: Readonly<Record<string, ElementStanding>>;
	/** Every element is validated: the specification can be validated definitively. */
	readonly complete: boolean;
}

/** The person who leads the validation: whom the project chose, else who started the current run, else the reader. */
export function validationLead(doc: RetrospecDocument, viewer: PersonRef | null): PersonRef | null {
	if (doc.lead) return doc.lead.to;
	const run = currentRun(doc);
	return run && 'validationLead' in run ? run.validationLead ?? null : run?.startedBy ?? viewer;
}

/**
 * Whether the actor may give, or take back, their own validation of an element:
 * the element still waits on them or holds their validation (they lead the
 * validation, hold a job no colleague validated for yet, or were asked by
 * name); a writer also when it waits on nobody named, or to take
 * back a validation of theirs that stands on it. A writer leads while no run names a lead;
 * a reader never does, so merely viewing a page never makes one the lead. Any
 * other validation would read as an approval and count for nothing, so the
 * server refuses it on every door (criterion d1703bb6).
 */
export function canReviewElement(doc: RetrospecDocument, element: SpecElement | undefined, team: readonly TeamMember[], actor: PersonRef, canWrite: boolean): boolean {
	if (!element) return false;
	const requested = doc.validationRequests?.[element.id]?.map((request) => request.to) ?? [];
	const run = currentRun(doc);
	const { standing, seats } = measure(run, element, validationLead(doc, canWrite ? actor : null), team, requested, namedValidators(doc));
	if (standing.required.some((person) => samePersonRef(person, actor))) return true;
	if (!canWrite) return false;
	return seats.length === 0 || !!run?.verdicts[element.id]?.validatedBy.some((v) => samePersonRef(v.person, actor));
}

/** DRAFT until the current run is published; a new run under way reads DRAFT again, unless it holds what it found: nothing moved yet (criterion 50b00229). */
export function specState(doc: RetrospecDocument): 'draft' | 'validated' {
	const run = currentRun(doc);
	// A later run leaves the specification validated until a person had what it found written: it reads draft from then on.
	return run?.publishedAt || (writesHeld(run) && !run?.writingOpenedAt && lastPublishedRun(doc)) ? 'validated' : 'draft';
}

/** The baseline the first validation captured: version 1.0. */
export function validationBaselineId(doc: RetrospecDocument): string | null {
	return doc.runs.find((r) => r.publishedAt && r.baselineId)?.baselineId ?? null;
}

/** Every baseline a validation of the specification stands on: none of them may be deleted. */
export function validationBaselineIds(doc: RetrospecDocument): Set<string> {
	return new Set(doc.runs.flatMap((r) => (r.publishedAt && r.baselineId ? [r.baselineId] : [])));
}

/**
 * The validations an element holds: its own on the run, else the ones a
 * complementary run carried from the last validated run while the element
 * reads as it did then (criterion 0c87480c of feat-ai-session).
 */
function validationsOf(run: RetrospecRun | null, element: SpecElement): readonly PersonRef[] {
	const verdict = run?.verdicts[element.id];
	if (verdict) return verdict.flag?.kind !== 'rejected' ? verdict.validatedBy.map((v) => v.person) : [];
	const carried = run?.carried?.[element.id];
	return carried && element.fingerprint && carried.fingerprint === element.fingerprint ? carried.validatedBy.map((v) => v.person) : [];
}

/**
 * The validation a landed change request gave an element, while it stands
 * (EVO-002): not taken back, and the element still reads as it landed. A
 * change requested on the element leaves none standing (invariant 4b808089).
 */
export function requestValidationOf(run: RetrospecRun | null, element: SpecElement): RequestValidation | null {
	const given = run?.throughRequests?.[element.id];
	if (!given || given.withdrawn || run?.verdicts[element.id]?.flag?.kind === 'rejected') return null;
	return !element.fingerprint || given.fingerprint === element.fingerprint ? given : null;
}

interface Measured {
	readonly standing: ElementStanding;
	readonly seats: readonly ReviewSeat[];
	/** Seats some validation fills. */
	readonly filled: number;
}

/** The validators the project names, or null while it names none: everyone who can open it then counts (criterion e3296696). */
export const namedValidators = (doc: RetrospecDocument): readonly PersonRef[] | null => doc.validators?.people ?? null;

function measure(
	run: RetrospecRun | null,
	element: SpecElement,
	lead: PersonRef | null,
	team: readonly TeamMember[],
	requested: readonly PersonRef[],
	validators: readonly PersonRef[] | null = null
): Measured {
	const seats = reviewSeats(lead, team, requested, element.id, validators);
	const verdict = run?.verdicts[element.id];
	const validatedBy = validationsOf(run, element);
	const has = (p: PersonRef) => validatedBy.some((v) => samePersonRef(v, p));
	// A request's validation counts as every validation the element waits on (criterion 939f5eef).
	const through = requestValidationOf(run, element);
	const open = through ? [] : seats.filter((seat) => !seat.people.some(has));
	const missing = eligibleValidators(open);
	// One holder fills a job's seat (criterion f02f078b): its other holders are no longer waited on.
	const eligible = eligibleValidators(seats);
	const required = through ? eligible : eligible.filter((p) => has(p) || missing.some((m) => samePersonRef(m, p)));
	// Nobody to wait on (no lead known, nobody holding the job): one validation settles it.
	const settled = through !== null || (seats.length > 0 ? open.length === 0 : validatedBy.length > 0);
	const standing: ElementStanding = { state: settled ? 'ok' : validatedBy.length > 0 ? 'waiting' : 'todo', required, validatedBy, missing, rejected: verdict?.flag?.kind === 'rejected', through };
	return { standing, seats, filled: seats.length - open.length };
}

export function elementStanding(run: RetrospecRun | null, element: SpecElement, lead: PersonRef | null, team: readonly TeamMember[], requested: readonly PersonRef[] = [], validators: readonly PersonRef[] | null = null): ElementStanding {
	return measure(run, element, lead, team, requested, validators).standing;
}

export function specValidationBoard(input: SpecValidationInput): SpecValidationBoard {
	const run = currentRun(input.doc);
	const lead = validationLead(input.doc, input.viewer);
	const standings: Record<string, ElementStanding> = {};
	let validated = 0;
	let waiting = 0;
	let got = 0;
	let need = 0;
	for (const element of input.elements) {
		if (standings[element.id]) continue;
		const requested = input.doc.validationRequests?.[element.id]?.map((request) => request.to) ?? [];
		const { standing: s, seats, filled } = measure(run, element, lead, input.team, requested, namedValidators(input.doc));
		standings[element.id] = s;
		if (s.state === 'ok') validated++;
		else if (s.state === 'waiting') waiting++;
		// Validations given over validations needed: the lead, each job and each person asked count once (invariant fb724709).
		need += Math.max(1, seats.length);
		got += seats.length > 0 ? filled : s.state === 'ok' ? 1 : 0;
	}
	const total = Object.keys(standings).length;
	const baselineId = validationBaselineId(input.doc);
	const summary: SpecValidationSummary = {
		state: specState(input.doc),
		total,
		validated,
		waiting,
		toReview: total - validated - waiting,
		version: specVersionOf(input.baselines, baselineId)
	};
	return { summary, pct: need > 0 ? Math.round((100 * got) / need) : 0, lead, standings, complete: total > 0 && validated === total };
}

/**
 * The elements still waiting on one person's validation, in the board's order,
 * a rejected one left to an explicit decision: what "Validate my N items in the
 * whole spec" validates in one go.
 */
export function waitingOn(board: SpecValidationBoard, person: PersonRef): string[] {
	return Object.entries(board.standings)
		.filter(([, s]) => !s.rejected && s.missing.some((p) => samePersonRef(p, person)))
		.map(([id]) => id);
}
