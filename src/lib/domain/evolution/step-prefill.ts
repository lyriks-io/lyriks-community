import { leafOf } from './acts';
import { fieldKey } from './blocks';
import type { EvolutionRequest } from './draft';
import { latestThread } from './field-thread';
import { firstRefusal, guard, refuse, type Refused } from './guard';
import { waitingQuestionOf } from './live-exchange';
import { clickAllowed, openSessionOf, sectionOf, sendClick, type AiClick } from './live-session';
import { personKey } from './named-validators';

/**
 * A prefill of a whole step (ac-evo-live-prefill-step): the person clicks once
 * on the step and their AI walks its sections in order, receiving the Prefill
 * click of the next one only once the one before is settled. The run is kept on
 * the request, so a session that ends loses no section of it.
 */

/** One section a step prefill walks: the block the page brings into view, and the Prefill click it sends. */
export interface StepPrefillSection {
	/** The section's block on the page, brought under the header and marked while the run is on it. */
	readonly id: string;
	/** The question the click bears on: the first one left empty, as the section's own Prefill does. */
	readonly fieldPath: string;
	readonly leafId: string | null;
	/** Every question of the section the click covers. */
	readonly section: readonly string[];
}

export type StepPrefillState = 'running' | 'done' | 'stopped';

export interface StepPrefill {
	readonly id: string;
	readonly personId: string;
	/** The step of the page it walks, as the page names it. */
	readonly step: string;
	readonly sections: readonly StepPrefillSection[];
	/** The section it is on, from 0. */
	readonly index: number;
	/** The Prefill click sent for that section. */
	readonly clickId: string;
	readonly state: StepPrefillState;
	readonly startedAt: string;
	readonly endedAt?: string;
}

/** Sections a run walks at most: the steps of the page hold a few, never the whole dossier. */
const MAX_SECTIONS = 12;
/** Runs kept per request, the running ones and the latest settled. */
const KEPT_RUNS = 20;

export const ONE_STEP_PREFILL = 'Lyriks is already prefilling this step.';
export const ANOTHER_STEP_PREFILL = 'Lyriks is already prefilling another step: stop it first.';
export const NOTHING_TO_PREFILL = 'Every section of this step is validated: nothing is left to prefill.';

const same = (a: string, b: string) => personKey(a) === personKey(b);
const runsOf = (request: Pick<EvolutionRequest, 'stepPrefills'>) => request.stepPrefills ?? [];
const clicksOf = (request: Pick<EvolutionRequest, 'aiClicks'>) => request.aiClicks ?? [];

/** The person's latest step prefill on the request, running or settled. */
export function stepPrefillOf(request: Pick<EvolutionRequest, 'stepPrefills'>, personId: string): StepPrefill | null {
	const mine = runsOf(request).filter((r) => same(r.personId, personId));
	return mine.length > 0 ? mine[mine.length - 1] : null;
}

function runningOf(request: Pick<EvolutionRequest, 'stepPrefills'>, personId: string): StepPrefill | null {
	const last = stepPrefillOf(request, personId);
	return last?.state === 'running' ? last : null;
}

function withRun(request: EvolutionRequest, run: StepPrefill): EvolutionRequest {
	const runs = runsOf(request);
	const kept = runs.some((r) => r.id === run.id) ? runs.map((r) => (r.id === run.id ? run : r)) : [...runs, run];
	return { ...request, stepPrefills: kept.slice(-KEPT_RUNS) };
}

/** Sends the Prefill click of a section of the run, marked as the run's. */
function sendSectionClick(request: EvolutionRequest, personId: string, section: StepPrefillSection, runId: string, id: string, at: string) {
	const sent = sendClick(request, personId, { kind: 'prefill', fieldPath: section.fieldPath, leafId: section.leafId, section: section.section }, true, id, at);
	if (!sent.ok) return sent;
	const click: AiClick = { ...sent.click, stepPrefillId: runId };
	return { ok: true as const, click, request: { ...sent.request, aiClicks: clicksOf(sent.request).map((c) => (c.id === click.id ? click : c)) } };
}

export type StepPrefillOutcome = { readonly ok: true; readonly request: EvolutionRequest; readonly run: StepPrefill } | Refused;

/**
 * The person prefills a whole step with their AI ("Prefill a whole step with
 * my AI"): the run starts on the first section the page names, whose Prefill
 * click waits for the AI like any other click, session or not.
 */
