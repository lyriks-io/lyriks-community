import { describe, expect, it } from 'vitest';
import type { SectionDraftRepositoryPort, SectionDraftSaveOptions } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { createEmptyEvolutionDraft, createEvolutionRequest, lastSessionOf, openSessionOf, startSession, type AiClick, type ProjectEvolutionDraft } from '$domain/evolution';
import { awaitNextClick, noteAiCall, noticeOf, presenceOf, say, sayCancelled, sayDoing, sayEnded, sayOpened } from './evolution-live.server';
import { servicesWith } from './request-event.fixture';

/**
 * A live session of a person's AI on one Evolution request
 * (feat-evo-live-session): what the person's page reads of their AI, and the
 * waiting call that hands the AI the person's next act, over the real draft
 * load and save use-cases and an in-memory evolution store.
 */

const ADA = 'ada@example.test';
const NOW = '2026-11-18T03:00:00.000Z';

function project(projectId: string, opts: { session?: string } = {}) {
	let request = createEvolutionRequest({ id: 'r1', status: 'open', stage: 'specification' });
	if (opts.session) {
		const started = startSession(request, ADA, opts.session, NOW);
		if (!started.ok) throw new Error('the session could not start');
		request = started.request;
	}
	let stored: ProjectEvolutionDraft = { ...createEmptyEvolutionDraft(projectId), requests: [request] };
	let revision = 1;
	const repo = {
		load: async () => structuredClone(stored),
		save: async (draft: ProjectEvolutionDraft, save?: SectionDraftSaveOptions) => {
			if (save?.expectedRevision != null && save.expectedRevision !== revision) return null;
			stored = structuredClone(draft);
			return ++revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	const clock = { nowIso: () => NOW };
	const services = servicesWith({
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		sectionDocuments: { currentRevision: async () => revision }
	});
	return { services, request: () => stored.requests[0] };
}

const base = (projectId: string, sessionId = 's1') => ({ projectId, requestId: 'r1', personId: ADA, sessionId });

describe('what the person reads of their AI', () => {
	it('listens once the session opens, and numbers each step the AI announces from there', () => {
		const { services } = project('p-steps');
		sayOpened(services, base('p-steps'));
		expect(presenceOf('p-steps', 'r1', ADA)).toMatchObject({ status: 'listening', saying: null, step: null });
		sayDoing(services, base('p-steps'), 'Reading the need');
		sayDoing(services, base('p-steps'), 'Writing the rules');
		expect(presenceOf('p-steps', 'r1', 'ADA@example.test')).toMatchObject({ status: 'writing', saying: 'Writing the rules', step: 2 });
	});

	it('starts counting again for a new session', () => {
		const { services } = project('p-new');
		sayDoing(services, base('p-new', 's1'), 'One');
		sayDoing(services, base('p-new', 's1'), 'Two');
		sayDoing(services, base('p-new', 's2'), 'Again');
		expect(presenceOf('p-new', 'r1', ADA)).toMatchObject({ sessionId: 's2', step: 1 });
	});

	it('reads writing on a write of the AI, and leaves a listening, cancelled or ended session as it is', () => {
		const { services } = project('p-calls');
		say(services, base('p-calls'), 'thinking', { thinkingAbout: 'the cart rule' });
		noteAiCall(services, 'p-calls', 'r1', ADA, 'read');
		expect(presenceOf('p-calls', 'r1', ADA)).toMatchObject({ status: 'thinking', thinkingAbout: 'the cart rule' });
		noteAiCall(services, 'p-calls', 'r1', ADA, 'write');
		expect(presenceOf('p-calls', 'r1', ADA)?.status).toBe('writing');
		for (const [act, status] of [[sayCancelled, 'cancelled'], [sayOpened, 'listening']] as const) {
			act(services, base('p-calls'));
			noteAiCall(services, 'p-calls', 'r1', ADA, 'write');
			expect(presenceOf('p-calls', 'r1', ADA)?.status, status).toBe(status);
		}
		sayEnded(services, base('p-calls'), 'ended_by_person');
		noteAiCall(services, 'p-calls', 'r1', ADA, 'write');
		expect(presenceOf('p-calls', 'r1', ADA)).toMatchObject({ status: 'ended', endReason: 'ended_by_person', saying: null, step: null });
	});

	it('reads gone, not ended, when the AI went away', () => {
		const { services } = project('p-gone');
		sayDoing(services, base('p-gone'), 'Working');
		sayEnded(services, base('p-gone'), 'gone');
		expect(presenceOf('p-gone', 'r1', ADA)).toMatchObject({ status: 'gone', endReason: 'gone', saying: null, step: null });
	});
});

describe('whose AI the page reads', () => {
	it('keeps each person, request and project apart', () => {
		const { services } = project('p-apart');
		sayDoing(services, base('p-apart'), 'Ada at work');
		sayOpened(services, { ...base('p-apart'), personId: 'bob@example.test', sessionId: 's9' });
		sayOpened(services, { ...base('p-apart'), requestId: 'r2', sessionId: 's8' });
		sayOpened(services, { ...base('p-elsewhere'), sessionId: 's7' });
		expect(presenceOf('p-apart', 'r1', ADA)).toMatchObject({ sessionId: 's1', saying: 'Ada at work' });
		expect(presenceOf('p-apart', 'r1', 'bob@example.test')?.sessionId).toBe('s9');
		expect(presenceOf('p-apart', 'r2', ADA)?.sessionId).toBe('s8');
		expect(presenceOf('p-other', 'r1', ADA)).toBeNull();
	});
});

describe('what the AI is told when the person cancelled its request', () => {
	it('counts what went back and what stayed, and says nothing when nothing was cancelled', () => {
		expect(noticeOf(null)).toEqual({});
		const click: AiClick = {
			id: 'c1', personId: ADA, kind: 'prefill', fieldPath: '00-need.problem', leafId: null, at: NOW, state: 'cancelled',
			cancellation: { at: NOW, undone: 2, kept: ['rules.r1'] }
		};
		expect(noticeOf(click).cancelled).toMatchObject({ clickId: 'c1', undone: 2, kept: ['rules.r1'] });
	});
});

describe('the waiting call of the AI', () => {
	const never = { aborted: () => false, onAbort: () => {} };

	it('answers that the session ended when the AI waits on a session that is not open', async () => {
		const { services } = project('p-closed');
		const answer = await awaitNextClick(services, { ...base('p-closed', 's-unknown'), waitSeconds: 1 }, never);
		// Another AI's session never ends this one: an unknown session reads ended, never replaced (EVO-015).
		expect(answer).toMatchObject({ kind: 'ended', reason: 'ended_by_person' });
		expect(presenceOf('p-closed', 'r1', ADA)).toMatchObject({ status: 'ended', sessionId: 's-unknown' });
	});

	it('answers nothing once the wait is over, the session still open and listening', async () => {
		const { services, request } = project('p-wait', { session: 's1' });
		const answer = await awaitNextClick(services, { ...base('p-wait'), waitSeconds: 1 }, never);
		expect(answer).toMatchObject({ kind: 'nothing' });
		expect(openSessionOf(request(), ADA)?.id).toBe('s1');
		expect(presenceOf('p-wait', 'r1', ADA)?.status).toBe('listening');
	});

	it('ends the session as gone when the waiting call drops', async () => {
		const { services, request } = project('p-drop', { session: 's1' });
		let hangUp: () => void = () => {};
		const waiting = awaitNextClick(services, { ...base('p-drop'), waitSeconds: 60 }, { aborted: () => false, onAbort: (listener) => (hangUp = listener) });
		await new Promise((resolve) => setTimeout(resolve, 20));
		hangUp();
		expect(await waiting).toEqual({ kind: 'ended', reason: 'gone' });
		expect(openSessionOf(request(), ADA)).toBeNull();
		expect(lastSessionOf(request(), ADA)).toMatchObject({ id: 's1', endReason: 'gone' });
		expect(presenceOf('p-drop', 'r1', ADA)?.status).toBe('gone');
	});
});
