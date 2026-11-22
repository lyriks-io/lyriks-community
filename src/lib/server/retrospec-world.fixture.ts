import type { SectionDocumentStorePort, SectionDraftRepositoryPort } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { createEmptyEvolutionDraft, type ProjectEvolutionDraft } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyScopeDraft, type ScopeAuditEntry } from '$domain/scope';
import {
	RETROSPEC_SECTION,
	applyRetrospecActs,
	currentRun,
	emptyRetrospecDocument,
	parseRetrospecDocument,
	type PersonRef,
	type RetrospecAct,
	type RetrospecDocument,
	type RunResume
} from '$domain/retrospec';
import { requestEvent, servicesWith, type FakeServices, type TestEvent } from './request-event.fixture';

/**
 * A project for the scenarios of a Reverse-Specification (EVO-014), seeded
 * from a scenario's state by the spec's dotted paths and served to the real
 * routes: the retrospec document and the section revisions in one in-memory
 * store, the scope ledger (the final checks), the features, and the access
 * decision of the caller's role. Only the IO edges are faked.
 */

export type State = Readonly<Record<string, unknown>>;

export const PROJECT = 'shop';
export const PRODUCT = 'Shop';
export const ADA: PersonRef = { id: 'ada@company.test', name: 'Ada' };
const at = (minute: number) => `2026-11-22T10:${String(minute).padStart(2, '0')}:00.000Z`;

/** The phases a closed run read, stopped in and never reached, as a resumable run keeps them. */
export const RESUMABLE: RunResume = { fromRunId: 'run-1', read: ['sources', 'product', 'features', 'data'], interrupted: [], left: ['experience', 'rules', 'tech', 'check'], fromCommit: '7c0d4b1' };

export interface RetrospecWorld {
	readonly state: State;
	/** The stored document, read back as the server reads it. */
	doc(): RetrospecDocument;
	/** The evolution draft, where the person's session and clicks live. */
	evolution(): ProjectEvolutionDraft;
	readonly services: ReturnType<typeof servicesWith>;
	/** A request event of the caller, posting `body` to `path`. */
	event(path: string, body?: unknown, method?: string): TestEvent;
}

/**
 * The document a state stands for: the last run where `run.stage` says,
 * complementary after a validated run when `run.complementary` says so, closed
 * by a person (`run.closedByHand`) or by its final check, its commit recorded
 * when `validated.commitRecorded` says so, started after a run closed short
 * when `run.resumable` says so.
 */
function documentOf(state: State, audits: string[]): RetrospecDocument {
	let doc = emptyRetrospecDocument();
	let minute = 0;
	const act = (acts: RetrospecAct[]) => {
		const outcome = applyRetrospecActs(doc, acts, { actor: ADA, now: at(++minute) });
		if (!outcome.ok) throw new Error(outcome.reason);
		doc = outcome.doc;
	};
	const stage = String(state['run.stage'] ?? 'none');
	const mode = state['run.mode'] === 'docs' || state['run.mode'] === 'both' ? state['run.mode'] : 'repo';
	if (stage === 'none') return doc;
	// A run before the current one: validated, or closed short when the current run may resume it.
	if (state['run.resumable'] === true) {
		act([{ op: 'start', mode, baseline: {} }, { op: 'launch' }, { op: 'end_analysis' }]);
		act([{ op: 'start', mode, baseline: { features: 1 }, closesRun: true, resumable: RESUMABLE, scope: 'delta' }]);
	} else if (state['run.complementary'] === true || (stage !== 'published' && state['product.gathered'] === true && state['run.stage'] !== 'analysis_over')) {
		act([{ op: 'start', mode, baseline: {} }, { op: 'launch' }]);
		audits.push(at(++minute));
		act([{ op: 'start_review', total: 0 }, { op: 'publish', baselineId: null }]);
		act([{ op: 'start', mode, baseline: { features: 1 } }]);
	} else {
		act([{ op: 'start', mode, baseline: {} }]);
	}
	if (stage === 'ready') return doc;
	act([{ op: 'launch' }]);
	if (state['validated.commitRecorded'] === true && mode !== 'docs') act([{ op: 'record_commit', sha: '7c0d4b1aa', repository: null }]);
	if (stage === 'launched') return doc;
	if (state['run.closedByHand'] === true) act([{ op: 'end_analysis' }]);
	else audits.push(at(++minute));
	if (stage === 'analysis_over') return doc;
	act([{ op: 'start_review', total: 0 }, { op: 'publish', baselineId: null }]);
	return doc;
}

