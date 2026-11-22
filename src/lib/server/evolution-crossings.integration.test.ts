import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import {
	createDraftLeaf,
	createEvolutionRequest,
	crossStageAct,
	snapshotOf,
	type Actor,
	type CodeTrack,
	type EvolutionRequest,
	type ImplementationFinding
} from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
// The automatic readings are left out: each case runs the act it is about by hand, so the act that moves the request is the one named.
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { applyEvolutionOperations } from './evolution-operations.server';
import { specificationActionEntries } from './evolution-spec-actions.server';
import { requestSummary, specificationEntriesOf, type EvolutionView } from './evolution-view.server';

/**
 * EVO-011 and EVO-012 together, through the real batch of operations: the
 * crossings the product takes on its own (EVO-011) and the correction of the
 * frozen version in the Build (EVO-012) must not cross each other. While
 * version N+1 is in correction nothing moves the request into Approval; N+1
 * freezes on a person's validation, never an AI's, as version N does at the
 * Impact analysis; once N+1 is frozen and its report settled, the Build moves
 * on as before. Only the edges are stand-ins: the stores, the dossier loader,
 * and an engine that computes a draft's feature from its model's operations.
 * The project deploys from `main` and the request's branch is committed and
 * tested, so the branch never holds a crossing here: only the correction does.
 */
const NOW = '2026-11-20T12:00:00Z';
const rule = (id: string, description: string) => ({ id, category: 'business', description, condition: { left: 'cart.count', operator: 'greater_than', right: 20 }, effect: { type: 'block_action', reason: description } });
const action = (id: string, name: string, rules: unknown[]) => ({ id, name, intent: name, roles: [], rules, effects: [], scenarios: [] });
const feature = (actions: unknown[]) => ({ id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions }] });
const pay = action('a1', 'Pay', [rule('r1', 'At most 20 items')]);
const ACTIONS: Record<string, unknown> = {
	'Save for later': action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices')]),
	'Share the cart': action('a4', 'Share the cart', [rule('r4', 'Only a signed-in shopper shares')]),
	'Print a receipt': action('a5', 'Print a receipt', [rule('r5', 'A receipt names the shop')])
};
/** Version 1 makes "Save for later" and "Share the cart"; the correction takes "Share the cart" out and adds "Print a receipt". */
const V1_OPS = [{ kind: 'add_action', name: 'Save for later' }, { kind: 'add_action', name: 'Share the cart' }];
const V2_OPS = [{ kind: 'add_action', name: 'Save for later' }, { kind: 'add_action', name: 'Print a receipt' }];
const draftedOf = (ops: readonly Record<string, unknown>[]) => feature([pay, ...ops.map((op) => ACTIONS[String(op.name)])]);

const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: NOW }));
const services = {
	clock: { nowIso: () => NOW },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	saveFeaturesDraft: { execute: async () => ({ revision: 2 }) },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {},
	codeAdoption: { available: false },
	readBehaviorFeature: { execute: async () => ({ feature: feature([pay]) }) },
	authorProjectBehavior: { execute: async (input: { dryRun: boolean }) => ({ kind: 'answer', value: { ok: true, dryRun: input.dryRun } }) },
	readProjectBehavior: { execute: async () => ({ projectInvariants: [], coreFeatures: [], stateVariables: {}, library: {} }) },
	simulateBehavior: {
		draftFeatureWalk: async (_project: string, target: { model?: { operations: Record<string, unknown>[] } }) => ({
			kind: 'walk',
			walk: { ok: true, feature: draftedOf(target.model?.operations ?? []) }
		}),
		execute: async () => ({ kind: 'walk', walk: { ok: true, batch: { mintedIds: [] } } })
	},
	// What run_coherence reads: a project with nothing to report.
	behaviorAdvisories: { prime: () => Promise.resolve() },
	loadCoherenceDraft: { execute: async () => ({ analysis: { readinessScore: 82, gaps: [] } }) },
	loadRulesDraft: { execute: async () => ({ issues: [] }) }
} as unknown as AppServices;
const ana: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };
const claude: Actor = { id: 'claude@example.test', kind: 'ai_client', role: 'admin', channel: 'ai_client' };

