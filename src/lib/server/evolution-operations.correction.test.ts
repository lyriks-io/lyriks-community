import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import {
	ACTIONS_UNREAD,
	createDraftLeaf,
	createEvolutionRequest,
	fieldKey,
	fieldValidationOf,
	snapshotOf,
	type Actor,
	type EvolutionRequest,
	type ImplementationFinding
} from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
// The block Not validated in Knowledge reads as empty: this file keeps to the correction of the frozen version.
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { applyEvolutionOperations } from './evolution-operations.server';
import { crossStageAct } from '$domain/evolution';
import { specificationActionEntries } from './evolution-spec-actions.server';
import { requestSummary, specificationEntriesOf, type EvolutionView } from './evolution-view.server';

/**
 * EVO-012: correcting the frozen version in the Build, through the real batch
 * of operations. The engine is a stand-in that computes the draft's feature
 * from the operations of its behaviour model: version 1 makes the actions
 * "Save for later" and "Share the cart"; the correction takes "Share the cart"
 * out and adds "Print a receipt", "Save for later" left as it was.
 */
const NOW = '2026-11-20T00:40:00Z';
const rule = (id: string, description: string) => ({ id, category: 'business', description, condition: { left: 'cart.count', operator: 'greater_than', right: 20 }, effect: { type: 'block_action', reason: description } });
const action = (id: string, name: string, rules: unknown[]) => ({ id, name, intent: name, roles: [], rules, effects: [], scenarios: [] });
const feature = (actions: unknown[]) => ({ id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions }] });
const pay = action('a1', 'Pay', [rule('r1', 'At most 20 items')]);
const save3 = action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices')]);
const share = action('a4', 'Share the cart', [rule('r4', 'Only a signed-in shopper shares')]);
const receipt = action('a5', 'Print a receipt', [rule('r5', 'A receipt names the shop')]);
const repriced = action('a3', 'Save for later', [rule('r3', 'A saved cart takes the prices of the day')]);
const base = feature([pay]);
const V1_OPS = [{ kind: 'add_action', name: 'Save for later' }, { kind: 'add_action', name: 'Share the cart' }];
const V2_OPS = [{ kind: 'add_action', name: 'Save for later' }, { kind: 'add_action', name: 'Print a receipt' }];

const engine = vi.hoisted(() => ({ answers: true }));
const ACTIONS: Record<string, unknown> = { 'Save for later': save3, 'Save for later, repriced': repriced, 'Share the cart': share, 'Print a receipt': receipt };
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
	readBehaviorFeature: { execute: async () => ({ feature: structuredClone(base) }) },
	authorProjectBehavior: { execute: async (input: { dryRun: boolean }) => ({ kind: 'answer', value: { ok: true, dryRun: input.dryRun } }) },
	readProjectBehavior: { execute: async () => ({ projectInvariants: [], coreFeatures: [], stateVariables: {}, library: {} }) },
	simulateBehavior: {
		draftFeatureWalk: async (_project: string, target: { model?: { operations: Record<string, unknown>[] } }) =>
			engine.answers ? { kind: 'walk', walk: { ok: true, feature: structuredClone(draftedOf(target.model?.operations ?? [])) } } : null,
		execute: async () => (engine.answers ? { kind: 'walk', walk: { ok: true, batch: { mintedIds: [] } } } : null)
	}
} as unknown as AppServices;
const ana: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };
const claude: Actor = { id: 'claude@example.test', kind: 'ai_client', role: 'admin', channel: 'ai_client' };
const viewer: Actor = { id: 'vic@example.test', kind: 'person', role: 'viewer', channel: 'page' };

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
	decidedAt: decision === 'undecided' ? null : '2026-11-20T00:00:00Z'
});