export function startStepPrefill(
	request: EvolutionRequest,
	personId: string,
	input: { readonly step: string; readonly sections: readonly StepPrefillSection[] },
	canEdit: boolean,
	newId: () => string,
	at: string
): StepPrefillOutcome {
	const running = runningOf(request, personId);
	const sections = input.sections.filter((s) => s.id && s.fieldPath).slice(0, MAX_SECTIONS);
	const allowed = firstRefusal(
		clickAllowed('prefill', canEdit),
		guard(!input.step, 'A step prefill needs the step it walks.', 'The magic icon sits on the pill of the step shown.'),
		guard(!!running && running.step === input.step, ONE_STEP_PREFILL, 'While it runs, the icon shows the section it is on and the cross that stops it.'),
		guard(!!running && running.step !== input.step, ANOTHER_STEP_PREFILL, 'A person runs one step prefill at a time on a request.'),
		guard(sections.length === 0, NOTHING_TO_PREFILL, 'A run covers the sections holding a question to prefill whose answers are not all validated.')
	);
	if (!allowed.ok) return allowed;
	const runId = newId();
	const sent = sendSectionClick(request, personId, sections[0], runId, newId(), at);
	if (!sent.ok) return sent;
	const run: StepPrefill = { id: runId, personId, step: input.step, sections, index: 0, clickId: sent.click.id, state: 'running', startedAt: at };
	return { ok: true, run, request: withRun(sent.request, run) };
}

/** A run that goes no further: the click it sent is withdrawn while it still waits, one in the AI's hands finishes. */
function stopped(request: EvolutionRequest, run: StepPrefill, at: string): EvolutionRequest {
	const ended: StepPrefill = { ...run, state: 'stopped', endedAt: at };
	const aiClicks = clicksOf(request).map((c) => (c.id === run.clickId && c.state === 'waiting' ? { ...c, state: 'withdrawn' as const } : c));
	return withRun({ ...request, aiClicks }, ended);
}

/** The person stops their running step prefill with the cross beside its icon ("Stop the step prefill"). */
export function stopStepPrefill(request: EvolutionRequest, personId: string, at: string): StepPrefillOutcome {
	const running = runningOf(request, personId);
	if (!running) return refuse('No prefill of this step runs.', 'The cross only shows while a run goes.');
	const after = stopped(request, running, at);
	return { ok: true, request: after, run: stepPrefillOf(after, personId) ?? running };
}

/**
 * Withdrawing or cancelling the click a run sent for its section stops the run
 * (rules of "Withdraw a click" and "Cancel the request in progress"); the
 * request unchanged for any other click.
 */
export function stopStepPrefillOnClick(request: EvolutionRequest, clickId: string, at: string): EvolutionRequest {
	const run = runsOf(request).find((r) => r.state === 'running' && r.clickId === clickId);
	return run ? withRun(request, { ...run, state: 'stopped', endedAt: at }) : request;
}

/**
 * Whether the section a run is on is settled: the click sent for it was
 * answered, no click of the person waits on its questions or is in the AI's
 * hands, and no question of the AI waits there for the person's answer, in a
 * suggestion or in a thread. Its suggestions may still wait for a decision.
 */
export function sectionSettled(request: EvolutionRequest, run: StepPrefill): boolean {
	const click = clicksOf(request).find((c) => c.id === run.clickId);
	if (click?.state !== 'answered') return false;
	const section = run.sections[run.index];
	const keys = new Set(sectionOf({ fieldPath: section.fieldPath, section: section.section }).map((path) => fieldKey(path, section.leafId)));
	const pending = clicksOf(request).some(
		(c) => same(c.personId, run.personId) && (c.state === 'waiting' || c.state === 'taken') && keys.has(fieldKey(c.fieldPath, c.leafId))
	);
	if (pending) return false;
	const asks = request.proposals.some((p) => p.decision === 'pending' && !!p.ask && !p.ask.answer && keys.has(fieldKey(p.targetField, leafOf(p))));
	if (asks) return false;
	return ![...keys].some((key) => {
		const thread = latestThread(request, key);
		return !!thread && waitingQuestionOf(thread.messages, run.personId) !== null;
	});
}

/**
 * Moves the person's running step prefill on ("Move the step prefill to the
 * next section"): once the AI holds no click and the section is settled, the
 * next section's Prefill click waits for the AI, or the run is done after the
 * last one. A click of the run withdrawn or cancelled meanwhile stopped it.
 */
export function advanceStepPrefill(request: EvolutionRequest, personId: string, at: string, newId: () => string): EvolutionRequest {
	const run = runningOf(request, personId);
	if (!run) return request;
	const click = clicksOf(request).find((c) => c.id === run.clickId);
	if (!click || click.state === 'withdrawn' || click.state === 'cancelled') return withRun(request, { ...run, state: 'stopped', endedAt: at });
	const aiHolds = !!openSessionOf(request, personId)?.currentClickId || clicksOf(request).some((c) => same(c.personId, personId) && c.state === 'taken');
	if (aiHolds || !sectionSettled(request, run)) return request;
	const index = run.index + 1;
	if (index >= run.sections.length) return withRun(request, { ...run, state: 'done', endedAt: at });
	const sent = sendSectionClick(request, personId, run.sections[index], run.id, newId(), at);
	if (!sent.ok) return request;
	return withRun(sent.request, { ...run, index, clickId: sent.click.id });
}
