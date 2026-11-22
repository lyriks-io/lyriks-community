import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, SectionDraftRepositoryPort, SectionDraftSaveOptions } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { createEmptyEvolutionDraft, type ProjectEvolutionDraft } from '$domain/evolution';
import { GET, POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * The live door of a project (/api/evolution/live) over the real session code
 * and an in-memory Evolution store, for the scenario suites of the sessions
 * with the person's AIs (feat-7, feat-6, feat-11; EVO-015): who calls (a
 * person or their AI, and which person), what the store holds before, and the
 * server's clock, all set by the test.
 */

export const ADA = 'ada@example.test';
export const BOB = 'bob@example.test';

export interface LiveDoorOptions {
	readonly decide?: (action: AccessAction) => AccessDecision;
	readonly exists?: boolean;
	/** What the Evolution section holds before the first call. */
	readonly seed?: ProjectEvolutionDraft;
	readonly now?: string;
}

export function liveDoor(projectId: string, opts: LiveDoorOptions = {}) {
	let stored: ProjectEvolutionDraft | null = opts.seed ? structuredClone(opts.seed) : null;
	let revision = 0;
	let now = opts.now ?? '2026-11-22T15:00:00.000Z';
	let who = ADA;
	const repo = {
		load: async () => (stored ? structuredClone(stored) : null),
		save: async (draft: ProjectEvolutionDraft, save?: SectionDraftSaveOptions) => {
			if (save?.expectedRevision != null && save.expectedRevision !== revision) return null;
			stored = structuredClone(draft);
			return ++revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	const clock = { nowIso: () => now };
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => (opts.decide ?? (() => ({ ok: true })))(action) },
		enterpriseHooks: null,
		projectExists: async (id) => (opts.exists ?? true) && id === projectId,
		currentSession: () => ({ isAuthenticated: true, email: who }),
		backLinks: { find: async () => null },
		workspaces: { listForCaller: async () => [] },
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		// The waiting look reads the Reverse-Specification's standing: this project holds none.
		sectionDocuments: { currentRevision: async () => revision, load: async () => null },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} }
	});
	/** One call through the door, as the person or as their AI (marked x-lyriks-actor), answered as status and JSON body. */
	const call = async (body: Record<string, unknown>, as: 'person' | 'ai' = 'person', person: string = who) => {
		who = person;
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
	/** What a page of the person reads (GET), the project's sessions or one request's. */
	const read = async (person: string = who, requestId?: string) => {
		who = person;
		const query = `projectId=${projectId}${requestId ? `&requestId=${requestId}` : ''}`;
		const event = requestEvent({ path: `/api/evolution/live?${query}`, authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
		return Promise.resolve(GET(event)).then(
			async (r) => ({ status: r.status, body: await r.json() }),
			(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
		);
	};
	return {
		services,
		call,
		read,
		stored: () => stored ?? createEmptyEvolutionDraft(projectId),
		seed: (draft: ProjectEvolutionDraft) => void (stored = structuredClone(draft)),
		revision: () => revision,
		setNow: (iso: string) => void (now = iso)
	};
}