/** A request in Build, frozen as version 1, every item of its Specification to be validated in a first batch. */
function atBuild(): EvolutionRequest {
	const draft = createDraftLeaf({
		id: 'draft:r-1',
		kind: 'amend',
		baseLeafId: 'feat-1',
		objective: 'Let a shopper keep a cart for later.',
		problem: 'A cart is lost when the shopper leaves.',
		value: 'Fewer abandoned carts.',
		acceptanceCriteria: [{ id: CRITERION, text: 'A saved cart comes back with its prices' }],
		behaviourModel: { operations: structuredClone(V1_OPS), mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' }
	});
	const fresh = createEvolutionRequest();
	const request = createEvolutionRequest({
		id: 'r',
		title: 'Save a cart for later',
		need: { ...fresh.need, situation: 'A shopper who leaves loses the cart.', objectives: 'A cart kept for later comes back.' },
		origin: 'internal_idea',
		stage: 'implementation',
		frozen: true,
		specVersion: 1,
		leafIds: ['feat-1', 'draft:r-1'],
		drafts: [draft],
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: NOW },
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: NOW },
		baselineKeys: ['action:a1'],
		baselineLeafIds: ['feat-1'],
		heldImplementation: {
			'action:a3': { file: 'src/cart.ts', line: 10, signature: 'export function saveForLater() {' },
			'action:a4': { file: 'src/share.ts', line: 4, signature: 'export function shareCart() {' }
		},
		implementationFindings: [
			line('line-a3', 'action:a3', 'validated'),
			line('line-a4', 'action:a4', 'validated'),
			line('line-c1', `criterion:ac-leaf-${CRITERION}`, 'undecided'),
			line('line-a1', 'action:a1', 'validated', 'inherited')
		]
	});
	return { ...request, frozenVersions: [{ version: 1, at: '2026-11-19T12:00:00Z', by: 'ana@example.test', snapshot: snapshotOf(request) }] };
}