/** The request's branch, committed and tested on its last commit of code. */
const CLEAN_BRANCH: CodeTrack = {
	repository: null,
	branch: 'evo/EVO-001-save-cart-later',
	baseCommit: 'b45e000',
	head: 'aaaaaaa1',
	codeHead: 'c0de001',
	clean: true,
	proofsChecked: 4,
	proofsOnOtherCommits: 0,
	reportedAt: '2026-11-20T11:00:00Z',
	commits: [{ sha: 'c0de001', at: '2026-11-20T11:00:00Z', clean: true }],
	history: null,
	validated: null,
	validationSetAside: false,
	merged: null
};

const CRITERION = 'c-1';
const line = (id: string, key: string, decision: ImplementationFinding['decision'], scope: 'request' | 'inherited' = 'request'): ImplementationFinding => ({
	id,
	iteration: 1,
	verdict: 'non_conform',
	requirement: key,
	filePath: 'src/cart.ts',
	lineRange: '10',
	specStatement: '',
	codeStatement: '',
	leafId: 'feat-1',
	key,
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	scope,
	decision,
	decidedBy: decision === 'undecided' ? null : 'ana@example.test',
	decidedAt: decision === 'undecided' ? null : '2026-11-20T11:00:00Z'
});

/** The request carrying version 1, at the Impact analysis (unfrozen) or in the Build (frozen as version 1, its report and branch as given). */
function requestAt(stage: 'coherence' | 'implementation'): EvolutionRequest {
	const fresh = createEvolutionRequest();
	const building = stage === 'implementation';
	const request = createEvolutionRequest({
		id: 'r',
		title: 'Save a cart for later',
		need: { ...fresh.need, situation: 'A shopper who leaves loses the cart.', objectives: 'A cart kept for later comes back.' },
		stepDescriptions: { ...fresh.stepDescriptions, solution: 'Keep the cart for later.' },
		origin: 'internal_idea',
		stage,
		frozen: building,
		specVersion: building ? 1 : 0,
		leafIds: ['feat-1', 'draft:r-1'],
		drafts: [
			createDraftLeaf({
				id: 'draft:r-1',
				kind: 'amend',
				baseLeafId: 'feat-1',
				objective: 'Let a shopper keep a cart for later.',
				problem: 'A cart is lost when the shopper leaves.',
				value: 'Fewer abandoned carts.',
				acceptanceCriteria: [{ id: CRITERION, text: 'A saved cart comes back with its prices' }],
				behaviourModel: { operations: structuredClone(V1_OPS), mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' }
			})
		],
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: NOW },
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: NOW },
		baselineKeys: ['action:a1'],
		baselineLeafIds: ['feat-1'],
		...(building
			? {
					code: CLEAN_BRANCH,
					implementationFindings: [
						line('line-a3', 'action:a3', 'validated'),
						line('line-a4', 'action:a4', 'validated'),
						line('line-c1', `criterion:ac-leaf-${CRITERION}`, 'undecided'),
						line('line-a1', 'action:a1', 'validated', 'inherited')
					]
				}
			: {})
	});
	return building ? { ...request, frozenVersions: [{ version: 1, at: '2026-11-19T12:00:00Z', by: 'ana@example.test', snapshot: snapshotOf(request) }] } : request;
}

