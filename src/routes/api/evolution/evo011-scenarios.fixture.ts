import { isHttpError } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import {
	branchNameFor,
	createDraftLeaf,
	createEmptyEvolutionDraft,
	createEvolutionRequest,
	createObservation,
	isLanded,
	stepTarget,
	type CodeTrack,
	type EvolutionRequest,
	type ImplementationFinding,
	type ProjectEvolutionDraft
} from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { specificationEntriesOf, type EvolutionView } from '$lib/server/evolution-view.server';
import type { POST as Post } from './+server';

/**
 * The scenarios of EVO-011 version 2, run against the real code: a scenario's
 * state, in the model's words, is arranged in the stores the real door reads
 * (the dossier, the roster, the deployment branch, the access answer); the
 * act goes through POST /api/evolution and the real batch; what the scenario
 * asserts is read back from the stored dossier. Only the IO edges are faked:
 * the stores, the dossier loader, the access port and the behaviour engine,
 * which answers or stays silent as the scenario says.
 */

export type State = Readonly<Record<string, unknown>>;

export interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly given: State;
	readonly params?: State;
	readonly expected: 'success' | 'blocked';
	/** On a refused scenario, what the code says holds it: the rule of the scenario, never another one. */
	readonly holds?: string;
	readonly then?: readonly { readonly path: string; readonly operator: 'equals' | 'is_true' | 'is_false'; readonly value?: unknown }[];
}

export const PROJECT = 'shop';
export const REQUEST = 'r-evo';
export const ANA = 'ana@example.test';
export const BO = 'bo@example.test';
export const NOW = '2026-11-20T12:00:00.000Z';
const EARLIER = '2026-11-20T08:00:00.000Z';
const TITLE = 'Save a cart for later';
export const BRANCH = branchNameFor('EVO-001', TITLE);
export const CODE_HEAD = 'c0de0010aaaa';

/** The defaults of the surfaces the scenarios start from, for every path an adapter reads. */
export const DEFAULTS: State = {
	'installation.signInRequired': true,
	'session.workspaceRole': 'designer',
	'session.callerKind': 'person',
	'workspace.singleMember': false,
	'ai.delegated': false,
	'request.stage': 'specification',
	'request.status': 'open',
	'request.frozenVersion': 0,
	'request.bringsCode': true,
	'landing.blockedBy': 'none',
	'report.builtForVersion': 0,
	'report.closed': false,
	'report.linesToDecide': 0,
	'report.sentBack': 0,
	'report.adoptionAwaitsCheck': false,
	'project.deploymentBranchNamed': false,
	'project.deploymentBranch': '',
	'code.branchBound': false,
	'code.onBranch': false,
	'code.uncommitted': false,
	'code.proofsOnOtherCommits': 0,
	'code.validated': false,
	'code.validationSetAside': false,
	'code.merged': false,
	'approval.mine': false,
	'approval.othersAwaited': 0,
	'acceptance.remarksToWriteBack': 0,
	'coherence.ready': false,
	'coherence.blockingOpen': false,
	'specification.held': true,
	'specification.actionsReadable': true
};