function viewOf(request: EvolutionRequest, members: readonly { id: string; role: string }[] = []): EvolutionView {
	const features = { ...createEmptyFeaturesDraft('p'), features: [{ id: 'feat-1', name: 'Checkout', coreId: '' }] } as EvolutionView['features'];
	return {
		projectId: 'p',
		draft: { projectId: 'p', requests: [request] },
		features,
		data: { entities: [], fields: [] },
		leaves: [{ id: 'feat-1', name: 'Checkout' }],
		sources: [],
		glossaryTerms: [],
		members,
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 1,
		language: 'en'
	} as unknown as EvolutionView;
}
const show = (request: EvolutionRequest, members: readonly { id: string; role: string }[] = []) => (scene.view = viewOf(request, members));
const run = (operations: unknown[], actor: Actor = ana) => applyEvolutionOperations(services, { projectId: 'p', operations, actor, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}
const resultOf = (result: Awaited<ReturnType<typeof run>>, op: string) => result.results.find((r) => r.op === op);

/** Every item the Specification lists, with where it stands. */
async function items(request: EvolutionRequest) {
	const view = viewOf(request);
	const actions = await specificationActionEntries(services, view, request);
	if (actions.status !== 'read') throw new Error('the stand-in engine always answers here');
	return [...specificationEntriesOf(view, request), ...actions.entries].map((e) => ({ fieldPath: e.fieldPath, leafId: e.leafId, label: e.label, standing: e.trail.validation }));
}

/** Version 1 with every item of its Specification validated by Ana, as the freeze left it. */
async function validatedAtBuild(): Promise<EvolutionRequest> {
	const start = atBuild();
	show(start);
	const listed = await items(start);
	const result = await run(listed.map((item) => ({ op: 'validate_field', requestId: 'r', fieldPath: item.fieldPath, ...(item.leafId ? { leafId: item.leafId } : {}) })));
	expect(result.ok).toBe(true);
	const request = saved();
	expect((await items(request)).every((item) => item.standing === 'validated')).toBe(true);
	save.mockClear();
	show(request);
	return request;
}

/** The correction: the model of version 1 reworked, "Share the cart" out and "Print a receipt" in. */
const correct = (actor: Actor = ana) => run([{ op: 'set_draft_behaviour', requestId: 'r', draftId: 'draft:r-1', operations: structuredClone(V2_OPS) }], actor);

describe('a change to what a request in Build proposes opens version N+1 in correction [criterion:ac-leaf-d9a4be34-310c-4d61-b7e4-d3bcd396fdcf]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	it('keeps the request in Build, frozen as version 1, the code still built against it, and says version 2 is in correction', async () => {
		await validatedAtBuild();
		const result = await correct();
		expect(result.ok).toBe(true);
		const request = saved();
		expect(request.stage).toBe('implementation');
		expect(request.frozen).toBe(true);
		expect(request.specVersion).toBe(1);
		expect(request.correction).toMatchObject({ of: 1, openedBy: 'ana@example.test' });
		expect(request.history.at(-1)).toMatchObject({ type: 'spec_amended', summary: expect.stringContaining('Version 2 in correction') });
		expect(resultOf(result, 'set_draft_behaviour')?.summary).toContain('Version 2 in correction: the code is still built against version 1');
	});

	it('opens it once: a second change leaves the same correction open', async () => {
		await validatedAtBuild();
		await correct();
		const first = saved();
		show(first);
		save.mockClear();
		const again = await run([{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:r-1', value: 'Fewer carts left behind.' }]);
		expect(again.ok).toBe(true);
		expect(saved().correction).toEqual(first.correction);
		expect(saved().history.filter((h) => h.type === 'spec_amended')).toHaveLength(1);
	});

	it('opens nothing on a validation or a reading of the report: they change nothing the request proposes', async () => {
		const request = await validatedAtBuild();
		expect(request.correction).toBeUndefined();
	});
});

describe('in Build, a draft, its behaviour, its criteria, a data, page or rule change is accepted and opens the correction [criterion:ac-leaf-f1b07892-9971-4cca-b639-a0653042910f]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	const withPageChange = (r: EvolutionRequest): EvolutionRequest => ({
		...r,
		sectionDrafts: [{ id: 'section:s1', page: 'requirements', summary: 'Saved carts are encrypted', edits: [{ op: 'add_to_set', path: 'definition.security.encryption', value: 'at_rest' }], sourceIds: [], materialisedAt: null }]
	});
	const withRuleChange = (r: EvolutionRequest): EvolutionRequest => ({
		...r,
		ruleDrafts: [{ id: 'rules:r1', summary: 'A saved cart expires', operations: [{ kind: 'add_project_invariant', invariant: { name: 'A saved cart expires', condition: { left: 'cart.count', operator: 'is_true' } } }], sourceIds: [], materialisedAt: null }]
	});
	const as = (r: EvolutionRequest) => r;
	it.each([
		['its behaviour', as, [{ op: 'set_draft_behaviour', requestId: 'r', draftId: 'draft:r-1', operations: V2_OPS }]],
		['its criteria', as, [{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:r-1', acceptanceCriteria: [{ id: CRITERION, text: 'A saved cart comes back with its prices of the day' }] }]],
		['a value typed on the draft', as, [{ op: 'answer_field', requestId: 'r', fieldPath: '02-problem.value', leafId: 'draft:r-1', value: 'Fewer carts left behind.' }]],
		['a draft added', as, [{ op: 'add_draft_leaf', requestId: 'r', kind: 'add', name: 'Print a receipt' }]],
		['a draft taken out', as, [{ op: 'remove_draft_leaf', requestId: 'r', draftId: 'draft:r-1' }]],
		['a data change', as, [{ op: 'add_data_draft', requestId: 'r', kind: 'add', name: 'Saved cart', addFields: [{ name: 'savedAt', type: 'datetime' }] }]],
		['a page change', withPageChange, [{ op: 'remove_section_draft', requestId: 'r', sectionDraftId: 'section:s1' }]],
		['a rule change', as, [{ op: 'add_rule_draft', requestId: 'r', summary: 'A saved cart expires', operations: [{ kind: 'add_project_invariant', invariant: { name: 'A saved cart expires', condition: { left: 'cart.count', operator: 'is_true' } } }] }]],
		['a rule change taken out', withRuleChange, [{ op: 'remove_rule_draft', requestId: 'r', ruleDraftId: 'rules:r1' }]]
	] as const)('%s', async (_what, setup, operations) => {
		show(setup(atBuild()));
		const result = await run([...operations]);
		expect(result.results.filter((r) => !r.ok)).toEqual([]);
		expect(saved().correction?.of).toBe(1);
		expect(saved().stage).toBe('implementation');
	});

	it('an AI client corrects too: the correction opens on its write', async () => {
		show(atBuild());
		const result = await correct(claude);
		expect(result.ok).toBe(true);
		expect(saved().correction?.openedBy).toBe('claude@example.test');
	});
});

describe('from Approval on, a change to what the request proposes is refused, naming a new request [criterion:ac-leaf-02387d5f-fc65-4f86-80c4-6eb2f5ec2b7b]', () => {
	beforeEach(() => save.mockClear());

	it.each(['acceptance', 'delivered'] as const)('in %s', async (stage) => {
		show({ ...atBuild(), stage });
		for (const operations of [
			[{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:r-1', objective: 'x' }],
			[{ op: 'set_draft_behaviour', requestId: 'r', draftId: 'draft:r-1', operations: V2_OPS }],
			[{ op: 'add_data_draft', requestId: 'r', kind: 'add', name: 'Saved cart' }]
		]) {
			const result = await run(operations);
			expect(result.ok).toBe(false);
			expect(result.results[0].summary).toMatch(/^This request stands in (Approval|Deployment): what it proposes is no longer corrected\. Open a new request to change it\.$/);
		}
		expect(save).not.toHaveBeenCalled();
	});
});

describe('only the items the correction changed read waiting; the others keep their validation [criterion:ac-leaf-f23df654-f9a0-4e5c-95c3-4536e5946d5a]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	it('the action added waits, the action left alone and the answers keep their validation, the action taken out is no longer asked', async () => {
		await validatedAtBuild();
		await correct();
		const listed = await items(saved());
		const waiting = listed.filter((item) => item.standing !== 'validated').map((item) => item.label);
		expect(waiting).toEqual(['Checkout › Print a receipt']);
		expect(listed.find((item) => item.label === 'Checkout › Save for later')?.standing).toBe('validated');
		expect(listed.some((item) => item.label === 'Checkout › Share the cart')).toBe(false);
		const answers = listed.filter((item) => item.fieldPath.startsWith('0'));
		expect(answers.map((item) => item.fieldPath)).toEqual(['05-functional.acceptance']);
		expect(answers.every((item) => item.standing === 'validated')).toBe(true);
	});

	it('a criterion reworded waits again, and nothing else does', async () => {
		await validatedAtBuild();
		const result = await run([{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:r-1', acceptanceCriteria: [{ id: CRITERION, text: 'A saved cart comes back with the prices of the day' }] }]);
		expect(result.ok).toBe(true);
		const waiting = (await items(saved())).filter((item) => item.standing !== 'validated');
		expect(waiting.map((item) => item.fieldPath)).toEqual(['05-functional.acceptance']);
	});
});

describe('version N+1 is frozen in the Build once every changed item stands validated and nothing else holds it [criterion:ac-leaf-c3376a9e-6d82-40f3-9461-aaa50646b51a]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	async function corrected(): Promise<EvolutionRequest> {
		await validatedAtBuild();
		await correct();
		const request = saved();
		save.mockClear();
		show(request);
		return request;
	}
	const RECEIPT = fieldKey('element.action:a5', 'feature:feat-1');
	const validateReceipt = (actor: Actor = ana) => run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a5', leafId: 'feature:feat-1' }], actor);

	it('freezes version 2 on the last validation, the request still in Build, and the history says the specification was corrected [unspa:13e955f6:faaf4508:17a0a492]', async () => {
		await corrected();
		const result = await validateReceipt();
		expect(result.ok).toBe(true);
		const request = saved();
		expect(request.stage).toBe('implementation');
		expect(request.frozen).toBe(true);
		expect(request.specVersion).toBe(2);
		expect(request.correction).toBeUndefined();
		expect(request.frozenVersions.map((v) => v.version)).toEqual([1, 2]);
		expect(request.history.at(-1)).toMatchObject({ type: 'spec_frozen', summary: 'Specification corrected as version 2' });
		expect(result.results.some((r) => r.ok && r.summary.startsWith('Specification corrected as version 2'))).toBe(true);
	});

	it('is not frozen while a changed item waits', async () => {
		const request = await corrected();
		// A validation of something else entirely moves nothing toward the freeze.
		const result = await run([{ op: 'update_request', requestId: 'r', title: 'Save a cart for later, and print it' }]);
		expect(result.ok).toBe(true);
		expect(saved().specVersion).toBe(request.specVersion);
		expect(saved().correction?.of).toBe(1);
	});

	it('is not frozen while a blocking finding the correction brings is undecided [unspa:13e955f6:faaf4508:ac87f644]', async () => {
		const request = await corrected();
		show({
			...request,
			coherenceFindings: [{ id: 'coh-1', severity: 'blocking', title: 'Two ways to pay', detail: '', published: true, scope: 'request', decision: 'undecided' } as unknown as EvolutionRequest['coherenceFindings'][number]]
		});
		expect((await validateReceipt()).ok).toBe(true);
		expect(fieldValidationOf(saved(), RECEIPT).status).toBe('validated');
		expect(saved().specVersion).toBe(1);
		expect(saved().correction?.of).toBe(1);
	});

	it('is not frozen while a drafted behaviour no longer applies [unspa:13e955f6:faaf4508:46cf6fe8]', async () => {
		await corrected();
		const execute = services.simulateBehavior.execute;
		(services.simulateBehavior as { execute: unknown }).execute = async () => ({ kind: 'walk', walk: { ok: false, errors: ['action a9 not found'] } });
		try {
			expect((await validateReceipt()).ok).toBe(true);
			expect(fieldValidationOf(saved(), RECEIPT).status).toBe('validated');
		} finally {
			(services.simulateBehavior as { execute: unknown }).execute = execute;
		}
		expect(saved().specVersion).toBe(1);
		expect(saved().correction?.of).toBe(1);
	});

	it('is not frozen on readings older than the correction [unspa:13e955f6:faaf4508:259785b1]', async () => {
		const request = await corrected();
		show({ ...request, coherenceReport: { ...request.coherenceReport, ranAt: '2026-11-20T00:00:00Z' } });
		expect((await validateReceipt()).ok).toBe(true);
		expect(fieldValidationOf(saved(), RECEIPT).status).toBe('validated');
		expect(saved().specVersion).toBe(1);
		expect(saved().correction?.of).toBe(1);
	});

	it('keeps the correction and freezes nothing while the engine does not answer, then freezes once it does [unspa:13e955f6:faaf4508:4f9bf54f]', async () => {
		// The receipt validated while the readings were older than the correction: nothing froze.
		const request = await corrected();
		show({ ...request, coherenceReport: { ...request.coherenceReport, ranAt: '2026-11-20T00:00:00Z' } });
		expect((await validateReceipt()).ok).toBe(true);
		const validated = { ...saved(), coherenceReport: { ...request.coherenceReport, ranAt: NOW } };
		// The readings are in step now, but the engine does not answer: the actions cannot be read, so Freeze version 2 freezes nothing.
		engine.answers = false;
		show(validated);
		save.mockClear();
		const silent = await run([{ op: 'cross_stage', requestId: 'r' }]);
		expect(silent.ok).toBe(false);
		expect(resultOf(silent, 'cross_stage')?.summary).toBe(ACTIONS_UNREAD);
		expect(save).not.toHaveBeenCalled();
		const unread = await specificationActionEntries(services, viewOf(validated), validated);
		expect(unread.status).toBe('unread');
		// Once the engine answers, a person's Freeze version 2 freezes it; the correction was kept meanwhile.
		engine.answers = true;
		show(validated);
		save.mockClear();
		expect((await run([{ op: 'cross_stage', requestId: 'r' }])).ok).toBe(true);
		expect(saved().specVersion).toBe(2);
		expect(saved().stage).toBe('implementation');
		expect(saved().correction).toBeUndefined();
	});

	it('a viewer does not correct a version', async () => {
		show(atBuild());
		const result = await correct(viewer);
		expect(result.ok).toBe(false);
		expect(save).not.toHaveBeenCalled();
	});
});

describe('the report against the corrected version [criterion:ac-leaf-48373b35-1f77-487b-a083-e2536ab1183c]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	it('keeps the state and the decision of the lines on what the correction left alone, reads again the lines on what it changed, and releases what it took out', async () => {
		await validatedAtBuild();
		await correct();
		show(saved());
		save.mockClear();
		await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a5', leafId: 'feature:feat-1' }]);
		const request = saved();
		expect(request.specVersion).toBe(2);
		const byId = new Map(request.implementationFindings.map((l) => [l.id, l]));
		// "Save for later" was left alone: its line keeps its state and its decision.
		expect(byId.get('line-a3')).toMatchObject({ verdict: 'non_conform', decision: 'validated', decidedBy: 'ana@example.test' });
		// "Share the cart" was taken out: its line is read again from the code, and its held entry released.
		expect(byId.get('line-a4')).toMatchObject({ decision: 'undecided', decidedBy: null });
		expect(Object.keys(request.heldImplementation)).toEqual(['action:a3']);
		// What the touched feature already held is its backlog: untouched.
		expect(byId.get('line-a1')?.decision).toBe('validated');
	});
});