function viewOf(request: EvolutionRequest): EvolutionView {
	const features = { ...createEmptyFeaturesDraft('p'), features: [{ id: 'feat-1', name: 'Checkout', coreId: '' }] } as EvolutionView['features'];
	return {
		projectId: 'p',
		draft: { projectId: 'p', requests: [request], deploymentBranch: 'main' },
		features,
		data: { entities: [], fields: [] },
		leaves: [{ id: 'feat-1', name: 'Checkout' }],
		sources: [],
		glossaryTerms: [],
		members: [],
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 1,
		language: 'en'
	} as unknown as EvolutionView;
}
const show = (request: EvolutionRequest) => {
	scene.view = viewOf(request);
	save.mockClear();
};
const run = (operations: unknown[], actor: Actor = ana) => applyEvolutionOperations(services, { projectId: 'p', operations, actor, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}
const summaries = (result: Awaited<ReturnType<typeof run>>) => result.results.map((r) => r.summary);
const MOVED = 'Automatic: Verification closed: the evolution moves to acceptance testing';
const HELD = 'Version 2 is in correction and waits for its validation: the request moves into Approval once it is frozen.';

/** Every item the Specification lists, as validate_field takes it. */
async function validations(request: EvolutionRequest) {
	const view = viewOf(request);
	const actions = await specificationActionEntries(services, view, request);
	if (actions.status !== 'read') throw new Error('the stand-in engine always answers');
	return [...specificationEntriesOf(view, request), ...actions.entries].map((e) => ({ op: 'validate_field', requestId: 'r', fieldPath: e.fieldPath, ...(e.leafId ? { leafId: e.leafId } : {}) }));
}
/** The dossier as the page reads it, its gate included. */
async function dossier(request: EvolutionRequest) {
	const view = viewOf(request);
	const actions = await specificationActionEntries(services, view, request);
	return requestSummary(view, request, ana, actions.status === 'read' ? { status: 'read', items: actions.entries.map((e) => e.trail) } : actions);
}

/** Version 1 in the Build, every item of its Specification validated by Ana. */
async function validatedAtBuild(): Promise<EvolutionRequest> {
	const start = requestAt('implementation');
	show(start);
	expect((await run(await validations(start))).ok).toBe(true);
	const request = saved();
	show(request);
	return request;
}
/** The correction: "Share the cart" out, "Print a receipt" in; version 2 opens in correction. */
async function corrected(): Promise<EvolutionRequest> {
	await validatedAtBuild();
	expect((await run([{ op: 'set_draft_behaviour', requestId: 'r', draftId: 'draft:r-1', operations: structuredClone(V2_OPS) }])).ok).toBe(true);
	const request = saved();
	expect(request.correction?.of).toBe(1);
	show(request);
	return request;
}
const validateReceipt = (actor: Actor) => run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a5', leafId: 'feature:feat-1' }], actor);
const decideLast = (actor: Actor = ana) => run([{ op: 'decide_line', requestId: 'r', lineId: 'line-c1', decision: 'validated' }], actor);

/** Version 2 in correction, version 1's report settled (its last line decided by a person) and the branch clean. */
async function correctionOnSettledReport(): Promise<EvolutionRequest> {
	await corrected();
	expect((await decideLast()).ok).toBe(true);
	const request = saved();
	expect(request.implementationFindings.every((l) => l.decision !== 'undecided')).toBe(true);
	show(request);
	return request;
}

beforeEach(() => save.mockClear());

describe('with version N+1 in correction, version N settled and its branch clean, nothing moves the request into Approval', () => {
	it('without a correction, the same decision on the same report and branch moves the Build into Approval on its own (the control)', async () => {
		await validatedAtBuild();
		const result = await decideLast();
		expect(result.ok).toBe(true);
		expect(saved().stage).toBe('acceptance');
		expect(summaries(result)).toContain(MOVED);
	});

	it("(a) a person's decide_line on the last line leaves the request in the Build, version 2 in correction", async () => {
		await corrected();
		const result = await decideLast();
		expect(result.ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'implementation', specVersion: 1, correction: { of: 1 } });
		expect(summaries(result)).not.toContain(MOVED);
	});

	it("(b) an AI's build_implementation_report keeps the report of version 1 and moves nothing", async () => {
		const request = await correctionOnSettledReport();
		const result = await run([{ op: 'build_implementation_report', requestId: 'r' }], claude);
		expect(result.ok).toBe(true);
		expect(summaries(result)).toEqual([
			'Version 2 is in correction and waits for its validation: the report reads version 1 until version 2 is frozen, then it is built again against it.'
		]);
		const after = save.mock.calls.length > 0 ? saved() : request;
		expect(after).toMatchObject({ stage: 'implementation', specVersion: 1, correction: { of: 1 } });
	});

	it('(c) a run_coherence reads the request again and moves nothing', async () => {
		await correctionOnSettledReport();
		const result = await run([{ op: 'run_coherence', requestId: 'r' }], claude);
		expect(result.ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'implementation', specVersion: 1, correction: { of: 1 } });
		expect(saved().coherenceReport.status).toBe('ready');
		expect(summaries(result)).not.toContain(MOVED);
	});

	it('(d) the gate into acceptance says the correction holds it; cross_stage, with a waiver or not, is the freeze of version 2 and never reaches Approval', async () => {
		const request = await correctionOnSettledReport();
		// What Start acceptance testing reads on the page: the gate, refused with the correction's reason.
		expect((await dossier(request)).gate).toMatchObject({ next: 'acceptance', ok: false, reason: HELD });
		// The act cross_stage takes into acceptance refuses on that reason, a waiver given or not.
		for (const waiverReason of [undefined, 'We approve it as it stands.']) {
			const crossed = crossStageAct({ actor: ana, at: NOW, newId: () => 'w-1' }, request, { criticalEmptyCount: 0, ...(waiverReason ? { waiverReason } : {}) });
			expect(crossed.ok).toBe(false);
			if (!crossed.ok) expect(crossed.reason).toBe(HELD);
		}
		// Through the batch, cross_stage on a version in correction is its freeze (EVO-012): the changed item still waits, so it is refused, waiver or not.
		for (const op of [{ op: 'cross_stage', requestId: 'r' }, { op: 'cross_stage', requestId: 'r', waiverReason: 'We approve it as it stands.' }]) {
			show(request);
			const result = await run([op]);
			expect(result.ok).toBe(false);
			expect(summaries(result)[0]).toMatch(/^The Specification is validated first: 1 of \d+ left\.$/);
			expect(save).not.toHaveBeenCalled();
		}
	});
});

