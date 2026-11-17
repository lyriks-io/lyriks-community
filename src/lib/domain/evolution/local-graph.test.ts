import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest } from './draft';
import { changesWithHolders, localGraphOf } from './local-graph';

/**
 * The request drawn as its own graph (ac-evo-graph-local, -status, -folded):
 * what each node becomes is read by comparing the draft's behaviour with the
 * feature as it stands, never declared.
 */

const feature = (rules: { id: string; description: string }[], states: { id: string; path: string }[] = []) => ({
	surfaces: [
		{
			id: 's1',
			name: 'Basket',
			stateDefinitions: states,
			invariants: [],
			actions: [{ id: 'a1', name: 'Place the order', rules, transitions: [], emittedEvents: ['order.placed'], scenarios: [] }]
		}
	]
});

const cores = [{ id: 'core-order', name: 'Order' }];
const leaves = [
	{ id: 'feat-order', name: 'Order online', coreId: 'core-order' },
	{ id: 'feat-pickup', name: 'Pick up', coreId: 'core-order' }
];

describe('the graph of a request', () => {
	it('colours what an amendment adds, changes and removes, and keeps the rest grey', () => {
		const draft = createDraftLeaf({ id: 'draft:x', kind: 'amend', baseLeafId: 'feat-order', name: '' });
		const request = createEvolutionRequest({ leafIds: ['feat-order', 'draft:x'], drafts: [draft] });
		const graph = localGraphOf({
			request,
			cores,
			leaves,
			base: { 'feat-order': feature([{ id: 'r-empty', description: 'An empty basket is refused.' }, { id: 'r-old', description: 'Old rule' }], [{ id: 'st1', path: 'order.status' }]) },
			drafted: {
				'draft:x': feature([{ id: 'r-empty', description: 'An empty basket is refused.' }, { id: 'r-cap', description: 'Twenty orders per slot.' }], [{ id: 'st1', path: 'order.status' }, { id: 'st2', path: 'slot.orderCount' }])
			}
		});
		const status = (id: string) => graph.nodes.find((n) => n.id === id)?.status;
		expect(status('core:core-order')).toBe('existing');
		expect(status('feature:feat-order')).toBe('changed');
		expect(status('action:a1')).toBe('changed');
		expect(status('rule:r-empty')).toBe('existing');
		expect(status('rule:r-cap')).toBe('added');
		expect(status('rule:r-old')).toBe('removed');
		expect(status('state:st2')).toBe('added');
		expect(graph.counts).toMatchObject({ added: 2, changed: 2, removed: 1 });
	});

	it('opens folded at the actions, and draws what the impact reaches without its insides', () => {
		const request = createEvolutionRequest({
			leafIds: ['feat-order'],
			impactFindings: [
				{ id: 'i1', hypothesis: 'change', section: 'leaves', nodeId: 'feature:feat-pickup', nodeLabel: 'Pick up', nodeKind: 'feature', groupPath: [], note: '', severity: 'minor', depth: 1 } as never
			]
		});
		const graph = localGraphOf({ request, cores, leaves, base: { 'feat-order': feature([{ id: 'r1', description: 'Rule' }]) }, drafted: {} });
		expect(graph.nodes.filter((n) => !n.folded).map((n) => n.kind)).toEqual(['core', 'feature', 'surface', 'action', 'feature']);
		expect(graph.nodes.find((n) => n.id === 'feature:feat-pickup')).toMatchObject({ status: 'reached', featureId: 'feat-pickup' });
		expect(graph.nodes.some((n) => n.parentId === 'feature:feat-pickup')).toBe(false);
	});

	it('draws a whole new feature in blue and a removed one in red', () => {
		const added = createDraftLeaf({ id: 'draft:new', kind: 'add', name: 'Allergens', coreId: 'core-order' });
		const removed = createDraftLeaf({ id: 'draft:rm', kind: 'remove', baseLeafId: 'feat-pickup', name: '' });
		const request = createEvolutionRequest({ leafIds: ['draft:new', 'draft:rm', 'feat-pickup'], drafts: [added, removed] });
		const graph = localGraphOf({
			request,
			cores,
			leaves,
			base: { 'feat-pickup': feature([{ id: 'r9', description: 'Ready first' }]) },
			drafted: { 'draft:new': feature([{ id: 'r-a', description: 'Listed first' }]) }
		});
		expect(graph.nodes.filter((n) => n.parentId === 'feature:draft:new' || n.id === 'feature:draft:new').every((n) => n.status === 'added')).toBe(true);
		expect(graph.nodes.find((n) => n.id === 'feature:feat-pickup')?.status).toBe('removed');
		expect(graph.nodes.find((n) => n.id === 'rule:r9')?.status).toBe('removed');
	});

	it('draws a backend-only change without inventing a screen [criterion:ac-leaf-ac-evo-graph-backend]', () => {
		const sensors = createDraftLeaf({ id: 'draft:sensor', kind: 'add', name: 'Detect presence', coreId: 'core-order' });
		const request = {
			...createEvolutionRequest({ leafIds: ['draft:sensor'], drafts: [sensors] }),
			dataDrafts: [
				{ id: 'data:t', kind: 'add' as const, entityId: null, name: 'Sensor', description: '', addFields: [{ id: 'f-serial', name: 'serialNumber', type: 'string' as const, required: true, list: false, relationTo: null }], changeFields: [], removeFields: [], materialisedAs: null, materialisedAt: null },
				{ id: 'data:b', kind: 'amend' as const, entityId: 'ent-booking', name: '', description: '', addFields: [{ id: 'f-seen', name: 'presenceDetectedAt', type: 'datetime' as const, required: false, list: false, relationTo: null }], changeFields: [], removeFields: ['f-checked'], materialisedAs: null, materialisedAt: null }
			]
		};
		const process = {
			surfaces: [
				{
					id: 'p1',
					name: 'Room presence',
					type: 'workflow',
					stateDefinitions: [],
					invariants: [],
					actions: [
						{ id: 'a-detect', name: 'recordPresence', actor: 'system', rules: [], transitions: [], emittedEvents: [], scenarios: [] },
						{ id: 'a-release', name: 'releaseWithoutPresence', actor: 'schedule', rules: [], transitions: [], emittedEvents: [], scenarios: [] }
					]
				}
			]
		};
		const graph = localGraphOf({
			request,
			cores,
			leaves,
			base: {},
			drafted: { 'draft:sensor': process },
			data: { entities: [{ id: 'ent-booking', name: 'Booking' }], fields: [{ id: 'f-checked', name: 'checkedIn' }] }
		});
		expect(graph.nodes.find((n) => n.id === 'surface:p1')).toMatchObject({ kind: 'surface', variant: 'workflow', status: 'added' });
		expect(graph.nodes.find((n) => n.id === 'action:a-detect')?.variant).toBe('system');
		expect(graph.nodes.find((n) => n.id === 'action:a-release')?.variant).toBe('schedule');
		expect(graph.nodes.find((n) => n.id === 'table:data:t')).toMatchObject({ kind: 'table', label: 'Sensor', status: 'added' });
		expect(graph.nodes.find((n) => n.id === 'table:ent-booking')).toMatchObject({ label: 'Booking', status: 'changed' });
		expect(graph.nodes.find((n) => n.id === 'field:table:ent-booking:f-seen')).toMatchObject({ label: 'presenceDetectedAt', status: 'added' });
		expect(graph.nodes.find((n) => n.id === 'field:table:ent-booking:f-checked')).toMatchObject({ label: 'checkedIn', status: 'removed' });
	});

	it('says who fires an action: a person unless the model says otherwise', () => {
		const request = createEvolutionRequest({ leafIds: ['feat-order'] });
		const graph = localGraphOf({ request, cores, leaves, base: { 'feat-order': feature([]) }, drafted: {} });
		expect(graph.nodes.find((n) => n.id === 'action:a1')?.variant).toBe('user');
		expect(graph.nodes.find((n) => n.id === 'surface:s1')?.variant).toBeNull();
	});

	it('keeps the changes and only what holds them [criterion:302d93bf]', () => {
		const draft = createDraftLeaf({ id: 'draft:x', kind: 'amend', baseLeafId: 'feat-order', name: '' });
		const request = createEvolutionRequest({ leafIds: ['feat-order', 'draft:x'], drafts: [draft] });
		const before = feature([{ id: 'r-keep', description: 'Kept rule' }], [{ id: 'st1', path: 'order.status' }]);
		const after = feature([{ id: 'r-keep', description: 'Kept rule' }, { id: 'r-new', description: 'New rule' }], [{ id: 'st1', path: 'order.status' }]);
		const graph = localGraphOf({ request, cores, leaves, base: { 'feat-order': before }, drafted: { 'draft:x': after } });
		const ids = changesWithHolders(graph.nodes).map((n) => n.id);
		expect(ids).toContain('rule:r-new');
		// The chain that places it: action, surface, feature, core.
		expect(ids).toEqual(expect.arrayContaining(['action:a1', 'surface:s1', 'feature:feat-order', 'core:core-order']));
		// Untouched siblings are not drawn.
		expect(ids).not.toContain('rule:r-keep');
		expect(ids).not.toContain('state:st1');
	});

	it('draws nothing when the request changes nothing', () => {
		const graph = localGraphOf({ request: createEvolutionRequest({ leafIds: ['feat-order'] }), cores, leaves, base: { 'feat-order': feature([]) }, drafted: {} });
		expect(changesWithHolders(graph.nodes)).toEqual([]);
	});
});

