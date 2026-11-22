import { describe, expect, it } from 'vitest';
import type { SectionDraftRepositoryPort, SectionDraftSaveOptions } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { createEmptyEvolutionDraft, openProjectSessionOf, type ProjectEvolutionDraft } from '$domain/evolution';
import { awaitProjectEvent, closeProjectSession, openProjectSession, projectSessionReading, sendClickOnProject, settleProjectSession, withdrawClickOnProject } from './ai-session.server';
import { presenceOf, PROJECT_SESSION_KEY } from './evolution-live.server';
import { servicesWith } from './request-event.fixture';

/**
 * The session of a person's own AI on the whole project (feat-ai-session),
 * over the real draft load and save use-cases and an in-memory evolution
 * store that keeps a revision: what each act leaves in the store, what the
 * person's page is told, and how a concurrent write is met.
 */

const ADA = 'ada@example.test';
const BOB = 'bob@example.test';

function project(projectId: string, opts: { concurrentWrites?: number } = {}) {
	let stored: ProjectEvolutionDraft | null = null;
	let revision = 0;
	let concurrent = opts.concurrentWrites ?? 0;
	const repo = {
		load: async () => (stored ? structuredClone(stored) : null),
		save: async (draft: ProjectEvolutionDraft, save?: SectionDraftSaveOptions) => {
			// Someone else saves the dossier between our read and our write.
			if (concurrent > 0) {
				concurrent -= 1;
				revision += 1;
			}
			if (save?.expectedRevision != null && save.expectedRevision !== revision) return null;
			stored = structuredClone(draft);
			revision += 1;
			return revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	let now = '2026-11-18T03:00:00.000Z';
	const clock = { nowIso: () => now };
	const services = servicesWith({
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		sectionDocuments: { currentRevision: async () => revision, load: async () => null },
		// No Reverse-Specification on these projects: what a wait reads of it finds nothing.
		draftLock: { current: async () => 0 }
	});
	return {
		services,
		stored: () => stored ?? createEmptyEvolutionDraft(projectId),
		revision: () => revision,
		later: (iso: string) => void (now = iso)
	};
}

describe('opening and ending the session of a person on a project', () => {
	it('opens one session for the person, kept in the dossier, and tells their page the AI listens', async () => {
		const p = project('p-open');
		const opened = await openProjectSession(p.services, 'p-open', ADA);
		expect(openProjectSessionOf(p.stored(), ADA)?.id).toBe(opened.session.id);
		expect(openProjectSessionOf(p.stored(), BOB)).toBeNull();
		expect(presenceOf('p-open', PROJECT_SESSION_KEY, ADA)).toMatchObject({ sessionId: opened.session.id, status: 'listening' });
	});

	it('opens a second AI\'s session beside the first, ending none (EVO-015)', async () => {
		const p = project('p-twice');
		const first = await openProjectSession(p.services, 'p-twice', ADA, { client: 'Claude Code' });
		const second = await openProjectSession(p.services, 'p-twice', ADA, { client: 'Codex' });
		const sessions = p.stored().sessions ?? [];
		expect(sessions.filter((s) => !s.endedAt).map((s) => s.id)).toEqual([first.session.id, second.session.id]);
		expect(second.others.map((o) => o.name)).toEqual(['Claude Code']);
		expect(sessions.some((s) => s.endReason === 'replaced')).toBe(false);
	});

	it('ends the session with its reason and tells the page it ended', async () => {
		const p = project('p-end');
		const opened = await openProjectSession(p.services, 'p-end', ADA);
		const ended = await closeProjectSession(p.services, 'p-end', ADA, 'ended_by_person');
		expect(ended).toMatchObject({ id: opened.session.id, endReason: 'ended_by_person' });
		expect(openProjectSessionOf(p.stored(), ADA)).toBeNull();
		expect(presenceOf('p-end', PROJECT_SESSION_KEY, ADA)).toMatchObject({ status: 'ended', endReason: 'ended_by_person' });
	});

	it('ends nothing, and writes nothing, when there is no session, or another one is named', async () => {
		const p = project('p-none');
		expect(await closeProjectSession(p.services, 'p-none', ADA, 'idle')).toBeNull();
		expect(p.revision()).toBe(0);
		await openProjectSession(p.services, 'p-none', ADA);
		const before = p.revision();
		expect(await closeProjectSession(p.services, 'p-none', ADA, 'idle', 'another-session')).toBeNull();
		expect(p.revision()).toBe(before);
	});

	it('makes its change again on the dossier as another writer left it', async () => {
		const p = project('p-race', { concurrentWrites: 2 });
		const opened = await openProjectSession(p.services, 'p-race', ADA);
		expect(openProjectSessionOf(p.stored(), ADA)?.id).toBe(opened.session.id);
	});

	it('reports a session it could not save after several tries instead of claiming it', async () => {
		const p = project('p-busy', { concurrentWrites: 10 });
		await expect(openProjectSession(p.services, 'p-busy', ADA)).rejects.toThrow('The session could not be saved');
		expect(openProjectSessionOf(p.stored(), ADA)).toBeNull();
	});
});

describe('a session nobody uses any more', () => {
	it('ends as idle when Ask my AI reads it after half an hour with no act of the person nor of their AI', async () => {
		const p = project('p-idle');
		const opened = await openProjectSession(p.services, 'p-idle', ADA);
		p.later('2026-11-18T03:31:00.000Z');
		await settleProjectSession(p.services, 'p-idle', ADA);
		expect(openProjectSessionOf(p.stored(), ADA)).toBeNull();
		expect(projectSessionReading(p.stored(), 'p-idle', ADA).session).toMatchObject({ id: opened.session.id, open: false, endReason: 'idle' });
	});

	it('stays open while the person acted within the half hour', async () => {
		const p = project('p-busy-person');
		const opened = await openProjectSession(p.services, 'p-busy-person', ADA);
		p.later('2026-11-18T03:20:00.000Z');
		await sendClickOnProject(p.services, 'p-busy-person', ADA, { kind: 'ask_block', page: 'spec', anchor: 'a', title: 't', text: 'Why?' }, false);
		p.later('2026-11-18T03:40:00.000Z');
		await settleProjectSession(p.services, 'p-busy-person', ADA);
		expect(openProjectSessionOf(p.stored(), ADA)?.id).toBe(opened.session.id);
	});
});

describe('the clicks a person makes outside a request', () => {
	const question = { kind: 'ask_block' as const, page: 'spec' as const, anchor: 'feature:feat-cart', title: 'Cart', text: 'Why two carts?' };

	it('keeps a question for the person AI, and lets the person withdraw it', async () => {
		const p = project('p-click');
		const sent = await sendClickOnProject(p.services, 'p-click', ADA, question, false);
		if (!sent?.ok) throw new Error('the question was refused');
		expect(projectSessionReading(p.stored(), 'p-click', ADA).clicks.map((c) => [c.id, c.state])).toEqual([[sent.click.id, 'waiting']]);
		const withdrawn = await withdrawClickOnProject(p.services, 'p-click', ADA, sent.click.id);
		expect(withdrawn?.ok).toBe(true);
		expect(projectSessionReading(p.stored(), 'p-click', ADA).clicks.map((c) => c.state)).toEqual(['withdrawn']);
	});

	it('shows a person only their own clicks, and never lets another person withdraw them', async () => {
		const p = project('p-mine');
		const sent = await sendClickOnProject(p.services, 'p-mine', ADA, question, false);
		if (!sent?.ok) throw new Error('the question was refused');
		expect(projectSessionReading(p.stored(), 'p-mine', BOB).clicks).toEqual([]);
		expect((await withdrawClickOnProject(p.services, 'p-mine', BOB, sent.click.id))?.ok).toBe(false);
		expect(projectSessionReading(p.stored(), 'p-mine', ADA).clicks.map((c) => c.state)).toEqual(['waiting']);
	});

	it('refuses a re-reading of the code to someone who may not edit the project, keeping nothing', async () => {
		const p = project('p-reread');
		const reread = { kind: 'reread' as const, page: 'retrospec' as const, anchor: 'finding:f1', title: 'Cart rule' };
		expect((await sendClickOnProject(p.services, 'p-reread', ADA, reread, false))?.ok).toBe(false);
		expect(p.revision()).toBe(0);
		expect((await sendClickOnProject(p.services, 'p-reread', ADA, reread, true))?.ok).toBe(true);
	});

	it('asks for one re-reading of a place at a time, writing nothing for the second ask', async () => {
		const p = project('p-reread-twice');
		const reread = { kind: 'reread' as const, page: 'retrospec' as const, anchor: 'finding:f2', title: 'Cart rule' };
		const first = await sendClickOnProject(p.services, 'p-reread-twice', ADA, reread, true);
		const saved = p.revision();
		const second = await sendClickOnProject(p.services, 'p-reread-twice', ADA, reread, true);
		if (!first?.ok || !second?.ok) throw new Error('the re-reading was refused');
		expect(second.click.id).toBe(first.click.id);
		expect(p.revision()).toBe(saved);
	});

	it('never shows what the AI of an older session is doing as the state of the last one', async () => {
		const p = project('p-older');
		await openProjectSession(p.services, 'p-older', ADA);
		const otherSession = { ...createEmptyEvolutionDraft('p-older'), sessions: [{ id: 'a-later-session', personId: ADA, startedAt: '2026-11-18T03:05:00.000Z' }] };
		expect(projectSessionReading(otherSession, 'p-older', ADA).presence).toBeNull();
	});

	it('reads the session it opened, open, with no click of another person', async () => {
		const p = project('p-read');
		const opened = await openProjectSession(p.services, 'p-read', ADA);
		await sendClickOnProject(p.services, 'p-read', BOB, question, false);
		const reading = projectSessionReading(p.stored(), 'p-read', ADA);
		expect(reading.session).toMatchObject({ id: opened.session.id, open: true, endedAt: null });
		expect(reading.presence?.sessionId).toBe(opened.session.id);
		expect(reading.clicks).toEqual([]);
	});
});

describe('an AI waiting with nothing to do writes nothing', () => {
	it('leaves the dossier and its revision untouched across its looks, so no page reloads and no cached reading is thrown away', async () => {
		const p = project('p-idle-wait');
		const opened = await openProjectSession(p.services, 'p-idle-wait', ADA);
		const before = p.revision();
		const answer = await awaitProjectEvent(p.services, { projectId: 'p-idle-wait', personId: ADA, sessionId: opened.session.id, waitSeconds: 1 }, { aborted: () => false, onAbort: () => {} });
		expect(answer.kind).toBe('nothing');
		expect(p.revision()).toBe(before);
	});
});
