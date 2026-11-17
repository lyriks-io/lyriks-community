import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { createEvolutionRequest, type EvolutionRequest, type HistoryEntry, type Proposal } from './draft';
import { endSession, openSessionOf, sendClick, startSession } from './live-session';
import { handToWaitingCall, hearProgress } from './live-progress';

/**
 * The person's own progress reaches their AI in session
 * (ac-evo-live-progress-wakes): the scenarios of "Note the person's progress"
 * (aa7b2679) and "Hand the person's progress to the AI" (b4cc0d9c), played on
 * the pure functions the waiting call uses.
 */

const ana = 'ana@team.test';
const at = (minute: number) => `2026-10-28T10:${String(minute).padStart(2, '0')}:00.000Z`;

function opened(request: EvolutionRequest = createEvolutionRequest()): EvolutionRequest {
	const outcome = startSession(request, ana, 'session-1', at(0));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
}

/** The waiting call looks once: the AI just called (`first`), as the server's first look does. */
function listened(request: EvolutionRequest, minute = 1): EvolutionRequest {
	return hearProgress(request, ana, at(minute), true).request;
}

function validatedNeed(request: EvolutionRequest, kind: 'person' | 'ai_client', minute: number): EvolutionRequest {
	return { ...request, stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: ana, kind, at: at(minute) }] }] };
}

function stamped(type: HistoryEntry['type'], authorKind: HistoryEntry['authorKind'], minute: number, proposalId: string | null = null): HistoryEntry {
	return {
		id: `h-${type}-${minute}`,
		type,
		summary: type,
		authorId: ana,
		authorKind,
		recordedAt: at(minute),
		proposalId,
		acceptedByPersonId: null,
		supersededById: null,
		channel: authorKind === 'person' ? 'page' : 'ai_client'
	};
}

const proposal = (id: string, decision: Proposal['decision']): Proposal => ({ id, decision }) as unknown as Proposal;

describe('the person moves the request on in session [criterion:ac-leaf-ac-evo-live-progress-wakes]', () => {
	it('validating the Need reaches the waiting call once [unspa:df8a4b0e:aa7b2679:39b48da7] [unspa:df8a4b0e:b4cc0d9c:7d25670e]', () => {
		const listening = listened(opened());
		const moved = validatedNeed(listening, 'person', 3);
		const handed = handToWaitingCall(moved, ana, at(4), false);
		expect(handed.kind).toBe('progress');
		if (handed.kind !== 'progress') return;
		expect(handed.progress.happened).toEqual(['Need validated']);
		expect(handed.progress.stepsValidated).toEqual(['need']);
		// Heard once: the next look finds nothing new.
		expect(handToWaitingCall(handed.request, ana, at(5), false).kind).toBe('wait');
	});

	it('from the session to the AI hearing the person moved on [unspa:df8a4b0e:b4cc0d9c:b8afa6f6]', () => {
		const request = validatedNeed(listened(opened()), 'person', 2);
		expect(hearProgress(request, ana, at(3), false).progress?.happened).toEqual(['Need validated']);
	});

	it("the AI's own write never wakes it [unspa:df8a4b0e:aa7b2679:4700bdf4]", () => {
		const listening = listened(opened());
		// Under delegation the AI validates the Need, then calls again.
		const byAi = validatedNeed(listening, 'ai_client', 3);
		expect(hearProgress(byAi, ana, at(4), true).progress).toBeNull();
		// It withdrew its last suggestion: nothing waits on the person any more, and nobody decided anything.
		const waiting = listened({ ...opened(), proposals: [proposal('p1', 'pending')] });
		const withdrawn = { ...waiting, proposals: [], history: [stamped('withdrawn_proposal', 'ai_client', 3, 'p1')] };
		expect(hearProgress(withdrawn, ana, at(4), false).progress).toBeNull();
	});

	it('no session, nothing is kept for the AI [unspa:df8a4b0e:aa7b2679:fa790e8b]', () => {
		const request = validatedNeed(createEvolutionRequest(), 'person', 3);
		const heard = hearProgress(request, ana, at(4), true);
		expect(heard.progress).toBeNull();
		expect(heard.request).toBe(request);
		const ended = endSession(listened(opened()), ana, 'ended_by_person', at(2));
		if (!ended.ok) throw new Error(ended.reason);
		expect(hearProgress(validatedNeed(ended.request, 'person', 3), ana, at(4), false).progress).toBeNull();
	});

	it('a click that waits goes first [unspa:df8a4b0e:b4cc0d9c:f1b8f9d6]', () => {
		const moved = validatedNeed(listened(opened()), 'person', 3);
		const clicked = sendClick(moved, ana, { kind: 'prefill', fieldPath: 'step.solution.description', leafId: null }, true, 'c1', at(3));
		if (!clicked.ok) throw new Error(clicked.reason);
		const first = handToWaitingCall(clicked.request, ana, at(4), false);
		expect(first.kind).toBe('click');
		// The progress is still unheard: the AI hears it on its next call.
		const next = handToWaitingCall(first.request, ana, at(6), true);
		expect(next.kind).toBe('progress');
	});

	it('nothing moved, the call keeps waiting [unspa:df8a4b0e:b4cc0d9c:627541d8]', () => {
		const listening = listened(opened());
		const handed = handToWaitingCall(listening, ana, at(5), false);
		expect(handed.kind).toBe('wait');
		expect(handed.request).toBe(listening);
	});

	it('the last suggestion that waited on the person decided, by the person', () => {
		const waiting = listened({ ...opened(), proposals: [proposal('p1', 'pending'), proposal('p2', 'pending')] });
		const oneLeft = { ...waiting, proposals: [proposal('p1', 'refused'), proposal('p2', 'pending')] };
		expect(hearProgress(oneLeft, ana, at(3), false).progress).toBeNull();
		const allDecided = {
			...oneLeft,
			proposals: [proposal('p1', 'refused'), proposal('p2', 'accepted')],
			history: [stamped('accepted_proposal', 'person', 4, 'p2')]
		};
		expect(hearProgress(allDecided, ana, at(5), false).progress?.happened).toEqual(['Every suggestion that waited on the person is decided']);
	});

	it('a crossing the person made into another stage', () => {
		const listening = listened(opened());
		const crossed = { ...listening, stage: 'coherence' as const, history: [stamped('stage_crossing', 'person', 3)] };
		expect(hearProgress(crossed, ana, at(4), false).progress?.crossedInto).toBe('coherence');
		const byAi = { ...listening, stage: 'coherence' as const, history: [stamped('stage_crossing', 'ai_client', 3)] };
		expect(hearProgress(byAi, ana, at(4), true).progress).toBeNull();
	});

	it('what the AI last heard survives a save', () => {
		const heard = listened(opened());
		const [read] = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [heard] })), 'p').requests;
		expect(openSessionOf(read, ana)?.heard).toEqual(openSessionOf(heard, ana)?.heard);
	});
});