describe('the report against the corrected version, an element changed [criterion:ac-leaf-48373b35-1f77-487b-a083-e2536ab1183c]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	it('reads again the line of an action whose rule the correction rewrote, and keeps the one it did not touch', async () => {
		await validatedAtBuild();
		await run([{ op: 'set_draft_behaviour', requestId: 'r', draftId: 'draft:r-1', operations: [{ kind: 'add_action', name: 'Save for later, repriced' }, { kind: 'add_action', name: 'Share the cart' }] }]);
		const open = saved();
		show(open);
		save.mockClear();
		const waiting = (await items(open)).filter((item) => item.standing !== 'validated');
		expect(waiting.map((item) => item.label)).toEqual(['Checkout › Save for later']);
		await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a3', leafId: 'feature:feat-1' }]);
		const request = saved();
		expect(request.specVersion).toBe(2);
		const byId = new Map(request.implementationFindings.map((l) => [l.id, l]));
		expect(byId.get('line-a3')?.decision).toBe('undecided');
		expect(byId.get('line-a4')).toMatchObject({ decision: 'validated', decidedBy: 'ana@example.test' });
		expect(Object.keys(request.heldImplementation).sort()).toEqual(['action:a3', 'action:a4']);
	});
});

describe('while version N+1 is in correction, the Implementation reads the report of version N [criterion:ac-leaf-6103617d-d660-42bb-a73b-7694ec7f39fa]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	it('a report asked for while in correction keeps the lines of version 1 and says version 2 waits for its validation', async () => {
		await validatedAtBuild();
		await correct();
		const request = saved();
		show(request);
		save.mockClear();
		const result = await run([{ op: 'build_implementation_report', requestId: 'r' }]);
		expect(result.ok).toBe(true);
		expect(resultOf(result, 'build_implementation_report')?.summary).toBe(
			'Version 2 is in correction and waits for its validation: the report reads version 1 until version 2 is frozen, then it is built again against it.'
		);
		const kept = save.mock.calls.length > 0 ? saved() : request;
		expect(kept.implementationFindings).toEqual(request.implementationFindings);
		expect(kept.implementationFindings.every((l) => l.specVersion === 1)).toBe(true);
	});

	it('the dossier reads version 2 in correction, the Build step building against version 1, and the next step says it waits for its validation', async () => {
		await validatedAtBuild();
		await correct();
		const request = saved();
		const view = viewOf(request);
		const actions = await specificationActionEntries(services, view, request);
		const summary = requestSummary(view, request, ana, actions.status === 'read' ? { status: 'read', items: actions.entries.map((e) => e.trail) } : actions);
		expect(summary.correction).toEqual({ version: 2, builtAgainst: 1, openedAt: NOW, openedBy: 'ana@example.test' });
		expect(summary.specVersion).toBe(1);
		expect(summary.path.find((step) => step.step === 'build')?.detail).toBe('Building against version 1; version 2 in correction waits for its validation.');
		expect(summary.next.say).toContain('Version 2 is in correction: the code is still built against version 1');
		const total = (await items(request)).length;
		expect(summary.next.personDecides).toContain(
			`Validate what the correction changed (validate_field on each item get_evolution part "specification" lists as waiting): 1 of ${total} left. A person's last validation freezes version 2; an AI's never does.`
		);
		// The way into Approval waits for the correction, and says so.
		expect(summary.gate).toMatchObject({ next: 'acceptance', ok: false, reason: 'Version 2 is in correction and waits for its validation: the request moves into Approval once it is frozen.' });
	});
});