describe('during the correction, version N+1 freezes on a person\'s validation, never an AI\'s', () => {
	it("an ai_client's validation of the last changed item freezes nothing", async () => {
		await corrected();
		const result = await validateReceipt(claude);
		expect(result.ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'implementation', specVersion: 1, correction: { of: 1 } });
		expect(saved().frozenVersions.map((v) => v.version)).toEqual([1]);
		expect(summaries(result).some((s) => s.startsWith('Specification corrected'))).toBe(false);
	});

	it("a person's validation of the last changed item freezes version 2 in the Build, the history naming that person", async () => {
		await corrected();
		const result = await validateReceipt(ana);
		expect(result.ok).toBe(true);
		const frozen = saved();
		expect(frozen).toMatchObject({ stage: 'implementation', frozen: true, specVersion: 2 });
		expect(frozen.correction).toBeUndefined();
		expect(frozen.frozenVersions.map((v) => v.version)).toEqual([1, 2]);
		expect(frozen.history.find((h) => h.summary === 'Specification corrected as version 2')).toMatchObject({
			type: 'spec_frozen',
			authorId: 'ana@example.test',
			authorKind: 'person'
		});
	});
});

describe('once version N+1 is frozen and its report settled with the branch clean, the Build moves into Approval on its own', () => {
	it('the decision that settles the last line moves it, fixing no commit, and no correction remains on the request', async () => {
		await correctionOnSettledReport();
		expect((await validateReceipt(ana)).ok).toBe(true);
		const frozen = saved();
		expect(frozen).toMatchObject({ stage: 'implementation', specVersion: 2 });
		// The freeze read again the lines on what the correction moved; the report of version 2 holds them, the rest kept.
		const reread = frozen.implementationFindings.filter((l) => l.decision === 'undecided').map((l) => l.id);
		expect(reread.length).toBeGreaterThan(0);
		const rebuilt = { ...frozen, implementationFindings: frozen.implementationFindings.map((l) => ({ ...l, specVersion: 2 })) };
		show(rebuilt);
		const result = await run(reread.map((lineId) => ({ op: 'decide_line', requestId: 'r', lineId, decision: 'validated' })));
		expect(result.ok).toBe(true);
		const moved = saved();
		expect(moved.stage).toBe('acceptance');
		expect(moved.specVersion).toBe(2);
		expect(moved.correction).toBeUndefined();
		expect('correction' in moved).toBe(false);
		expect(moved.code?.validated).toBeNull();
		expect(summaries(result)).toContain(MOVED);
	});
});

describe('at the Impact analysis, version N freezes on a person\'s last validation and never on an AI\'s', () => {
	it("an AI validating every item of the Specification freezes nothing", async () => {
		const request = requestAt('coherence');
		show(request);
		const result = await run(await validations(request), claude);
		expect(result.ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'coherence', frozen: false, specVersion: 0 });
		expect(saved().history.some((h) => h.type === 'spec_frozen')).toBe(false);
	});

	it("a person validating every item of the Specification freezes version 1 in that act, the history naming that person", async () => {
		const request = requestAt('coherence');
		show(request);
		const result = await run(await validations(request), ana);
		expect(result.ok).toBe(true);
		const frozen = saved();
		expect(frozen).toMatchObject({ stage: 'implementation', frozen: true, specVersion: 1 });
		expect(frozen.history.find((h) => h.type === 'spec_frozen')).toMatchObject({ authorId: 'ana@example.test', authorKind: 'person', summary: 'Specification frozen as version 1' });
	});
});