/** The personas of the features EVO-011 touches, by id, as their state overrides. */
export const PERSONAS: Readonly<Record<string, State>> = {
	viewer: { 'session.workspaceRole': 'viewer' },
	outside: { 'session.workspaceRole': 'none' },
	ai: { 'session.callerKind': 'ai_client' },
	operator: { 'session.workspaceRole': 'operator', 'workspace.singleMember': true }
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const on = (v: unknown): boolean => v === true;

/** The deployment branch the state names, read from either of the two ways the features say it. */
export const deploymentBranchOf = (s: State): string =>
	on(s['project.deploymentBranchNamed']) || on(s['code.onBranch']) ? 'main' : typeof s['project.deploymentBranch'] === 'string' ? (s['project.deploymentBranch'] as string) : '';

const line = (id: string, version: number, verdict: ImplementationFinding['verdict'], decision: ImplementationFinding['decision'], decidedAt: string | null = EARLIER): ImplementationFinding => ({
	id,
	iteration: 1,
	verdict,
	requirement: `Requirement ${id}`,
	filePath: 'src/cart.ts',
	lineRange: '1-9',
	specStatement: '',
	codeStatement: '',
	leafId: 'feat-1',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: verdict === 'conform',
	specVersion: version,
	scope: 'request',
	decision,
	decidedBy: decision === 'undecided' ? null : ANA,
	decidedAt: decision === 'undecided' ? null : decidedAt
});

/** The code on the request's branch, as the state says it stands. */
function codeOf(s: State): CodeTrack | undefined {
	const bound = on(s['code.branchBound']) || on(s['code.onBranch']);
	if (!bound) return undefined;
	return {
		repository: null,
		branch: BRANCH,
		baseCommit: 'b45e0000aaaa',
		head: 'aaaa0010bbbb',
		codeHead: CODE_HEAD,
		clean: !on(s['code.uncommitted']),
		proofsChecked: 4,
		proofsOnOtherCommits: num(s['code.proofsOnOtherCommits']),
		reportedAt: EARLIER,
		boundAt: EARLIER,
		commits: [{ sha: CODE_HEAD, at: EARLIER, clean: !on(s['code.uncommitted']) }],
		history: null,
		validated: on(s['code.validated']) ? { commit: CODE_HEAD, at: EARLIER, by: ANA } : null,
		validationSetAside: on(s['code.validationSetAside']),
		merged: on(s['code.merged']) ? { into: 'main', commit: 'm3r6e000aaaa', at: EARLIER } : null
	};
}

/** The report of the iteration under way, as the state says it reads. */
function reportOf(s: State): Pick<EvolutionRequest, 'iteration' | 'iterations' | 'implementationFindings'> {
	const version = num(s['report.builtForVersion']);
	if (version === 0) return { iteration: 1, iterations: [], implementationFindings: [] };
	const lines = [
		line('settled', version, 'conform', 'validated'),
		...Array.from({ length: num(s['report.linesToDecide']) }, (_, i) => line(`undecided-${i}`, version, 'non_conform', 'undecided')),
		...Array.from({ length: num(s['report.sentBack']) }, (_, i) => line(`sent-back-${i}`, version, 'non_conform', 'invalidated')),
		// Adopted after the last coherence check, which ran at EARLIER.
		...(on(s['report.adoptionAwaitsCheck']) ? [line('adopted', version, 'out_of_scope', 'adopted', '2026-11-20T09:00:00.000Z')] : [])
	];
	return {
		iteration: 1,
		iterations: [{ number: 1, startedAt: EARLIER, brief: '', protectedLineIds: [], reportStatus: on(s['report.closed']) ? 'closed' : 'ready' }],
		implementationFindings: lines
	};
}

/** The request the state describes, in the dossier's own words. */
export function requestOf(s: State, extra: Partial<EvolutionRequest> = {}): EvolutionRequest {
	const stage = s['request.stage'] as EvolutionRequest['stage'];
	const version = num(s['request.frozenVersion']);
	const base = createEvolutionRequest({ id: REQUEST, title: TITLE, stage, status: s['request.status'] as EvolutionRequest['status'] });
	const built = stage === 'implementation' || stage === 'acceptance' || stage === 'delivered';
	const approvalGiven = on(s['approval.mine']) ? [{ by: ANA, kind: 'person' as const, at: EARLIER }] : [];
	const awaited = num(s['approval.othersAwaited']);
	const others = [BO, ...Array.from({ length: Math.max(0, awaited - 1) }, (_, i) => `other-${i}@example.test`)].slice(0, awaited);
	const code = codeOf(s);
	return {
		...base,
		need: { ...base.need, description: 'Save a cart.', situation: 'Carts are lost on logout.', objectives: 'A cart survives a logout.' },
		specVersion: version,
		frozen: built && version > 0,
		// One that brings no code only settles a finding of Project health (ac-evo-branch-no-code).
		...(on(s['request.bringsCode'])
			? {}
			: { findingDrafts: [{ id: 'finding:gap-1', findingId: 'gap-1', title: 'A gap', featureRef: null, blocking: false, outcome: 'fixed', reason: 'Fixed in the product.', sourceIds: [], materialisedAt: null }] as never }),
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: EARLIER },
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: EARLIER },
		...reportOf(s),
		...(code ? { code } : {}),
		stepValidations: [{ step: 'approval', validatorIds: [], validations: approvalGiven }],
		namedValidators: awaited > 0 ? [{ target: stepTarget('approval'), people: [ANA, ...others], gone: [] }] : [],
		observations: Array.from({ length: num(s['acceptance.remarksToWriteBack']) }, (_, i) =>
			createObservation({ id: `remark-${i}`, status: 'logged', ruling: 'validated', body: 'The button reads oddly.' })
		),
		...(on(s['ai.delegated']) ? { aiDelegations: [{ personId: ANA, at: EARLIER }] } : {}),
		// A drafted behaviour the feature moved away from: the engine no longer replays it (the test makes the engine refuse).
		...(s['landing.blockedBy'] === 'behaviour'
			? { leafIds: ['feat-1'], drafts: [createDraftLeaf({ id: 'draft:r-1', kind: 'amend', baseLeafId: 'feat-1', behaviourModel: { operations: [{ kind: 'add_action' }], mintedIds: [], updatedAt: EARLIER } })] }
			: {}),
		// Rules the whole product keeps that moved: the change retires a rule that is no longer there.
		...(s['landing.blockedBy'] === 'rules'
			? { ruleDrafts: [{ id: 'rules:retire', summary: 'Retire the cart limit', operations: [{ kind: 'remove_project_invariant', invariantId: 'inv-gone' }], sourceIds: [], materialisedAt: null }] }
			: {}),
		// A page that moved away: the change defines a term of the Glossary that is no longer there.
		...(s['landing.blockedBy'] === 'page'
			? { sectionDrafts: [{ id: 'section:basket', page: 'glossary', summary: 'Define the term Basket', edits: [{ op: 'merge', collection: 'terms', id: 'term-basket', value: { definition: 'A saved cart.' } }], sourceIds: [], materialisedAt: null }] }
			: {}),
		...extra
	};
}

