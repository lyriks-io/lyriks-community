import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, SectionDraftRepositoryPort, SectionDraftSaveOptions } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { noticedView } from '$application/spec360/noticed';
import { createEmptyEvolutionDraft, createEvolutionRequest, type ProjectEvolutionDraft } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import type { Gap } from '$domain/coherence';
import type { Finding } from '$domain/retrospec';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { dismissAllToasts, toasts } from '$ui/design-system/toast.svelte';
import type { SpecEdits } from '../edits.svelte';
import fixtures from './turn-points-into-a-change.fixtures.json';

/**
 * The scenarios of "Turn points into a change" (action b3fdea10 of feat-123,
 * as EVO-006 spec version 2 has them), run against the real code: the page's
 * decisions on What Lyriks noticed send their batch to the real Evolution
 * route, which opens the request or refuses it; the point then reads as the
 * page reads it once the request exists. Only the dossier view of a project
 * holding one feature, the health points and the access answer are set by the
 * scenario.
 */

const scene = vi.hoisted(() => ({ page: { data: { onlineHelp: true } as Record<string, unknown> } }));
vi.mock('$app/state', () => ({ page: scene.page }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(async () => {}) }));
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
		// An evolution changes a product its specification describes: TodoMatic holds one feature.
		leaves: [{ id: 'feat-plan', name: 'Plan and tick off my tasks' }],
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

const { FindingDecisions } = await import('./finding-decisions.svelte');
const { POST } = await import('../../../../routes/api/evolution/+server');

type Event = Parameters<typeof POST>[0];

interface Fixture {
	readonly scenarioName: string;
	readonly titleToken: string;
	readonly initialState: {
		readonly installation: { readonly signInRequired: boolean; readonly edition: string };
		readonly session: { readonly workspaceRole: string };
		readonly point: { readonly decision: string; readonly blocking: boolean; readonly listedInHealth: boolean };
	};
	readonly parameters: { readonly pointCount?: number };
	readonly expectedStatus: 'success' | 'blocked';
	readonly expectedAssertions: readonly { readonly operator: string; readonly path: string; readonly value?: unknown }[];
}

const PROJECT = 'todomatic';
const ADA = 'ada@example.test';

const finding = (id: string): Finding => ({
	id: `point:${id}`,
	tone: 'minor',
	text: `Permissions not checked against the rules ${id}`,
	where: 'Permissions',
	kind: { label: 'Permissions not checked', meaning: 'A permission no rule reads' },
	sheet: { kicker: '', title: `Permissions not checked against the rules ${id}`, sections: [] },
	gapIds: [id]
});
const gap = (id: string, blocking: boolean): Gap => ({ id, severity: blocking ? 'high' : 'low', title: `Permissions not checked against the rules ${id}`, detail: '', sourceStep: 'rules', blocking });

/** How the access service answers the caller's role where the project lives. */
function accessFor(role: string): (action: AccessAction) => AccessDecision {
	if (role === 'none') return () => ({ ok: false, reason: 'not_found' });
	if (role === 'viewer') return (action) => (action === 'read' ? { ok: true } : { ok: false, reason: 'forbidden' });
	return () => ({ ok: true });
}

