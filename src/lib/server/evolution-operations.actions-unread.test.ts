import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { ACTIONS_UNREAD, createDraftLeaf, createEvolutionRequest, fieldValidationOf, REPORT_NOT_REBUILT, REPORT_NOT_REBUILT_LOG, type Actor, type EvolutionRequest, type ImplementationFinding } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
// The freeze also reads the block Not validated in Knowledge (EVO-003, #74): read here as empty, so this file keeps to the actions of the Specification.
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { applyEvolutionOperations } from './evolution-operations.server';

/**
 * Criterion c623df9c, rules 519642d3 and 9d290950: while the engine does not
 * answer the replay of a request's drafts, an action is never validated against
 * a fallback and the version is never frozen on a count taken without them.
 * The engine port answers nothing here, as it does on a timeout or a recycled
 * subprocess; a path of the journey, read from its drawing, is untouched.
 */
const rule = (id: string, description: string) => ({ id, category: 'business', description, condition: { left: 'cart.count', operator: 'greater_than', right: 20 }, effect: { type: 'block_action', reason: description } });
const action = (id: string, name: string, rules: unknown[]) => ({ id, name, intent: name, roles: [], rules, effects: [], scenarios: [] });
const feature = (actions: unknown[]) => ({ id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions }] });
const base = feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')])]);
const drafted = feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')]), action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices')])]);
const ADDED = 'element.action:a3@feature:feat-1';

const engine = vi.hoisted(() => ({ answers: true }));
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: '2026-11-20T00:40:00Z' }));
const services = {
	clock: { nowIso: () => '2026-11-20T00:40:00Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {},
	codeAdoption: { available: false },
	readBehaviorFeature: { execute: async () => ({ feature: structuredClone(base) }) },
	simulateBehavior: {
		draftFeatureWalk: async () => (engine.answers ? { kind: 'walk', walk: { ok: true, feature: structuredClone(drafted) } } : null),
		execute: async () => (engine.answers ? { kind: 'walk', walk: { ok: true } } : null)
	}
} as unknown as AppServices;
const ana: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };

function request(): EvolutionRequest {
	return createEvolutionRequest({
		id: 'r',
		title: 'Save a cart for later',
		stage: 'coherence',
		leafIds: ['feat-1'],
		drafts: [createDraftLeaf({ id: 'draft:r-1', kind: 'amend', baseLeafId: 'feat-1', behaviourModel: { operations: [{ kind: 'add_action' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' } })]
	});
}
function view(req: EvolutionRequest) {
	const features = { ...createEmptyFeaturesDraft('p'), features: [{ id: 'feat-1', name: 'Checkout', coreId: '' }] };
	scene.view = { projectId: 'p', draft: { projectId: 'p', requests: [req] }, features, data: { entities: [], fields: [] }, leaves: [], sources: [], glossaryTerms: [], members: [], held: {}, coverage: {}, filled: {}, readings: {}, revision: 1, language: 'en' };
}
const run = (operations: unknown[]) => applyEvolutionOperations(services, { projectId: 'p', operations, actor: ana, origin: null });
const refusalOf = (result: Awaited<ReturnType<typeof run>>, op: string) => result.results.find((r) => r.op === op);

describe('the engine not answering is never silent [criterion:c623df9c]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
		view(request());
	});

	it('validates an added action while the engine answers', async () => {
		const result = await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a3', leafId: 'feature:feat-1' }]);
		expect(result.ok).toBe(true);
		const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
		expect(fieldValidationOf(draft.requests[0], ADDED).status).toBe('validated');
	});

	it('refuses to validate an action, sent with the fingerprint the page read, while the engine does not answer, and records nothing', async () => {
		engine.answers = false;
		const result = await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a3', leafId: 'feature:feat-1', value: 'what the page read' }]);
		expect(result.ok).toBe(false);
		expect(refusalOf(result, 'validate_field')?.summary).toBe(ACTIONS_UNREAD);
		expect(refusalOf(result, 'validate_field')?.detail).toContain('Nothing was recorded');
		expect(save).not.toHaveBeenCalled();
	});

	it('refuses an AI validating an action by its key alone while the engine does not answer, rather than reading it as absent', async () => {
		engine.answers = false;
		const result = await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.action:a3', leafId: 'feature:feat-1' }]);
		expect(refusalOf(result, 'validate_field')?.summary).toBe(ACTIONS_UNREAD);
		expect(save).not.toHaveBeenCalled();
	});

	it('refuses the freeze while the engine does not answer, a waiver included, instead of counting the Specification without its actions', async () => {
		engine.answers = false;
		const crossed = await run([{ op: 'cross_stage', requestId: 'r' }]);
		expect(refusalOf(crossed, 'cross_stage')?.summary).toBe(ACTIONS_UNREAD);
		const waived = await run([{ op: 'cross_stage', requestId: 'r', waiverReason: 'The team agreed to build it now.' }]);
		expect(refusalOf(waived, 'cross_stage')?.summary).toBe(ACTIONS_UNREAD);
		expect(save).not.toHaveBeenCalled();
	});
});

describe('a report is never rebuilt on drafts the engine did not answer [criterion:837e56b6]', () => {
	const line: ImplementationFinding = {
		id: 'line-1',
		iteration: 1,
		verdict: 'conform',
		requirement: 'Save for later',
		filePath: 'src/cart.ts',
		lineRange: '10-20',
		specStatement: '',
		codeStatement: '',
		leafId: 'feat-1',
		hasRequirementAnchor: true,
		anchorForeignLeaf: false,
		acceptanceTestPassing: true,
		specVersion: 1,
		scope: 'request',
		decision: 'validated',
		decidedBy: 'ana@example.test',
		decidedAt: '2026-11-19T22:00:00Z'
	};
	const atBuild = (): EvolutionRequest => ({ ...request(), stage: 'implementation', frozen: true, specVersion: 1, implementationFindings: [line] });
	const savedRequest = () => (save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] }).requests[0];

	beforeEach(() => {
		save.mockClear();
		engine.answers = true;
	});

	it('keeps the last report, lines, decisions and counts untouched, and the log of the Build card says why, once', async () => {
		engine.answers = false;
		view(atBuild());
		const result = await run([{ op: 'build_implementation_report', requestId: 'r' }]);
		expect(result.ok).toBe(true);
		expect(result.results.find((r) => r.op === 'build_implementation_report')?.summary).toBe(REPORT_NOT_REBUILT);
		const kept = savedRequest();
		expect(kept.implementationFindings).toEqual([line]);
		expect(kept.history.at(-1)?.summary).toBe(REPORT_NOT_REBUILT_LOG);
		// A second sync while the engine is still silent does not say it twice.
		view(kept);
		save.mockClear();
		await run([{ op: 'build_implementation_report', requestId: 'r' }]);
		const again = save.mock.calls.length > 0 ? savedRequest() : kept;
		expect(again.history.filter((h) => h.summary === REPORT_NOT_REBUILT_LOG)).toHaveLength(1);
	});

	it('rebuilds the report once the engine answers', async () => {
		view(atBuild());
		const result = await run([{ op: 'build_implementation_report', requestId: 'r' }]);
		expect(result.ok).toBe(true);
		expect(result.results.find((r) => r.op === 'build_implementation_report')?.summary).not.toBe(REPORT_NOT_REBUILT);
		expect(savedRequest().history.some((h) => h.summary === REPORT_NOT_REBUILT_LOG)).toBe(false);
	});
});