export function retrospecWorld(state: State, extra: FakeServices = {}): RetrospecWorld {
	const audits: string[] = [];
	const seeded = documentOf(state, audits);
	// What the AI already gathered: the features section moved once something was read.
	const gathered = state['product.gathered'] === true || !!currentRun(seeded);
	const documents = new Map<string, { doc: unknown; revision: number }>([[`${PROJECT}/${RETROSPEC_SECTION}`, { doc: seeded, revision: 1 }]]);
	if (gathered) documents.set(`${PROJECT}/features`, { doc: null, revision: 1 });
	const sectionDocuments = {
		load: async (projectId, section) => documents.get(`${projectId}/${section}`)?.doc ?? null,
		save: async (projectId, section, doc, expected) => {
			const now = documents.get(`${projectId}/${section}`)?.revision ?? 0;
			if (expected !== null && expected !== now) return null;
			documents.set(`${projectId}/${section}`, { doc, revision: now + 1 });
			return now + 1;
		},
		currentRevision: async (projectId, section) => documents.get(`${projectId}/${section}`)?.revision ?? 0
	} satisfies SectionDocumentStorePort;
	// The evolution draft on the same store, so a click is saved under the revision the session reads.
	const evolutionKey = `${PROJECT}/evolution`;
	const evolutionRepo = {
		load: async () => (documents.get(evolutionKey)?.doc as ProjectEvolutionDraft | undefined) ?? null,
		save: async (draft: ProjectEvolutionDraft, opts?: { expectedRevision?: number | null }) => sectionDocuments.save(PROJECT, 'evolution', structuredClone(draft), opts?.expectedRevision ?? null),
		currentRevision: async () => documents.get(evolutionKey)?.revision ?? 0
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	const clock = { nowIso: () => at(50) };
	const role = String(state['session.workspaceRole'] ?? 'designer');
	const community = role === 'operator';
	const auditLog = audits.map((performedAt) => ({ performedAt, kind: 'completion' }) as unknown as ScopeAuditEntry);
	const services = servicesWith({
		sectionDocuments,
		draftLock: { current: async () => 0 },
		currentSession: () => ({ isAuthenticated: true, email: ADA.id }),
		identity: { multiUser: !community },
		installEdition: () => (community ? 'community' : 'enterprise'),
		resolveActiveProject: { execute: async () => null },
		enterpriseHooks: null,
		projectExists: async () => true,
		projectAccess: {
			authorize: async (_project, _token, action) =>
				role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
		},
		backLinks: { find: async () => ({ backWorkspaceId: 'ws' }) as never },
		workspaces: { listForCaller: async () => [{ id: 'ws' }] as never },
		resolveActiveMemberName: { execute: async () => ADA.name },
		loadScopeDraft: { execute: async () => ({ ...createEmptyScopeDraft(PROJECT), auditLog }) },
		loadFoundationDraft: { loadIdentity: async () => ({ ...createEmptyIdentityDraft(PROJECT), productName: PRODUCT }) },
		loadFeaturesDraft: { execute: async () => createEmptyFeaturesDraft(PROJECT) },
		loadDocumentRegister: { execute: async () => ({ sources: [] }) as never },
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(evolutionRepo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(evolutionRepo, clock),
		...extra
	});
	const authRequired = state['installation.signInRequired'] !== false;
	return {
		state,
		doc: () => parseRetrospecDocument(documents.get(`${PROJECT}/${RETROSPEC_SECTION}`)?.doc ?? null),
		evolution: () => (documents.get(evolutionKey)?.doc as ProjectEvolutionDraft | undefined) ?? createEmptyEvolutionDraft(PROJECT),
		services,
		event: (path, body, method = 'POST') =>
			requestEvent({
				path,
				method,
				services,
				authRequired,
				params: { projectId: PROJECT },
				headers: { 'content-type': 'application/json', ...(state['session.callerKind'] === 'ai_client' ? { 'x-lyriks-actor': 'ai_client' } : {}) },
				...(body !== undefined ? { body: JSON.stringify(body) } : {})
			})
	};
}

/** Where the last run of a document stands, as the spec's run.stage reads it. */
export function stageOf(doc: RetrospecDocument): string {
	const run = currentRun(doc);
	if (!run) return 'none';
	if (run.publishedAt) return 'published';
	if (run.analysisEndedAt || run.readingDoneAt) return 'analysis_over';
	return run.launchedAt ? 'launched' : 'ready';
}

/** The answer of a route: a status and a body, an HttpError read the same way. */
export async function answerOf(call: () => Response | Promise<Response>): Promise<{ status: number; body: Record<string, unknown> }> {
	try {
		const res = await call();
		return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
	} catch (e) {
		const err = e as { status?: number; body?: { message?: string } };
		if (typeof err.status === 'number') return { status: err.status, body: { message: err.body?.message ?? '' } };
		throw e;
	}
}