/** The installation and the project the scenario starts from, and the page's fetch answered by the real route. */
function installationFrom(fixture: Fixture, ids: readonly string[]) {
	const { installation, session, point } = fixture.initialState;
	// Sent: another live request already settles the point; the page has not read it yet.
	let stored: ProjectEvolutionDraft | null =
		point.decision === 'sent'
			? { ...createEmptyEvolutionDraft(PROJECT), requests: [createEvolutionRequest({ id: 'r-other', title: 'Settle it', stage: 'specification', findingDrafts: ids.map((findingId) => ({ id: `finding:${findingId}`, findingId, title: findingId, featureRef: null, blocking: false, outcome: null, reason: '', sourceIds: [], materialisedAt: null })) } as never)] }
			: null;
	let revision = stored ? 1 : 0;
	const repo = {
		load: async () => (stored ? structuredClone(stored) : null),
		save: async (draft: ProjectEvolutionDraft, save?: SectionDraftSaveOptions) => {
			if (save?.expectedRevision != null && save.expectedRevision !== revision) return null;
			stored = structuredClone(draft);
			return ++revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	// The project health lists the points, unless they are not listed or were rejected (a kept issue leaves it).
	const listed = point.listedInHealth && point.decision !== 'rejected' ? ids.map((id) => gap(id, point.blocking)) : [];
	const clock = { nowIso: () => '2026-11-20T03:00:00.000Z' };
	const services = servicesWith({
		installEdition: () => installation.edition,
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => accessFor(session.workspaceRole)(action) },
		enterpriseHooks: null,
		projectExists: async (id) => id === PROJECT,
		currentSession: () => ({ isAuthenticated: true, email: ADA }),
		backLinks: { find: async () => null },
		workspaces: { listForCaller: async () => [] },
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		sectionDocuments: { currentRevision: async () => revision },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		implementationCoverage: { invalidate: () => {} },
		captureBaseline: { execute: async () => null },
		scheduleBackSync: async () => {},
		// Only the points matter to opening a request; the rest of a health reading is not read there.
		projectHealthView: { get: async () => ({ points: listed }) } as never,
		readProjectHealth: { execute: async () => ({ points: listed }) } as never
	});
	const fetchThroughRoute = async (url: string, init: RequestInit): Promise<Response> => {
		const event = requestEvent({
			path: url,
			method: 'POST',
			body: init.body as string,
			headers: { 'content-type': 'application/json' },
			authRequired: installation.signInRequired,
			services,
			cookies: { lyriks_session: 'jwt' }
		});
		try {
			return await POST(event as unknown as Event);
		} catch (e) {
			if (!isHttpError(e)) throw e;
			return new Response(JSON.stringify(e.body), { status: e.status, headers: { 'content-type': 'application/json' } });
		}
	};
	return { fetchThroughRoute, stored: () => stored ?? createEmptyEvolutionDraft(PROJECT) };
}

/** The adapter: New change on the point (or on the points picked), through the page and the real route; then the point as the page reads it. */
async function invoke(fixture: Fixture): Promise<{ status: 'success' | 'blocked'; finalState: Record<string, unknown> }> {
	const count = fixture.parameters.pointCount ?? 1;
	const ids = Array.from({ length: count }, (_, i) => `gap-${i + 1}`);
	const findings = ids.map(finding);
	const installation = installationFrom(fixture, ids);
	vi.stubGlobal('fetch', installation.fetchThroughRoute);
	const before = installation.stored().requests.length;
	// The page as it stood when the person pressed New change: every point still to review.
	const shown = noticedView({ open: findings, kept: [], requests: [], projectId: PROJECT }).points;
	const decisions = new FindingDecisions(PROJECT, {} as SpecEdits);
	if (count === 1) await decisions.evolve(shown[0]);
	else {
		decisions.pickAll(shown);
		await decisions.evolveMany(shown);
	}
	const after = installation.stored();
	const opened = after.requests.length > before;
	const [point] = noticedView({ open: findings, kept: [], requests: after.requests, projectId: PROJECT }).points;
	return {
		status: opened ? 'success' : 'blocked',
		finalState: { point: { decision: point.state }, request: { holdsOnlyThisPoint: point.request?.solo ?? false } }
	};
}

const at = (state: Record<string, unknown>, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], state);

beforeEach(() => {
	scene.page.data = { onlineHelp: true };
	dismissAllToasts();
});
afterEach(() => vi.unstubAllGlobals());

describe('Turn points into a change, every scenario against the real code (feat-123, EVO-006 v2)', () => {
	for (const fixture of fixtures as Fixture[]) {
		it(`${fixture.scenarioName} ${fixture.titleToken}`, async () => {
			const { status, finalState } = await invoke(fixture);
			expect(status).toBe(fixture.expectedStatus);
			for (const assertion of fixture.expectedAssertions) {
				if (assertion.operator === 'equals') expect(at(finalState, assertion.path)).toEqual(assertion.value);
				else if (assertion.operator === 'is_true') expect(at(finalState, assertion.path)).toBe(true);
				else if (assertion.operator === 'is_false') expect(at(finalState, assertion.path)).toBe(false);
				else throw new Error(`operator ${assertion.operator} is not read by this adapter`);
			}
		});
	}
});

describe('what the person reads when New change opens or is refused (rules of action b3fdea10)', () => {
	const run = (name: string) => invoke((fixtures as Fixture[]).find((f) => f.scenarioName === name)!);

	it('reads the offer alone on Community, with View plans, nothing in front of it [criterion:ac-leaf-abf964ef-8922-4890-80c6-22921807af7e]', async () => {
		await run('Community shows the Solo Builder offer instead of opening a change');
		expect(toasts().map((t) => [t.message, t.action?.label])).toEqual([['Evolutions are available from the Solo Builder plan. Upgrade to open this evolution and keep building.', 'View plans']]);
	});

	it('follows The evolution was not opened. with the reason the server gave anywhere else', async () => {
		await run('A point already sent is not sent twice');
		const [toast] = toasts();
		expect(toast.level).toBe('error');
		expect(toast.message).toMatch(/^The evolution was not opened\. .*already settles this finding\./);
	});

	it('names the request that now carries the point, or the points', async () => {
		await run('An editor turns a point into a change');
		expect(toasts().map((t) => t.message)).toEqual(['Sent to Evolutions: EVO-001 opened']);
		dismissAllToasts();
		await run('Several picked points go to one new change');
		expect(toasts().map((t) => t.message)).toEqual(['3 points sent to Evolutions: EVO-001 opened']);
	});
});