describe('the rebrief stays, only to rewrite the Need, the Solution or the specs [criterion:ac-leaf-ac1e6bb8-1aa7-4e33-b488-d38103c2d03d]', () => {
	beforeEach(() => save.mockClear());
	const REFUSAL = 'The specification is frozen as version 1: the Need, the Solution and the specs are not corrected in the Build. Reopen the spec for revision v2 to rewrite them.';

	it.each([
		['the Need', { op: 'update_need', situation: 'Carts are lost.' }],
		['the Solution', { op: 'update_step_description', step: 'solution', description: 'Keep the cart.' }],
		['the Functional spec', { op: 'answer_step', step: 'functional_spec', question: 'refusals', answer: 'No saved cart without a shopper.' }],
		['the Technical spec', { op: 'update_step_description', step: 'technical_spec', description: 'A table of saved carts.' }],
		['a diagram', { op: 'redraw_diagram', step: 'functional_spec', diagram: 'actor Shopper' }]
	])('%s is refused in the Build, naming the rebrief', async (_what, op) => {
		show(atBuild());
		const result = await run([{ ...op, requestId: 'r' }]);
		expect(result.ok).toBe(false);
		expect(result.results[0].summary).toBe(REFUSAL);
	});

	it('closes a correction open in the Build: nothing of it survives the stage change', async () => {
		show(atBuild());
		await correct();
		show(saved());
		save.mockClear();
		expect((await run([{ op: 'rebrief', requestId: 'r' }])).ok).toBe(true);
		expect(saved().stage).toBe('specification');
		expect(saved().correction).toBeUndefined();
	});

	it('Reopen the spec for revision v2 still sends the request back to Specify, where they are written again', async () => {
		// Its Solution's description written, as every request that reached the Build has it: EVO-013 owes it before the Impact analysis.
		const built = atBuild();
		show({ ...built, stepDescriptions: { ...built.stepDescriptions, solution: 'Keep the cart.' } });
		const result = await run([{ op: 'rebrief', requestId: 'r' }, { op: 'update_step_description', requestId: 'r', step: 'solution', description: 'Keep the cart, and print it.' }]);
		expect(result.ok).toBe(true);
		expect(saved().stage).toBe('specification');
		expect(saved().frozen).toBe(false);
		expect(saved().stepDescriptions.solution).toBe('Keep the cart, and print it.');
	});

	it('a draft is corrected without it: the request never leaves the Build', async () => {
		show(atBuild());
		expect((await correct()).ok).toBe(true);
		expect(saved().stage).toBe('implementation');
		expect(fieldValidationOf(saved(), fieldKey('element.action:a3', 'feature:feat-1')).status).toBeDefined();
	});
});

