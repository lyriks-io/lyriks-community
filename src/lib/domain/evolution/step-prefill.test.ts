import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { createEvolutionRequest, type EvolutionRequest, type FieldThread, type Proposal } from './draft';
import { closeTurn, startSession, takeNextClick, withdrawClick, answerClick } from './live-session';
import {
	ANOTHER_STEP_PREFILL,
	NOTHING_TO_PREFILL,
	ONE_STEP_PREFILL,
	advanceStepPrefill,
	sectionSettled,
	startStepPrefill,
	stepPrefillOf,
	stopStepPrefill,
	stopStepPrefillOnClick,
	type StepPrefillSection
} from './step-prefill';

/**
 * A prefill of a whole step (ac-evo-live-prefill-step): the scenarios of the
 * spec, played on the pure functions the server and the page share.
 */

const ana = 'ana@team.test';
const at = (minute: number) => `2026-10-26T10:${String(minute).padStart(2, '0')}:00.000Z`;
let counter = 0;
const id = () => `id-${++counter}`;

const SECTIONS: StepPrefillSection[] = [
	{ id: 'need-origin', fieldPath: 'request.requester', leafId: null, section: ['request.requester', 'request.origin'] },
	{ id: 'need-current', fieldPath: '00-need.situation', leafId: null, section: ['00-need.situation', '00-need.symptoms', '00-need.cost'] },
	{ id: 'need-target', fieldPath: '00-need.objectives', leafId: null, section: ['00-need.objectives', '00-need.measures'] }
];

function inSession(request: EvolutionRequest = createEvolutionRequest()): EvolutionRequest {
	const outcome = startSession(request, ana, id(), at(0));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
}

function started(request: EvolutionRequest, sections = SECTIONS, step = 'briefing'): EvolutionRequest {
	const outcome = startStepPrefill(request, ana, { step, sections }, true, id, at(1));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
}

/** The AI takes the waiting click, proposes on `fieldPath`, then calls again. */
function answered(request: EvolutionRequest, fieldPath: string, minute: number): EvolutionRequest {
	const taken = takeNextClick(request, ana, at(minute));
	if (!taken) throw new Error('nothing to take');
	const written = answerClick(taken.request, ana, { kind: 'propose', fieldPath, leafId: null }, at(minute));
	return closeTurn(written.request, ana, at(minute))!.request;
}

const asking = (fieldPath: string, answer?: string): Proposal =>
	({
		id: `p-${fieldPath}`,
		targetField: fieldPath,
		canonicalPath: fieldPath,
		decision: 'pending',
		ask: { question: 'For which shop?', choices: [], ...(answer ? { answer: { body: answer, by: ana, at: at(5) } } : {}) }
	}) as unknown as Proposal;

const run = (request: EvolutionRequest) => stepPrefillOf(request, ana)!;

describe('starting a step prefill (rules of "Prefill a whole step with my AI")', () => {
	it('sends the first section its Prefill click, marked as the run’s', () => {
		const request = started(inSession());
		expect(run(request)).toMatchObject({ step: 'briefing', index: 0, state: 'running' });
		const click = request.aiClicks.find((c) => c.id === run(request).clickId)!;
		expect(click).toMatchObject({ kind: 'prefill', fieldPath: 'request.requester', state: 'waiting', stepPrefillId: run(request).id });
		expect(click.section).toEqual(['request.requester', 'request.origin']);
	});

	it('waits for a session like any click: the click is there before one opens', () => {
		const request = started(createEvolutionRequest());
		expect(request.aiClicks.filter((c) => c.state === 'waiting')).toHaveLength(1);
	});

	it('is refused to a viewer, with nothing to walk, and while one runs', () => {
		const viewer = startStepPrefill(inSession(), ana, { step: 'briefing', sections: SECTIONS }, false, id, at(1));
		expect(viewer.ok).toBe(false);
		const empty = startStepPrefill(inSession(), ana, { step: 'briefing', sections: [] }, true, id, at(1));
		expect(!empty.ok && empty.reason).toBe(NOTHING_TO_PREFILL);
		const running = started(inSession());
		const again = startStepPrefill(running, ana, { step: 'briefing', sections: SECTIONS }, true, id, at(2));
		expect(!again.ok && again.reason).toBe(ONE_STEP_PREFILL);
		const other = startStepPrefill(running, ana, { step: 'solutioning', sections: SECTIONS }, true, id, at(2));
		expect(!other.ok && other.reason).toBe(ANOTHER_STEP_PREFILL);
	});
});

