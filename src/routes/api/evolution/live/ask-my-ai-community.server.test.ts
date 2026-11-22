import { describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createEmptyFeaturesDraft } from '$domain/features';
import type { SectionDraftRepositoryPort, SectionDraftSaveOptions, SectionDocumentStorePort } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { AiConversationsUseCase } from '$application/collaboration/ai-conversations';
import { createEmptyEvolutionDraft, type ProjectEvolutionDraft } from '$domain/evolution';
import { AI_CONVERSATIONS_SECTION } from '$lib/shared/section-sync';
import { aiStanding } from '$ui/ai-session/ai-standing';
import { requestEvent, servicesWith, type FakeServices } from '$lib/server/request-event.fixture';
import { GET as readSession, POST as liveAct } from './+server';
import { POST as askAct, GET as readConversations } from '../../../projects/[projectId]/ask/+server';
import { POST as evolutionBatch } from '../+server';

/**
 * Ask my AI on a Community installation (EVO-008, feat 11), through the real
 * doors a person's page and their AI client reach: the session of the project
 * and the answer to a click made outside a request stay open on Community,
 * while every operation of an Evolution request is still refused there.
 */

// The dossier as an empty project reads it, over the session and clicks the store really holds: the
// view also reads the other sections, which a project holding only a conversation leaves empty.
vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async (
		services: { loadEvolutionDraft: { execute(id: string): Promise<ProjectEvolutionDraft> }; sectionDocuments: { currentRevision(id: string, section: string): Promise<number> } },
		projectId: string
	) => ({
		projectId,
		draft: await services.loadEvolutionDraft.execute(projectId),
		features: createEmptyFeaturesDraft(projectId),
		data: { projectId, entities: [], fields: [] },
		leaves: [],
		sources: [],
		glossaryTerms: [],
		members: [],
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: await services.sectionDocuments.currentRevision(projectId, 'evolution'),
		language: 'en'
	})
}));

const ADA = 'ada@example.test';
const PROJECT = 'todomatic';

/** A section document store in memory, with the optimistic revision the real one keeps. */
function memoryDocuments(): SectionDocumentStorePort {
	const rows = new Map<string, { document: unknown; revision: number }>();
	return {
		load: async (projectId, section) => structuredClone(rows.get(`${projectId}/${section}`)?.document ?? null),
		save: async (projectId, section, document, expected) => {
			const key = `${projectId}/${section}`;
			const revision = rows.get(key)?.revision ?? 0;
			if (expected !== null && expected !== revision) return null;
			rows.set(key, { document: structuredClone(document), revision: revision + 1 });
			return revision + 1;
		},
		currentRevision: async (projectId, section) => rows.get(`${projectId}/${section}`)?.revision ?? 0
	};
}

function communityInstallation(extra: FakeServices = {}) {
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
	const clock = { nowIso: () => '2026-11-20T03:00:00.000Z' };
	const documents = memoryDocuments();
	const services = servicesWith({
		installEdition: () => 'community',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => ({ ok: true }) },
		enterpriseHooks: null,
		projectExists: async (id) => id === PROJECT,
		currentSession: () => ({ isAuthenticated: true, email: ADA }),
		backLinks: { find: async () => null },
		workspaces: { listForCaller: async () => [] },
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		// The dossier keeps its own revision; every other section document lives in the store.
		sectionDocuments: { ...documents, currentRevision: async (id: string, section: string) => (section === 'evolution' ? revision : documents.currentRevision(id, section)) },
		aiConversations: new AiConversationsUseCase(documents, AI_CONVERSATIONS_SECTION),
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		implementationCoverage: { invalidate: () => {} },
		captureBaseline: { execute: async () => null },
		scheduleBackSync: async () => {},
		...extra
	});
	const event = (path: string, init: { method?: string; body?: unknown; ai?: boolean; params?: Record<string, string> } = {}) =>
		requestEvent({
			path,
			method: init.method ?? 'GET',
			...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
			headers: init.ai ? { 'x-lyriks-actor': 'ai_client' } : {},
			authRequired: true,
			services,
			cookies: { lyriks_session: 'jwt' },
			params: init.params ?? {}
		});
	const answered = async (run: () => Response | Promise<Response>) =>
		Promise.resolve()
			.then(run)
			.then(
				async (r) => ({ status: r.status, body: JSON.parse((await r.text()).trim() || 'null') }),
				(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
			);
	return {
		live: (body: Record<string, unknown>, ai = true) => answered(() => liveAct(event('/api/evolution/live', { method: 'POST', body: { projectId: PROJECT, ...body }, ai }) as never)),
		standing: async () => {
			const reading = await (await readSession(event(`/api/evolution/live?projectId=${PROJECT}`) as never)).json();
			const presence = reading.presence as { status: 'listening' | 'thinking' | 'writing'; thinkingAbout: string | null; saying: string | null } | null;
			return aiStanding(presence ? { isOpen: !!reading.session?.open, ...presence } : null, null).word;
		},
		ask: (body: Record<string, unknown>) => answered(() => askAct(event(`/projects/${PROJECT}/ask`, { method: 'POST', body, params: { projectId: PROJECT } }) as never)),
		conversations: async () => (await (await readConversations(event(`/projects/${PROJECT}/ask`, { params: { projectId: PROJECT } }) as never)).json()).conversations,
		batch: (operations: unknown[]) => answered(() => evolutionBatch(event('/api/evolution', { method: 'POST', body: { projectId: PROJECT, operations }, ai: true }) as never))
	};
}