describe('while version N+1 is in correction, the request does not move into Approval [criterion:ac-leaf-2b084172-6e08-4e1b-9a80-c292fccf2f25]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});
	/** Every line of the report decided but the criterion's, which a person decides last. */
	const settled = (r: EvolutionRequest): EvolutionRequest => ({ ...r, implementationFindings: r.implementationFindings.map((l) => (l.id === 'line-c1' ? l : { ...l, decision: 'validated' as const })) });
	const decideLast = (actor: Actor = ana) => run([{ op: 'decide_line', requestId: 'r', lineId: 'line-c1', decision: 'validated' }], actor);
	async function inCorrectionSettled(): Promise<EvolutionRequest> {
		await validatedAtBuild();
		await correct();
		const request = settled(saved());
		show(request);
		save.mockClear();
		return request;
	}

	it('with no correction open, deciding the last line moves the Build into Approval on its own (EVO-011)', async () => {
		show(settled(atBuild()));
		expect((await decideLast()).ok).toBe(true);
		expect(saved().stage).toBe('acceptance');
	});

	it('with version 2 in correction, the same decision leaves the request in Build, the correction open', async () => {
		await inCorrectionSettled();
		const result = await decideLast();
		expect(result.ok).toBe(true);
		expect(saved().stage).toBe('implementation');
		expect(saved().specVersion).toBe(1);
		expect(saved().correction?.of).toBe(1);
		expect(result.results.some((r) => r.summary.includes('Verification closed'))).toBe(false);
	});

	it('an AI asking for the report moves nothing either', async () => {
		await inCorrectionSettled();
		const result = await run([{ op: 'build_implementation_report', requestId: 'r' }], claude);
		expect(result.ok).toBe(true);
		expect((save.mock.calls.length > 0 ? saved() : null)?.stage ?? 'implementation').toBe('implementation');
	});

	it('Start acceptance testing by hand is the freeze of version 2, which says what holds it [unspa:13e955f6:faaf4508:c745726a]', async () => {
		await inCorrectionSettled();
		const result = await run([{ op: 'cross_stage', requestId: 'r' }]);
		expect(result.ok).toBe(false);
		expect(resultOf(result, 'cross_stage')?.summary).toMatch(/^The Specification is validated first: 1 of \d+ left\.$/);
		expect(save).not.toHaveBeenCalled();
	});

	it('no waiver carries a correction into Approval', async () => {
		const request = await inCorrectionSettled();
		const crossed = crossStageAct({ actor: ana, at: NOW, newId: () => 'w-1' }, request, { criticalEmptyCount: 0, waiverReason: 'We approve it as it stands.' });
		expect(crossed.ok).toBe(false);
		if (!crossed.ok) expect(crossed.reason).toBe('Version 2 is in correction and waits for its validation: the request moves into Approval once it is frozen.');
	});
});

