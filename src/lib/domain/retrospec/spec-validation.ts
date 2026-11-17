import { specVersionOf, type Baseline, type SpecVersion } from '../baselines';
import { currentRun, lastPublishedRun, type PersonRef, type RetrospecDocument, type RetrospecRun } from './document';
import { writesHeld } from './run-report';
import { requiredValidators, samePersonRef, type SpecOwner, type TeamMember } from './spec-validators';

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
	readonly owner: SpecOwner;
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

/** The person who leads the validation: who started the current run, else the reader. */
export function validationLead(doc: RetrospecDocument, viewer: PersonRef | null): PersonRef | null {
	const run = currentRun(doc);
	return run && 'validationLead' in run ? run.validationLead ?? null : run?.startedBy ?? viewer;
}

/** Review authority uses an established lead, never the person merely viewing a page. */
export function canReviewElement(doc: RetrospecDocument, element: SpecElement | undefined, team: readonly TeamMember[], actor: PersonRef, canWrite: boolean): boolean {
	if (!element) return false;
	if (canWrite) return true;
	const requested = doc.validationRequests?.[element.id]?.map((request) => request.to) ?? [];
	return requiredValidators(element.owner, validationLead(doc, null), team, requested, element.id).some((person) => samePersonRef(person, actor));
}

/** DRAFT until the current run is published; a new run under way reads DRAFT again, unless it holds what it found: nothing moved yet (criterion 50b00229). */
export function specState(doc: RetrospecDocument): 'draft' | 'validated' {
	const run = currentRun(doc);
	return run?.publishedAt || (writesHeld(run) && lastPublishedRun(doc)) ? 'validated' : 'draft';
}

/** The baseline the first validation captured: version 1.0. */
export function validationBaselineId(doc: RetrospecDocument): string | null {
	return doc.runs.find((r) => r.publishedAt && r.baselineId)?.baselineId ?? null;
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

export function elementStanding(run: RetrospecRun | null, element: SpecElement, lead: PersonRef | null, team: readonly TeamMember[], requested: readonly PersonRef[] = []): ElementStanding {
	const required = requiredValidators(element.owner, lead, team, requested, element.id);
	const verdict = run?.verdicts[element.id];
	const validatedBy = validationsOf(run, element);
	const has = (p: PersonRef) => validatedBy.some((v) => samePersonRef(v, p));
	const missing = required.filter((p) => !has(p));
	// Nobody to wait on (no lead known, nobody holding the job): one validation settles it.
	const settled = required.length > 0 ? missing.length === 0 : validatedBy.length > 0;
	return { state: settled ? 'ok' : validatedBy.length > 0 ? 'waiting' : 'todo', required, validatedBy, missing, rejected: verdict?.flag?.kind === 'rejected' };
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
		const s = elementStanding(run, element, lead, input.team, requested);
		standings[element.id] = s;
		if (s.state === 'ok') validated++;
		else if (s.state === 'waiting') waiting++;
		const requiredCount = Math.max(1, s.required.length);
		need += requiredCount;
		got += s.required.length > 0 ? s.required.length - s.missing.length : s.state === 'ok' ? 1 : 0;
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

export function specValidationSummary(input: SpecValidationInput): SpecValidationSummary {
	return specValidationBoard(input).summary;
}