describe('moving to the next section (rules of "Move the step prefill to the next section")', () => {
	it('stays on a section whose click is not answered yet', () => {
		const request = started(inSession());
		expect(advanceStepPrefill(request, ana, at(2), id)).toBe(request);
	});

	it('stays while the AI is still on the click, even once it answered it', () => {
		const request = started(inSession());
		const taken = takeNextClick(request, ana, at(2))!;
		const written = answerClick(taken.request, ana, { kind: 'propose', fieldPath: 'request.requester', leafId: null }, at(2)).request;
		expect(advanceStepPrefill(written, ana, at(2), id)).toBe(written);
	});

	it('hands the next section once the AI answered and called again', () => {
		const request = advanceStepPrefill(answered(started(inSession()), 'request.requester', 2), ana, at(3), id);
		expect(run(request)).toMatchObject({ index: 1, state: 'running' });
		const click = request.aiClicks.find((c) => c.id === run(request).clickId)!;
		expect(click).toMatchObject({ fieldPath: '00-need.situation', state: 'waiting' });
	});

	it('is held by the AI’s question in a suggestion until the person answers and the AI rewrites', () => {
		const onCurrent = advanceStepPrefill(answered(started(inSession()), 'request.requester', 2), ana, at(3), id);
		const asked = { ...answered(onCurrent, '00-need.situation', 4), proposals: [asking('00-need.symptoms')] };
		expect(sectionSettled(asked, run(asked))).toBe(false);
		expect(advanceStepPrefill(asked, ana, at(5), id)).toBe(asked);
		// Answered, the question no longer holds it, the rewrite still waiting does.
		const replied = { ...asked, proposals: [asking('00-need.symptoms', 'The one in town')] };
		expect(sectionSettled(replied, run(replied))).toBe(true);
	});

	it('is held by the AI’s question waiting in the thread of one of the section’s questions', () => {
		const onCurrent = advanceStepPrefill(answered(started(inSession()), 'request.requester', 2), ana, at(3), id);
		const thread: FieldThread = {
			id: 't1',
			key: '00-need.cost',
			state: 'open',
			messages: [{ id: 'm1', author: 'ai', authorKind: 'ai_client', body: 'How much bread is thrown away?', postedAt: at(4), awaitsAnswer: true }],
			changeValue: null,
			changedBy: null,
			changedAt: null
		} as FieldThread;
		const asked = { ...answered(onCurrent, '00-need.situation', 4), fieldThreads: [thread] };
		expect(advanceStepPrefill(asked, ana, at(5), id)).toBe(asked);
	});

	it('is done after the last section', () => {
		let request = started(inSession());
		for (const [minute, s] of SECTIONS.entries()) request = advanceStepPrefill(answered(request, s.fieldPath, 2 + minute * 2), ana, at(3 + minute * 2), id);
		expect(run(request).state).toBe('done');
		expect(request.aiClicks.filter((c) => c.state === 'waiting')).toHaveLength(0);
	});
});

describe('stopping a step prefill', () => {
	it('the cross stops the run and withdraws its waiting click', () => {
		const request = started(inSession());
		const outcome = stopStepPrefill(request, ana, at(2));
		if (!outcome.ok) throw new Error(outcome.reason);
		expect(outcome.run.state).toBe('stopped');
		expect(outcome.request.aiClicks.find((c) => c.id === run(request).clickId)?.state).toBe('withdrawn');
		expect(stopStepPrefill(outcome.request, ana, at(3)).ok).toBe(false);
	});

	it('withdrawing the run’s click stops the run, another click does not', () => {
		const request = started(inSession());
		const withdrawn = withdrawClick(request, ana, run(request).clickId);
		if (!withdrawn.ok) throw new Error(withdrawn.reason);
		expect(run(stopStepPrefillOnClick(withdrawn.request, run(request).clickId, at(2))).state).toBe('stopped');
		expect(stopStepPrefillOnClick(request, 'another', at(2))).toBe(request);
	});

	it('a run whose click was withdrawn some other way stops at the next look', () => {
		const request = started(inSession());
		const withdrawn = withdrawClick(request, ana, run(request).clickId);
		if (!withdrawn.ok) throw new Error(withdrawn.reason);
		expect(run(advanceStepPrefill(withdrawn.request, ana, at(2), id)).state).toBe('stopped');
	});
});

describe('kept on the request', () => {
	it('reads back as it was written, the run and the click it sent', () => {
		const request = started(inSession());
		const draft = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request] })), 'p');
		const back = draft.requests[0];
		expect(stepPrefillOf(back, ana)).toEqual(run(request));
		expect(back.aiClicks.find((c) => c.id === run(request).clickId)?.stepPrefillId).toBe(run(request).id);
	});
});