describe('version N+1 is frozen only by a person, never by an AI\'s validation [criterion:ac-leaf-2a796b1a-4ce6-4340-bd23-74c58659c3e0]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});
	const validateReceipt = (actor: Actor) => run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a5', leafId: 'feature:feat-1' }], actor);
	async function corrected(): Promise<EvolutionRequest> {
		await validatedAtBuild();
		await correct();
		const request = saved();
		show(request);
		save.mockClear();
		return request;
	}

	it('an AI validating the last changed item freezes nothing; the foot offers Freeze version 2 to a person, whose act freezes it [unspa:13e955f6:faaf4508:a7eee5ff]', async () => {
		await corrected();
		expect((await validateReceipt(claude)).ok).toBe(true);
		const validated = saved();
		expect(fieldValidationOf(validated, fieldKey('element.action:a5', 'feature:feat-1')).status).toBe('validated');
		expect(validated.specVersion).toBe(1);
		expect(validated.correction?.of).toBe(1);
		const view = viewOf(validated);
		const actions = await specificationActionEntries(services, view, validated);
		const summary = requestSummary(view, validated, ana, actions.status === 'read' ? { status: 'read', items: actions.entries.map((e) => e.trail) } : actions);
		expect(summary.next.personDecides).toContain("Freeze version 2 (cross_stage): a person's act, never an AI's, once what the correction changed stands validated.");
		show(validated);
		save.mockClear();
		expect((await run([{ op: 'cross_stage', requestId: 'r' }])).ok).toBe(true);
		expect(saved().specVersion).toBe(2);
		expect(saved().history.at(-1)).toMatchObject({ type: 'spec_frozen', authorId: 'ana@example.test', authorKind: 'person' });
	});

	it('a person freezes version 2 from the foot once an AI validated the last changed item [unspa:13e955f6:faaf4508:552c4206]', async () => {
		await corrected();
		expect((await validateReceipt(claude)).ok).toBe(true);
		const validated = saved();
		expect(validated.specVersion).toBe(1);
		show(validated);
		save.mockClear();
		const frozen = await run([{ op: 'cross_stage', requestId: 'r' }]);
		expect(frozen.ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'implementation', specVersion: 2 });
		expect(saved().correction).toBeUndefined();
	});

	it('a viewer does not freeze a corrected version [unspa:13e955f6:faaf4508:d48556e3]', async () => {
		const request = await corrected();
		show(request);
		const refused = await run([{ op: 'cross_stage', requestId: 'r' }], viewer);
		expect(refused.ok).toBe(false);
		expect(resultOf(refused, 'cross_stage')?.summary).toBe('You can read this request but not move it.');
		expect(save).not.toHaveBeenCalled();
	});

	it('an AI client of a team does not freeze it by hand either', async () => {
		const request = await corrected();
		const team = [{ id: 'ana@example.test', role: 'admin' }, { id: 'bo@example.test', role: 'admin' }];
		show(request, team);
		expect((await validateReceipt(ana)).ok).toBe(true);
		// Ana's validation froze it; take the state before it to try the AI's hand.
		expect(saved().specVersion).toBe(2);
		show(request, team);
		save.mockClear();
		const refused = await run([{ op: 'cross_stage', requestId: 'r' }], claude);
		expect(refused.ok).toBe(false);
		expect(resultOf(refused, 'cross_stage')?.summary).toBe('An AI client cannot move a request between stages.');
	});

	it('Validate all freezes once, after its last validation', async () => {
		await corrected();
		const result = await run([
			{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a5', leafId: 'feature:feat-1' },
			{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a3', leafId: 'feature:feat-1' }
		]);
		expect(result.ok).toBe(true);
		expect(saved().specVersion).toBe(2);
		expect(saved().history.filter((h) => h.summary === 'Specification corrected as version 2')).toHaveLength(1);
	});
});