describe('Ask my AI on a Community installation (EVO-008)', () => {
	it('carries a question to the AI in session and its answer back into the conversation, reading Listening then Working [criterion:ac-leaf-f86c4a85-412b-4798-a5fb-fb44458f5009]', async () => {
		const ce = communityInstallation();
		// The AI opens the session of the project: the Community lock on Evolutions leaves it open.
		const opened = await ce.live({ act: 'start' });
		expect(opened.status).toBe(200);
		const sessionId = opened.body.session.id as string;
		expect(await ce.standing()).toBe('Listening');

		// The person asks; the question waits for the AI.
		const asked = await ce.ask({ act: 'start', text: 'What does Plan and tick off my tasks still miss?', context: { title: 'Overview', href: `/projects/${PROJECT}/spec` } });
		expect(asked).toMatchObject({ status: 200, body: { ok: true } });

		// The AI takes it: Ask my AI reads Working while it answers.
		const taken = await ce.live({ act: 'await', sessionId, waitSeconds: 1 });
		expect(taken).toMatchObject({ status: 200, body: { kind: 'click', click: { kind: 'chat' } } });
		expect(JSON.stringify(taken.body.click)).toContain('What does Plan and tick off my tasks still miss?');
		expect(await ce.standing()).toBe('Working');

		// Its answer goes through the Community lock and reads in the person's conversation.
		const clickId = taken.body.click.id as string;
		const answer = await ce.batch([{ op: 'answer_click', clickId, text: 'It misses a due date on each task.' }]);
		expect(answer.status).toBe(200);
		expect(answer.body.ok).toBe(true);
		const [conversation] = await ce.conversations();
		expect(conversation.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
			['person', 'What does Plan and tick off my tasks still miss?'],
			['ai', 'It misses a due date on each task.']
		]);

		// Waiting for the next question, it listens again.
		const waiting = await ce.live({ act: 'await', sessionId, waitSeconds: 1 });
		expect(waiting.body.kind).toBe('nothing');
		expect(await ce.standing()).toBe('Listening');
	});

	it('still refuses on Community every operation that reads or drives a request, with the offer of Solo Builder [criterion:ac-leaf-7de9e4dc-80a7-4b51-9547-2d7137969c40]', async () => {
		const ce = communityInstallation();
		const refusal = { message: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building.', detail: 'See https://lyriks.io/pricing.', plan: 'solo_builder' };
		expect(await ce.batch([{ op: 'open_request', title: 'Plan the week' }])).toEqual({ status: 403, body: refusal });
		expect(await ce.batch([{ op: 'answer_click', clickId: 'c1', text: 'x' }, { op: 'post_on_field', requestId: 'r1', fieldPath: '00-need.situation', body: 'Why?' }])).toEqual({ status: 403, body: refusal });
		expect(await ce.live({ act: 'start', requestId: 'r1' })).toEqual({ status: 403, body: refusal });
	});
});