describe('a rule of the graph reads as the model states it [criterion:ac-leaf-ac-evo-graph-ears]', () => {
	it('carries the EARS sentence of each rule and invariant, in the language of the spec', () => {
		const modelled = {
			surfaces: [
				{
					id: 's1',
					name: 'Basket',
					stateDefinitions: [],
					invariants: [{ id: 'inv1', name: 'A slot keeps twenty orders', condition: { left: 'slot.orderCount', operator: 'lte', right: 20 } }],
					actions: [
						{
							id: 'a1',
							name: 'Place the order',
							rules: [{ id: 'r1', description: 'An empty basket is refused.', condition: { left: 'basket.count', operator: 'eq', right: 0 }, effect: { type: 'block_action', reason: 'Your basket is empty.' } }],
							transitions: [],
							scenarios: []
						}
					]
				}
			]
		};
		const read = (lang: 'en' | 'fr') =>
			localGraphOf({ request: createEvolutionRequest({ leafIds: ['feat-order'] }), cores, leaves, base: { 'feat-order': modelled }, drafted: {}, lang }).nodes;
		const rule = read('en').find((n) => n.id === 'rule:r1');
		// The node keeps the rule's own words, and the sentence the Features page reads under it.
		expect(rule?.label).toBe('An empty basket is refused.');
		expect(rule?.statement).toMatch(/^When .+ place the order, if .+, then the system shall refuse to place the order and show "Your basket is empty\."$/);
		expect(read('en').find((n) => n.id === 'invariant:inv1')?.statement).toMatch(/shall/);
		expect(read('fr').find((n) => n.id === 'rule:r1')?.statement).toMatch(/doit/);
		// Nothing else of the graph carries a sentence.
		expect(read('en').filter((n) => n.statement).map((n) => n.kind)).toEqual(['invariant', 'rule']);
	});
});