/** The feature an amendment of the Impact analysis is drafted on, its behaviour adding one action. */
const rule = (id: string, description: string) => ({ id, category: 'business', description, condition: { left: 'cart.count', operator: 'greater_than', right: 20 }, effect: { type: 'block_action', reason: description } });
const action = (id: string, name: string, rules: unknown[]) => ({ id, name, intent: name, roles: [], rules, effects: [], scenarios: [] });
const feature = (actions: unknown[]) => ({ id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions }] });
export const BASE_FEATURE = feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')])]);
export const DRAFTED_FEATURE = feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')]), action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices')])]);
export const ACTION_KEY = { fieldPath: 'element.action:a3', leafId: 'feature:feat-1' };

/** A request at the Impact analysis, its drafted amendment carrying a behaviour model, as the stages feature's state says. */
export function atImpactOf(s: State): EvolutionRequest {
	const minor = { id: 'coh-minor', severity: 'minor', axis: 'rules', title: 'A wording to check', detail: '', nodeIds: [], published: true, scope: 'request', risk: null };
	const blocking = { ...minor, id: 'coh-blocking', severity: 'blocking', title: 'Two rules contradict' };
	const arbitrates = s['$nothingToArbitrate'] !== true;
	const request = requestOf(s, {
		frozen: false,
		leafIds: ['feat-1'],
		drafts: [
			createDraftLeaf({
				id: 'draft:r-1',
				kind: 'amend',
				baseLeafId: 'feat-1',
				objective: 'Keep a cart for later.',
				problem: 'Carts are lost.',
				value: 'Fewer lost sales.',
				acceptanceCriteria: [{ id: 'c1', text: 'A saved cart comes back with its prices.' }],
				behaviourModel: { operations: [{ kind: 'add_action' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' }
			})
		],
		coherenceReport: on(s['coherence.ready']) ? { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: EARLIER } : { status: 'not_run', projectScore: 0, requestDelta: 0, ranAt: null },
		coherenceFindings: [...(arbitrates ? [minor] : []), ...(on(s['coherence.blockingOpen']) ? [blocking] : [])] as never
	});
	return s['$criticalAnswerEmpty'] === true ? { ...request, need: { ...request.need, objectives: '' } } : request;
}

export interface Engine {
	answers: boolean;
	applies: boolean;
}

/** The stores and the door, for one scenario. `scene.view` is what the mocked dossier loader answers. */
export function world(scene: { view: unknown }, engine: Engine) {
	let dossier: { draft: ProjectEvolutionDraft; revision: number } = { draft: createEmptyEvolutionDraft(PROJECT), revision: 1 };
	let state: State = DEFAULTS;

	const viewOf = (): EvolutionView =>
		({
			projectId: PROJECT,
			draft: dossier.draft,
			features: { ...createEmptyFeaturesDraft(PROJECT), features: [{ id: 'feat-1', name: 'Checkout', coreId: '' }] },
			data: { projectId: PROJECT, entities: [], fields: [] },
			leaves: [{ id: 'feat-1', name: 'Checkout' }],
			sources: [],
			glossaryTerms: [],
			productName: 'Shop',
			members: (on(state['workspace.singleMember']) ? [ANA] : [ANA, BO]).map((id) => ({ id, name: id === ANA ? 'Ana' : 'Bo', role: 'admin' })),
			held: {},
			coverage: {},
			filled: {},
			readings: {},
			revision: dossier.revision,
			language: 'en',
			assistantAvailable: false
		}) as unknown as EvolutionView;

	const role = () => String(state['session.workspaceRole']);
	const services = () =>
		servicesWith({
			installEdition: () => 'enterprise',
			currentSession: () => ({ isAuthenticated: true, email: ANA }),
			identity: { multiUser: true },
			resolveActiveProject: { execute: async () => null },
			enterpriseHooks: null,
			projectExists: async (id: string) => id === PROJECT,
			projectAccess: {
				authorize: async (_project: string, _token: string | null, action: string) =>
					role() === 'none' ? { ok: false, reason: 'not_found' } : role() === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
			},
			backLinks: { find: async () => ({ backWorkspaceId: 'ws' }) },
			// The workspace role as the session reads it: designer reads as member, the writer of the request vocabulary.
			workspaces: { listForCaller: async () => [{ id: 'ws', role: role() === 'none' ? 'viewer' : role() }] },
			resolveActiveMemberName: { execute: async () => 'Ana' },
			clock: { nowIso: () => NOW },
			draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
			sectionDocuments: { currentRevision: async () => dossier.revision },
			loadEvolutionDraft: { execute: async () => dossier.draft },
			saveEvolutionDraft: {
				execute: async (draft: ProjectEvolutionDraft, opts: { expectedRevision: number | null }) => {
					if (opts.expectedRevision !== null && opts.expectedRevision !== dossier.revision) return null;
					dossier = { draft: structuredClone(draft), revision: dossier.revision + 1 };
					scene.view = viewOf();
					return { revision: dossier.revision, savedAt: NOW };
				}
			},
			implementationCoverage: { invalidate: () => {} },
			scheduleBackSync: async () => {},
			captureBaseline: { execute: async () => null },
			// The Glossary as it stands: the term a page change would remove is gone.
			loadGlossaryDraft: { execute: async () => ({ projectId: PROJECT, terms: [] }) },
			codeAdoption: { available: false },
			// The rules the whole product keeps, as the engine reads a change to them: the rule it retires is gone.
			authorProjectBehavior: { execute: async () => ({ kind: 'refused', error: 'Project invariant inv-gone does not exist.' }) },
			// The register of Project health, where a finding a request settles leaves.
			loadRulesDraft: { execute: async () => ({ projectId: PROJECT, issues: [] }) },
			readBehaviorFeature: { execute: async () => ({ feature: structuredClone(BASE_FEATURE) }) },
			simulateBehavior: {
				draftFeatureWalk: async () => (engine.answers ? { kind: 'walk', walk: { ok: true, feature: structuredClone(DRAFTED_FEATURE) } } : null),
				execute: async () => (engine.answers ? { kind: 'walk', walk: engine.applies ? { ok: true } : { ok: false, errors: ['action a9 does not exist'] } } : null)
			}
		} as never) as AppServices;

	return {
		/** Store the world the scenario starts from: the request first (EVO-001), then the other requests of the project. */
		seed(s: State, request: EvolutionRequest, others: readonly EvolutionRequest[] = []): void {
			state = s;
			const branch = deploymentBranchOf(s);
			dossier = { draft: { ...createEmptyEvolutionDraft(PROJECT), requests: [request, ...others], ...(branch ? { deploymentBranch: branch } : {}) }, revision: 1 };
			scene.view = viewOf();
		},
		/** The request as the dossier holds it now. */
		stored: (): EvolutionRequest => dossier.draft.requests[0],
		/** Another request of the project as the dossier holds it now. */
		storedOf: (id: string): EvolutionRequest | undefined => dossier.draft.requests.find((r) => r.id === id),
		/** What validate_field takes for every item of the Specification but the drafted action. */
		answersOf: (request: EvolutionRequest) =>
			specificationEntriesOf(viewOf(), request).map((e) => ({ op: 'validate_field', requestId: REQUEST, fieldPath: e.fieldPath, ...(e.leafId ? { leafId: e.leafId } : {}) })),
		/** One batch through POST /api/evolution, as the person or as their AI by the header the MCP sends. */
		async post(POST: typeof Post, operations: readonly unknown[]): Promise<{ ok: boolean; status: number; results: { op: string; ok: boolean; summary: string }[] }> {
			const event = requestEvent({
				path: '/api/evolution',
				method: 'POST',
				body: JSON.stringify({ projectId: PROJECT, operations }),
				headers: { 'content-type': 'application/json', ...(state['session.callerKind'] === 'ai_client' ? { 'x-lyriks-actor': 'ai_client' } : {}) },
				authRequired: on(state['installation.signInRequired']),
				services: services(),
				cookies: { lyriks_session: 'token' }
			});
			try {
				const response = await POST(event as never);
				const body = (await response.json()) as { ok?: boolean; results?: { op: string; ok: boolean; summary: string }[] };
				return { ok: response.status === 200 && body.ok === true, status: response.status, results: body.results ?? [] };
			} catch (e) {
				if (!isHttpError(e)) throw e;
				return { ok: false, status: e.status, results: [] };
			}
		}
	};
}

/** The paths the scenarios assert, read back from the stored request. */
export function stateOfRequest(r: EvolutionRequest): State {
	const iteration = r.iterations.find((i) => i.number === r.iteration);
	const close = [...(r.aiClicks ?? [])].reverse().find((c) => c.kind === 'close');
	return {
		'request.stage': r.stage,
		'request.status': r.status,
		'request.frozen': r.frozen,
		'request.frozenVersion': r.specVersion,
		'request.landed': isLanded(r),
		'report.closed': iteration?.reportStatus === 'closed',
		'code.branchBound': !!r.code,
		'code.uncommitted': !!r.code && !r.code.clean,
		'code.validated': !!r.code?.validated,
		'code.validationSetAside': !!r.code?.validationSetAside,
		'code.merged': !!r.code?.merged,
		'approval.mine': (r.stepValidations.find((v) => v.step === 'approval')?.validations ?? []).some((v) => v.by === ANA),
		'closeStep.handed': (close as { close?: { step?: string } } | undefined)?.close?.step ?? 'none'
	};
}

/** The scenario's state: the defaults, the persona's, then its own, and its parameters under `$name`. */
export function stateOf(scenario: Scenario, persona?: keyof typeof PERSONAS): State {
	const params = Object.fromEntries(Object.entries(scenario.params ?? {}).map(([k, v]) => [`$${k}`, v]));
	return { ...DEFAULTS, ...(persona ? PERSONAS[persona] : {}), ...scenario.given, ...params };
}

/** Each assertion of the scenario, against the state read back. */
export function assertionsHold(scenario: Scenario, final: State): string[] {
	const wrong: string[] = [];
	for (const a of scenario.then ?? []) {
		const v = final[a.path];
		const holds = a.operator === 'equals' ? v === a.value : a.operator === 'is_true' ? v === true : v === false;
		if (!holds) wrong.push(`${a.path} ${a.operator} ${String(a.value ?? '')}: read ${String(v)}`);
	}
	return wrong;
}

/** The report with one more line of the request to decide: the act that decides it is the one that settles the report. */
export function withLineToDecide(request: EvolutionRequest, id = 'trigger'): EvolutionRequest {
	const version = request.specVersion;
	return { ...request, implementationFindings: [...request.implementationFindings, line(id, version, 'missing', 'undecided')] };
}
