import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, SectionDraftRepositoryPort, SectionDraftSaveOptions } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { createEmptyEvolutionDraft, openProjectSessionOf, type ProjectEvolutionDraft } from '$domain/evolution';
import { presenceOf, PROJECT_SESSION_KEY } from '$lib/server/evolution-live.server';
import { GET, POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * The session of a person's own AI on the whole project, through its HTTP
 * door: what the AI may do, what only the person may do, and what each act
 * leaves in the dossier, over the real session code and an in-memory store.
 */

const ADA = 'ada@example.test';

function installation(projectId: string, opts: { decide?: (action: AccessAction) => AccessDecision; exists?: boolean } = {}) {
	let stored: ProjectEvolutionDraft | null = null;
	let revision = 0;
	const repo = {
		load: async () => (stored ? structuredClone(stored) : null),
		save: async (draft: ProjectEvolutionDraft, save?: SectionDraftSaveOptions) => {
			if (save?.expectedRevision != null && save.expectedRevision !== revision) return null;
			stored = structuredClone(draft);
			return ++revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	const clock = { nowIso: () => '2026-11-18T03:00:00.000Z' };
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => (opts.decide ?? (() => ({ ok: true })))(action) },
		enterpriseHooks: null,
		projectExists: async (id) => (opts.exists ?? true) && id === projectId,
		currentSession: () => ({ isAuthenticated: true, email: ADA }),
		backLinks: { find: async () => null },
		workspaces: { listForCaller: async () => [] },
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		// A wait looks at the Reverse-Specification's standing: this project holds none.
		sectionDocuments: { currentRevision: async () => revision, load: async () => null },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} }
	});
	const call = async (body: Record<string, unknown>, as: 'person' | 'ai' = 'person') => {
		const event = requestEvent({
			path: '/api/evolution/live',
			method: 'POST',
			body: JSON.stringify({ projectId, ...body }),
			headers: as === 'ai' ? { 'x-lyriks-actor': 'ai_client' } : {},
			authRequired: true,
			services,
			cookies: { lyriks_session: 'jwt' }
		});
		return Promise.resolve(POST(event)).then(
			async (r) => ({ status: r.status, body: JSON.parse((await r.text()).trim() || 'null') }),
			(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
		);
	};
	const read = async () => {
		const event = requestEvent({ path: `/api/evolution/live?projectId=${projectId}`, authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
		return (await Promise.resolve(GET(event))).json();
	};
	return { call, read, stored: () => stored ?? createEmptyEvolutionDraft(projectId), revision: () => revision };
}

describe('the session of the whole project, through its door', () => {
	it('is opened by the AI client only, never by the page', async () => {
		const p = installation('p-start');
		expect((await p.call({ act: 'start' })).status).toBe(403);
		expect(p.revision()).toBe(0);
		const opened = await p.call({ act: 'start' }, 'ai');
		expect(opened).toMatchObject({ status: 200, body: { ok: true, waitingClicks: 0 } });
		expect(openProjectSessionOf(p.stored(), ADA)?.id).toBe(opened.body.session.id);
	});

	it('lets the AI say one sentence on what it does, in its open session only', async () => {
		const p = installation('p-say');
		expect((await p.call({ act: 'say', text: 'Reading the rules' }, 'ai')).status).toBe(409);
		const { body } = await p.call({ act: 'start' }, 'ai');
		expect((await p.call({ act: 'say', text: '   ', sessionId: body.session.id }, 'ai')).status).toBe(400);
		expect((await p.call({ act: 'say', text: 'Reading the rules', sessionId: body.session.id })).status).toBe(403);
		expect((await p.call({ act: 'say', text: 'x'.repeat(500), sessionId: body.session.id }, 'ai')).status).toBe(200);
		expect(presenceOf('p-say', PROJECT_SESSION_KEY, ADA)?.saying).toHaveLength(200);
	});

	it('answers a wait made after the end with the end and its reason, never with a missing session [criterion:45933ee4]', async () => {
		const p = installation('p-after');
		expect((await p.call({ act: 'await', waitSeconds: 1 }, 'ai')).status).toBe(409);
		const { body } = await p.call({ act: 'start' }, 'ai');
		expect(await p.call({ act: 'end' })).toMatchObject({ status: 200, body: { ended: { sessionId: body.session.id, reason: 'ended_by_person' } } });
		expect(await p.call({ act: 'await', sessionId: body.session.id, waitSeconds: 1 }, 'ai')).toMatchObject({
			status: 200,
			body: { kind: 'ended', sessionId: body.session.id, reason: 'ended_by_person' }
		});
		expect((await p.call({ act: 'end' })).status).toBe(409);
	});

	it('keeps a first AI\'s session listening when a second opens, each ending on its own (EVO-015)', async () => {
		const p = installation('p-replaced');
		const first = (await p.call({ act: 'start', client: 'Claude Code' }, 'ai')).body.session.id;
		const opened = (await p.call({ act: 'start', client: 'Codex' }, 'ai')).body;
		const second = opened.session.id;
		expect(second).not.toBe(first);
		expect(opened.others).toMatchObject([{ id: first, name: 'Claude Code' }]);
		expect(await p.call({ act: 'await', sessionId: first, waitSeconds: 1 }, 'ai')).toMatchObject({ status: 200, body: { kind: 'nothing', sessionId: first } });
		await p.call({ act: 'end', sessionId: second });
		expect((await p.call({ act: 'await', sessionId: second, waitSeconds: 1 }, 'ai')).body).toMatchObject({ kind: 'ended', sessionId: second, reason: 'ended_by_person' });
		expect((await p.call({ act: 'await', sessionId: first, waitSeconds: 1 }, 'ai')).body).toMatchObject({ kind: 'nothing', sessionId: first });
	});

	it('takes a click from the person only, and a re-reading only from someone who may edit', async () => {
		const reader = installation('p-reader', { decide: (action) => (action === 'read' ? { ok: true } : { ok: false, reason: 'forbidden' }) });
		const reread = { act: 'click', kind: 'reread', page: 'retrospec', anchor: 'finding:f1', title: 'Cart rule' };
		expect(await reader.call(reread)).toMatchObject({ status: 422, body: { ok: false } });
		expect(reader.revision()).toBe(0);
		const editor = installation('p-editor');
		expect((await editor.call(reread, 'ai')).status).toBe(403);
		const sent = await editor.call(reread);
		expect(sent).toMatchObject({ status: 200, body: { ok: true, inSession: false } });
		expect((await editor.call({ act: 'withdraw', clickId: sent.body.click.id }, 'ai')).status).toBe(403);
		expect((await editor.call({ act: 'withdraw', clickId: sent.body.click.id })).status).toBe(200);
		expect((await editor.read()).clicks.map((c: { state: string }) => c.state)).toEqual(['withdrawn']);
	});

	it('sends a question to the AI through Ask my AI, never as a click', async () => {
		const p = installation('p-ask');
		expect((await p.call({ act: 'click', kind: 'ask_block', page: 'spec', anchor: 'a', title: 't', text: 'Why?' })).status).toBe(400);
		expect(p.revision()).toBe(0);
	});

	it('is refused to a caller who may not read the project, and on a project that does not exist', async () => {
		const stranger = installation('p-closed', { decide: () => ({ ok: false, reason: 'not_found' }) });
		expect((await stranger.call({ act: 'start' }, 'ai')).status).toBe(404);
		const ghost = installation('p-ghost', { exists: false });
		expect((await ghost.call({ act: 'start' }, 'ai')).status).toBe(404);
		expect([stranger.revision(), ghost.revision()]).toEqual([0, 0]);
	});
});
