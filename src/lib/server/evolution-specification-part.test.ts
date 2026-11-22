import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { coachOf, createEvolutionRequest, latestVersion, type Actor, type EvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
import { applyEvolutionOperations } from './evolution-operations.server';
import { fieldTrail, specificationHoldOf, specificationPart, type EvolutionView, type SpecificationEntry } from './evolution-view.server';

/** The actions as the engine read them (specificationActionEntries answers this when it answers). */
const actionsRead = (entries: SpecificationEntry[]) => ({ status: 'read' as const, entries });

/**
 * Criterion 2df61e72: get_evolution part "specification" lists every item the
 * Specification gate counts, each with the key validate_field takes, so a
 * client never builds one from the diagram or the code.
 */
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: '2026-11-20T01:00:00Z' }));
const services = {
	clock: { nowIso: () => '2026-11-20T01:00:00Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {},
	// The graph a key no item names is looked up in: no feature behaviour here.
	readBehaviorFeature: { execute: async () => null },
	simulateBehavior: { draftFeatureWalk: async () => null }
} as unknown as AppServices;
const relayed: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'ai_client' };

const DRAWING = 'actor Person\nuse case Export the list: Person\nflow Export the list\nPerson: clicks Export\n  refused when the list is empty: nothing is exported';

function viewOf(request: EvolutionRequest): EvolutionView {
	scene.view = {
		projectId: 'p',
		draft: { projectId: 'p', requests: [request] },
		features: createEmptyFeaturesDraft('p'),
		data: { entities: [], fields: [] },
		leaves: [],
		sources: [],
		glossaryTerms: [],
		members: [],
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 1,
		language: 'en'
	};
	return scene.view as EvolutionView;
}
const run = (operations: unknown[]) => applyEvolutionOperations(services, { projectId: 'p', operations, actor: relayed, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}

/** A request whose Specification holds a drafted feature's criteria and a path of the journey. */
async function specified(): Promise<EvolutionRequest> {
	viewOf({ ...createEvolutionRequest({ id: 'r', title: 'Export as CSV' }), stage: 'specification' });
	const written = await run([
		{ op: 'answer_step', requestId: 'r', step: 'functional_spec', question: 'diagram', answer: DRAWING },
		{ op: 'add_draft_leaf', requestId: 'r', kind: 'add', name: 'Export the list', acceptanceCriteria: ['A list of ten rows exports ten lines'] }
	]);
	expect(written.ok).toBe(true);
	const request = saved();
	save.mockClear();
	viewOf(request);
	return request;
}

/** An action as the engine's graph offers it, on the feature node it belongs to. */
const actionOf = (view: EvolutionView, request: EvolutionRequest): SpecificationEntry => ({
	fieldPath: 'element.action:a1',
	leafId: 'feature:feat-export',
	kind: 'action',
	label: 'Export › Export the list',
	trail: fieldTrail(view, request, 'element.action:a1@feature:feat-export', '["Export the list","changed",[]]'),
	href: '/projects/p/evolution?request=r'
});

describe('the Specification lists what it waits on, each with its key [criterion:2df61e72]', () => {
	beforeEach(() => save.mockClear());

	it('lists every item the gate counts with the fieldPath and leafId validate_field takes', async () => {
		const request = await specified();
		const view = scene.view as EvolutionView;
		const action = actionOf(view, request);
		const { specification } = specificationPart(view, request, actionsRead([action]));
		const hold = specificationHoldOf(view, request, { status: 'read', items: [action.trail] });
		// The list and the gate count the same items.
		expect(specification.total).toBe(hold.total);
		expect(specification.items).toHaveLength(hold.total);
		expect(specification.left).toBe(hold.total - hold.validated);
		const byKind = Object.fromEntries(specification.items.map((i) => [i.kind, i]));
		const draftId = request.drafts[0].id;
		expect(byKind.answer).toMatchObject({ fieldPath: '05-functional.acceptance', leafId: draftId, key: `05-functional.acceptance@${draftId}`, standing: 'waiting', validatedBy: [] });
		expect(byKind.answer.label).toBe('Export the list › Acceptance criteria');
		expect(byKind.path).toMatchObject({ fieldPath: 'element.path.export-the-list', leafId: null, key: 'element.path.export-the-list', label: 'Path of the journey › Export the list' });
		expect(byKind.action).toMatchObject({ fieldPath: 'element.action:a1', leafId: 'feature:feat-export', key: 'element.action:a1@feature:feat-export' });
		for (const item of specification.items) expect(item.href.startsWith('/projects/p/evolution?request=r')).toBe(true);
	});

	it('takes back exactly the key it lists: a validated item reads validated, by whom, and leaves the count', async () => {
		const request = await specified();
		const view = scene.view as EvolutionView;
		const path = specificationPart(view, request, actionsRead([])).specification.items.find((i) => i.kind === 'path')!;
		const answer = specificationPart(view, request, actionsRead([])).specification.items.find((i) => i.kind === 'answer')!;
		const result = await run([
			{ op: 'validate_field', requestId: 'r', fieldPath: path.fieldPath, ...(path.leafId ? { leafId: path.leafId } : {}) },
			{ op: 'validate_field', requestId: 'r', fieldPath: answer.fieldPath, leafId: answer.leafId }
		]);
		expect(result.ok).toBe(true);
		const after = viewOf(saved());
		const read = specificationPart(after, saved(), actionsRead([])).specification;
		expect(read.items.find((i) => i.kind === 'path')).toMatchObject({ standing: 'validated', validatedBy: ['ana@example.test'] });
		expect(read.items.find((i) => i.kind === 'answer')).toMatchObject({ standing: 'validated', validatedBy: ['ana@example.test'] });
		expect(read.validated).toBe(2);
		expect(read.left).toBe(read.total - 2);
	});

	it('reads a validation of an earlier version as outdated by the later write', async () => {
		const request = await specified();
		const view = scene.view as EvolutionView;
		const path = specificationPart(view, request, actionsRead([])).specification.items.find((i) => i.kind === 'path')!;
		expect((await run([{ op: 'validate_field', requestId: 'r', fieldPath: path.fieldPath }])).ok).toBe(true);
		viewOf(saved());
		save.mockClear();
		// The flow is redrawn: the path the person stood behind reads otherwise now.
		expect((await run([{ op: 'answer_step', requestId: 'r', step: 'functional_spec', question: 'diagram', answer: `${DRAWING}\nPerson: picks the columns` }])).ok).toBe(true);
		const rewritten = saved();
		const item = specificationPart(viewOf(rewritten), rewritten, actionsRead([])).specification.items.find((i) => i.kind === 'path')!;
		expect(item.standing).toBe('outdated');
		// Who stood behind it before the later write.
		expect(item.validatedBy).toEqual(['ana@example.test']);
		expect(specificationPart(viewOf(rewritten), rewritten, actionsRead([])).specification.validated).toBe(0);
	});

	it('pages like the other lists and narrows to one touched feature', async () => {
		const request = await specified();
		const view = scene.view as EvolutionView;
		const action = actionOf(view, request);
		const first = specificationPart(view, request, actionsRead([action]), { offset: 0, limit: 1 }).specification;
		expect(first.items).toHaveLength(1);
		expect(first.matched).toBe(first.total);
		const second = specificationPart(view, request, actionsRead([action]), { offset: 1, limit: 1 }).specification;
		expect(second.items[0].key).not.toBe(first.items[0].key);
		// An action lives on the feature node of its leaf.
		expect(specificationPart(view, request, actionsRead([action]), { leaf: 'feat-export' }).specification.items.map((i) => i.kind)).toEqual(['action']);
	});

	it('names the part in the gate and in the next step, and in the refusal of a key it does not offer', async () => {
		await specified();
		const refused = await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.path.import-the-list' }]);
		expect(JSON.stringify(refused.results.find((r) => r.op === 'validate_field'))).toContain('get_evolution part \\"specification\\"');
		const coach = coachOf({ ...createEvolutionRequest({ id: 'r', title: 'Export' }), stage: 'coherence', leafIds: ['feat-export'], impactReport: { status: 'ready' }, coherenceReport: { status: 'ready' } } as never, {
			path: [{ step: 'impact_analysis', current: true, detail: 'Measure the change.' }] as never,
			pendingProposals: 0,
			questionsOwed: 0,
			gate: { ok: false, reason: 'The Specification is validated first: 8 of 8 left.' },
			collisions: 0,
			frictions: 0,
			undecidedLines: 0,
			solo: true,
			inputs: { need: { total: 0, validated: 0 }, solution: { total: 0, validated: 0 } },
			specification: { total: 8, validated: 0 }
		} as never);
		expect(coach.personDecides.join(' ')).toContain('get_evolution part "specification"');
	});
});

describe('a change to a feature\'s description is an item of the Specification [criterion:e384d594]', () => {
	const features = {
		...createEmptyFeaturesDraft('p'),
		features: [{ id: 'feat-x', name: 'Export', coreId: 'core', parentFamilyId: null, description: 'Export the list as CSV.', unspaghettitFeatureId: 'feat-x' }],
		leafMeta: { 'feat-x': { acceptanceCriteria: [{ id: 'c1', text: 'Ten rows export ten lines.' }] } }
	};
	function viewWith(request: EvolutionRequest): EvolutionView {
		viewOf(request);
		scene.view = { ...(scene.view as object), features, leaves: [{ id: 'feat-x', name: 'Export', coreId: 'core' }] };
		return scene.view as EvolutionView;
	}
	const items = (request: EvolutionRequest) => specificationPart(scene.view as EvolutionView, request, actionsRead([])).specification;
	const describing = () => items(saved()).items.find((i) => i.kind === 'description');

	beforeEach(() => {
		save.mockClear();
		viewWith({ ...createEvolutionRequest({ id: 'r', title: 'Export as CSV', leafIds: ['feat-x'] }), stage: 'specification' });
	});

	it('lists the description an amendment writes, keyed as validate_field takes it, and counts it in the gate', async () => {
		expect((await run([{ op: 'add_draft_leaf', requestId: 'r', kind: 'amend', baseLeafId: 'feat-x', descriptionAppend: 'Excel opens it as it is.' }])).ok).toBe(true);
		viewWith(saved());
		const item = describing();
		expect(item).toMatchObject({ fieldPath: 'element.description', leafId: 'feat-x', key: 'element.description@feat-x', label: 'Export › Description', standing: 'waiting' });
		const hold = specificationHoldOf(scene.view as EvolutionView, saved());
		expect(items(saved()).total).toBe(hold.total);
		expect(items(saved()).items.filter((i) => i.kind === 'description')).toHaveLength(1);
	});

	it('stands behind the description the landing writes, and waits again after a later edit', async () => {
		expect((await run([{ op: 'add_draft_leaf', requestId: 'r', kind: 'amend', baseLeafId: 'feat-x', descriptionPatch: { find: 'CSV', replace: 'CSV or Excel' } }])).ok).toBe(true);
		const drafted = saved();
		viewWith(drafted);
		save.mockClear();
		expect((await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.description', leafId: 'feat-x' }])).ok).toBe(true);
		const validated = saved();
		expect(latestVersion(validated, 'element.description@feat-x')?.value).toBe('Export the list as CSV or Excel.');
		viewWith(validated);
		expect(describing()).toMatchObject({ standing: 'validated', validatedBy: ['ana@example.test'] });
		save.mockClear();
		expect((await run([{ op: 'update_draft_leaf', requestId: 'r', draftId: drafted.drafts[0].id, descriptionAppend: 'One file per list.' }])).ok).toBe(true);
		viewWith(saved());
		expect(describing()?.standing).toBe('outdated');
		expect(items(saved()).validated).toBe(0);
	});

	it('brings no item for a draft that leaves the description alone, and refuses that key there', async () => {
		expect((await run([{ op: 'add_draft_leaf', requestId: 'r', kind: 'amend', baseLeafId: 'feat-x', objective: 'Hand the list over.' }])).ok).toBe(true);
		viewWith(saved());
		expect(describing()).toBeUndefined();
		save.mockClear();
		const refused = await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.description', leafId: 'feat-x' }]);
		expect(refused.ok).toBe(false);
		expect(save).not.toHaveBeenCalled();
	});

	it('lists the description a new feature gives, on the draft that adds it', async () => {
		expect((await run([{ op: 'add_draft_leaf', requestId: 'r', kind: 'add', name: 'Import', description: 'Import a list from CSV.' }])).ok).toBe(true);
		viewWith(saved());
		const draftId = saved().drafts[0].id;
		expect(describing()).toMatchObject({ fieldPath: 'element.description', leafId: draftId, key: `element.description@${draftId}` });
	});
});
