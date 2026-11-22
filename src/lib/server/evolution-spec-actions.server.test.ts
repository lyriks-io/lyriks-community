import { describe, expect, it } from 'vitest';
import { ACTIONS_UNREAD, createDraftLeaf, createEvolutionRequest, type EvolutionRequest } from '$domain/evolution';
import type { AppServices } from '$composition/container.server';
import type { EvolutionView } from './evolution-view.server';
import { actionReadings, elementFingerprint, specificationActionTrails } from './evolution-spec-actions.server';
import { loadLocalGraph } from './evolution-graph.server';

/**
 * What a validation of an action stands behind is the action as the request
 * reads it: its own words and rules, and what the request does to them
 * (criterion 7c214ba8, "approvals belong to the exact reviewed version"). Other
 * writes to the project (another feature, another request and its drafts, the
 * features page saved without its roadmap tags, a newer revision) leave it as
 * it was, so a validation given before them still stands after them.
 */

const rule = (id: string, description: string) => ({
	id,
	category: 'business',
	description,
	condition: { left: 'cart.count', operator: 'greater_than', right: 20 },
	effect: { type: 'block_action', reason: description }
});
const action = (id: string, name: string, rules: unknown[]) => ({ id, name, intent: name, roles: ['member'], rules, effects: [], scenarios: [] });
const feature = (actions: unknown[], tags: string[] = []) => ({
	id: 'feat-1',
	name: 'Checkout',
	tags,
	surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions }]
});
const base = (tags: string[] = []) => feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')]), action('a2', 'Empty the cart', [])], tags);
/** The base as the draft's model makes it: a rule of Pay reworded, and an action added. */
const drafted = (tags: string[] = []) =>
	feature([action('a1', 'Pay', [rule('r1', 'At most 30 items')]), action('a2', 'Empty the cart', []), action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices')])], tags);

function requestOf(id: string, leafId: string): EvolutionRequest {
	return createEvolutionRequest({
		id,
		stage: 'coherence',
		leafIds: [leafId],
		drafts: [createDraftLeaf({ id: `draft:${id}`, kind: 'amend', baseLeafId: leafId, behaviourModel: { operations: [{ kind: 'add_action' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00.000Z' } })]
	});
}

interface World {
	projectId?: string;
	revision: number;
	requests: EvolutionRequest[];
	stored: Record<string, Record<string, unknown>>;
	/** What the engine answers for each draft: a feature, `refused`, or `silent` (a timeout, a recycled subprocess). */
	walks: Record<string, Record<string, unknown> | 'refused' | 'silent' | null>;
	/** Feature ids the store cannot read (a file caught mid-write). */
	unreadable?: string[];
}

function viewOf(world: World): EvolutionView {
	return {
		projectId: world.projectId ?? 'p',
		revision: world.revision,
		language: 'en',
		glossaryTerms: [],
		draft: { projectId: 'p', requests: world.requests },
		features: { cores: [{ id: 'core-1', name: 'Shop' }], features: Object.keys(world.stored).map((id) => ({ id, name: String(world.stored[id].name), coreId: 'core-1' })) },
		data: { entities: [], fields: [] }
	} as unknown as EvolutionView;
}

function servicesOf(world: World): AppServices {
	return {
		clock: { nowIso: () => '2026-11-20T00:40:00.000Z' },
		readBehaviorFeature: {
			execute: async (_p: string, id: string) => {
				if (world.unreadable?.includes(id)) throw new Error('Unexpected end of JSON input');
				return world.stored[id] ? { feature: structuredClone(world.stored[id]) } : null;
			}
		},
		simulateBehavior: {
			draftFeatureWalk: async (_p: string, target: { draftId: string }) => {
				const walked = world.walks[target.draftId];
				if (walked === 'silent' || walked === undefined || walked === null) return null;
				if (walked === 'refused') return { kind: 'refused', error: 'The model does not apply.' };
				return { kind: 'walk', walk: { ok: true, feature: structuredClone(walked) } };
			}
		}
	} as unknown as AppServices;
}

async function readingsOf(world: World, request: EvolutionRequest) {
	const view = viewOf(world);
	const reading = await loadLocalGraph(servicesOf(world), view, request);
	if (reading.status !== 'read') throw new Error(reading.reason);
	return actionReadings(view, request, reading.graph);
}

describe('what a validation of an action stands behind [criterion:b33f1a03]', () => {
	const ours = requestOf('r-ours', 'feat-1');
	const world = (): World => ({
		revision: 10,
		requests: [ours],
		stored: { 'feat-1': base(['phase:2']), 'feat-2': feature([action('b1', 'Ship', [])]) },
		walks: { 'draft:r-ours': drafted(['phase:2']) }
	});

	it('reads the actions the request changes, each with its fingerprint', async () => {
		const readings = await readingsOf(world(), ours);
		expect(Object.keys(readings).sort()).toEqual(['element.action:a1@feature:feat-1', 'element.action:a3@feature:feat-1']);
		expect(await elementFingerprint(servicesOf(world()), viewOf(world()), ours, 'element.action:a3@feature:feat-1')).toEqual({ status: 'read', fingerprint: readings['element.action:a3@feature:feat-1'].fingerprint });
	});

	it('keeps every fingerprint when the project is written elsewhere: another feature, another request, the roadmap taken off, a newer revision', async () => {
		const before = await readingsOf(world(), ours);
		const busy = world();
		busy.revision = 57;
		busy.stored['feat-2'] = feature([action('b1', 'Ship', [rule('rb', 'Ships within a day')]), action('b2', 'Track', [])]);
		const theirs = requestOf('r-theirs', 'feat-2');
		busy.requests = [theirs, ours, requestOf('r-other', 'feat-1')];
		busy.walks['draft:r-theirs'] = feature([action('b9', 'Gift wrap', [])]);
		busy.walks['draft:r-other'] = feature([action('c1', 'Pay in three', [])]);
		// The features page saved without the roadmap: the base and the draft replayed over it lose the tag alike.
		busy.stored['feat-1'] = base();
		busy.walks['draft:r-ours'] = drafted();
		const after = await readingsOf(busy, ours);
		expect(Object.fromEntries(Object.entries(after).map(([k, r]) => [k, r.fingerprint]))).toEqual(Object.fromEntries(Object.entries(before).map(([k, r]) => [k, r.fingerprint])));
	});

	it('changes the fingerprint of an action whose own rule changes, and only that one', async () => {
		const before = await readingsOf(world(), ours);
		const edited = world();
		edited.walks['draft:r-ours'] = feature([action('a1', 'Pay', [rule('r1', 'At most 30 items')]), action('a2', 'Empty the cart', []), action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices for a week')])]);
		const after = await readingsOf(edited, ours);
		expect(after['element.action:a1@feature:feat-1'].fingerprint).toBe(before['element.action:a1@feature:feat-1'].fingerprint);
		expect(after['element.action:a3@feature:feat-1'].fingerprint).not.toBe(before['element.action:a3@feature:feat-1'].fingerprint);
	});
});

describe('a reading the engine could not take keeps the last one and says so [criterion:c623df9c]', () => {
	const world = (projectId: string, request: EvolutionRequest): World => ({
		projectId,
		revision: 10,
		requests: [request],
		stored: { 'feat-1': base() },
		walks: { [`draft:${request.id}`]: drafted() }
	});

	it('reads unread, with no graph, when the engine does not answer and nothing was read for these drafts', async () => {
		const ours = requestOf('r-silent', 'feat-1');
		const silent = world('p-silent', ours);
		silent.walks['draft:r-silent'] = 'silent';
		const reading = await loadLocalGraph(servicesOf(silent), viewOf(silent), ours);
		expect(reading).toEqual({ status: 'unread', reason: ACTIONS_UNREAD, last: null });
	});

	it('keeps the last good reading of the same request and drafts, with when it was taken', async () => {
		const ours = requestOf('r-kept', 'feat-1');
		const healthy = world('p-kept', ours);
		const read = await loadLocalGraph(servicesOf(healthy), viewOf(healthy), ours);
		expect(read.status).toBe('read');
		const silent = { ...healthy, walks: { 'draft:r-kept': 'silent' as const } };
		const reading = await loadLocalGraph(servicesOf(silent), viewOf(silent), ours);
		expect(reading.status).toBe('unread');
		if (reading.status !== 'unread' || read.status !== 'read') return;
		expect(reading.last).toEqual({ graph: read.graph, readAt: '2026-11-20T00:40:00.000Z' });
	});

	it('never hands the last reading of another request, nor of older drafts', async () => {
		const ours = requestOf('r-mine', 'feat-1');
		const healthy = world('p-mixed', ours);
		await loadLocalGraph(servicesOf(healthy), viewOf(healthy), ours);
		const theirs = requestOf('r-theirs', 'feat-1');
		const other = { ...world('p-mixed', theirs), walks: { 'draft:r-theirs': 'silent' as const } };
		expect(await loadLocalGraph(servicesOf(other), viewOf(other), theirs)).toMatchObject({ status: 'unread', last: null });
		const rewritten: EvolutionRequest = { ...ours, drafts: ours.drafts.map((d) => ({ ...d, behaviourModel: { ...d.behaviourModel!, operations: [{ kind: 'add_action' }, { kind: 'add_action_rule' }] } })) };
		const silent = { ...healthy, requests: [rewritten], walks: { 'draft:r-mine': 'silent' as const } };
		expect(await loadLocalGraph(servicesOf(silent), viewOf(silent), rewritten)).toMatchObject({ status: 'unread', last: null });
	});

	it('reads unread when a feature the request touches cannot be read, rather than reading every action as new', async () => {
		const ours = requestOf('r-unreadable', 'feat-1');
		const broken = { ...world('p-unreadable', ours), unreadable: ['feat-1'] };
		expect(await loadLocalGraph(servicesOf(broken), viewOf(broken), ours)).toMatchObject({ status: 'unread', reason: ACTIONS_UNREAD });
	});

	it('still reads a draft the engine refuses as the feature it stands for: the engine answered', async () => {
		const ours = requestOf('r-refused', 'feat-1');
		const refused = { ...world('p-refused', ours), walks: { 'draft:r-refused': 'refused' as const } };
		const reading = await loadLocalGraph(servicesOf(refused), viewOf(refused), ours);
		expect(reading.status).toBe('read');
	});

	it('gives no fingerprint of an action and no count of the actions while unread, and still reads a path of the journey', async () => {
		const ours = requestOf('r-fp', 'feat-1');
		const silent = { ...world('p-fp', ours), walks: { 'draft:r-fp': 'silent' as const } };
		const [services, view] = [servicesOf(silent), viewOf(silent)];
		expect(await elementFingerprint(services, view, ours, 'element.action:a3@feature:feat-1')).toEqual({ status: 'unread', reason: ACTIONS_UNREAD });
		expect(await specificationActionTrails(services, view, ours)).toEqual({ status: 'unread', reason: ACTIONS_UNREAD });
		expect(await elementFingerprint(services, view, ours, 'element.path.export-the-list')).toEqual({ status: 'read', fingerprint: null });
	});
});
