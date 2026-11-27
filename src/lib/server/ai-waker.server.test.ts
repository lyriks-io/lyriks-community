import { describe, expect, it } from 'vitest';
import type { SectionDraftRepositoryPort } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { createEmptyEvolutionDraft, type ProjectEvolutionDraft } from '$domain/evolution';
import { openProjectSession, sendClickOnProject } from './ai-session.server';
import { awaitWake, wakerReading } from './ai-waker.server';
import { servicesWith } from './request-event.fixture';

/**
 * The person's waker on a project (feat-ai-session), over the real draft load
 * and save use-cases and an in-memory evolution store: what its held call
 * answers, and what the person's pages read of it and of their last wake.
 */

const ADA = 'ada@example.test';
const BOB = 'bob@example.test';
const S = '1f2ed844';
const HOOKS = { aborted: () => false, onAbort: () => {} };
const QUESTION = { kind: 'ask_block' as const, page: 'spec' as const, anchor: 'a', title: 't', text: 'Why?' };

function project() {
	let stored: ProjectEvolutionDraft | null = null;
	let revision = 0;
	const repo = {
		load: async () => (stored ? structuredClone(stored) : null),
		save: async (draft: ProjectEvolutionDraft) => {
			stored = structuredClone(draft);
			revision += 1;
			return revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	let now = '2026-11-25T23:00:00.000Z';
	const clock = { nowIso: () => now };
	const services = servicesWith({
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		sectionDocuments: { currentRevision: async () => revision, load: async () => null },
		draftLock: { current: async () => 0 }
	});
	return {
		services,
		reading: async (projectId: string, personId = ADA) => wakerReading(await services.loadEvolutionDraft.execute(projectId), projectId, personId, Date.parse(now)),
		later: (iso: string) => void (now = iso)
	};
}

describe('the waker of a person on a project', () => {
	it(`answers a wake once a click waits and none of their AIs is in session, and the woken AI settles it by opening its session [criterion:7cfc6440] [unspa:${S}:3a4b3288:0b17123e]`, async () => {
		const p = project();
		expect((await p.reading('p-wake')).status).toBe('none');
		await sendClickOnProject(p.services, 'p-wake', ADA, QUESTION, false);
		const answer = await awaitWake(p.services, { projectId: 'p-wake', personId: ADA, waitSeconds: 1 }, HOOKS);
		expect(answer).toEqual({ kind: 'wake', clicks: 1, wokenAt: '2026-11-25T23:00:00.000Z' });
		expect(await p.reading('p-wake')).toEqual({ status: 'listening', wake: 'handed', handedAt: '2026-11-25T23:00:00.000Z' });
		// One woken AI at a time: while it starts, the waker is handed nothing more.
		expect((await awaitWake(p.services, { projectId: 'p-wake', personId: ADA, waitSeconds: 1 }, HOOKS)).kind).toBe('nothing');
		p.later('2026-11-25T23:00:40.000Z');
		await openProjectSession(p.services, 'p-wake', ADA, { client: 'Claude Code (woken)' });
		expect((await p.reading('p-wake')).wake).toBe('opened');
	});

	it(`wakes nothing while an AI of the person is in session: the click goes to it [unspa:${S}:ccca0911:3381fb15]`, async () => {
		const p = project();
		await openProjectSession(p.services, 'p-busy', ADA, { client: 'Codex' });
		await sendClickOnProject(p.services, 'p-busy', ADA, QUESTION, false);
		expect((await awaitWake(p.services, { projectId: 'p-busy', personId: ADA, waitSeconds: 1 }, HOOKS)).kind).toBe('nothing');
	});

	it('hears only its own person: a teammate\'s click never wakes it [criterion:a29d5d5d]', async () => {
		const p = project();
		await sendClickOnProject(p.services, 'p-team', BOB, QUESTION, false);
		expect((await awaitWake(p.services, { projectId: 'p-team', personId: ADA, waitSeconds: 1 }, HOOKS)).kind).toBe('nothing');
		expect((await p.reading('p-team', ADA)).status).toBe('listening');
		expect((await p.reading('p-team', BOB)).status).toBe('none');
	});

	it(`reads not woken once no session opened in time, and gone once unheard [unspa:${S}:be0ba713:ab61a6fb] [unspa:${S}:6f9b9352:dfbda8b7]`, async () => {
		const p = project();
		await sendClickOnProject(p.services, 'p-late', ADA, QUESTION, false);
		expect((await awaitWake(p.services, { projectId: 'p-late', personId: ADA, waitSeconds: 1 }, HOOKS)).kind).toBe('wake');
		p.later('2026-11-25T23:03:00.000Z');
		expect(await p.reading('p-late')).toMatchObject({ status: 'gone', wake: 'not_woken' });
		// The same clicks never wake it again on their own; a new click does.
		expect((await awaitWake(p.services, { projectId: 'p-late', personId: ADA, waitSeconds: 1 }, HOOKS)).kind).toBe('nothing');
		p.later('2026-11-25T23:03:30.000Z');
		await sendClickOnProject(p.services, 'p-late', ADA, { ...QUESTION, anchor: 'b', text: 'And this?' }, false);
		expect((await awaitWake(p.services, { projectId: 'p-late', personId: ADA, waitSeconds: 1 }, HOOKS)).kind).toBe('wake');
	});
});
