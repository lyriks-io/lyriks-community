import { describe, expect, it } from 'vitest';
import { nodeId } from '$domain/graph';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { ProjectUsersDraft } from '$domain/users';
import type { ProjectRulesDraft } from '$domain/rules';
import type { Gap } from '$domain/coherence';
import {
	createComponent,
	createElementNode,
	createEmptyExperienceDraft,
	createGroupNode,
	createScreen,
	createTemplate
} from '$domain/experience';
import { buildKnowledgeGraph } from './build-knowledge-graph';

const featuresWith = (featureId: string): ProjectFeaturesDraft => ({
	projectId: 'p1',
	cores: [{ id: 'core1', name: 'Core', description: '', tone: 'customer' }],
	families: [],
	features: [
		{
			id: featureId,
			name: 'Request a return',
			coreId: 'core1',
			parentFamilyId: null,
			description: '',
			unspaghettitFeatureId: featureId
		}
	],
	mvpAssignments: [],
	releases: [],
	roadmapAssignments: [],
	lastSavedAt: null
});

const gap = (over: Partial<Gap>): Gap => ({
	id: 'g1',
	severity: 'medium',
	title: 'Behavior gaps — Request a return',
	detail: 'x',
	sourceStep: 'features',
	blocking: false,
	...over
});

describe('buildKnowledgeGraph — gap anchoring', () => {
	it('hangs a feature-scoped gap off its feature node, not the project root', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-14T00:00:00.000Z',
			features: featuresWith('feat-1'),
			gaps: [gap({ featureRef: 'feat-1' })]
		});

		const edge = graph.edges.find((e) => e.id === 'e:gap:g1');
		expect(edge?.from).toBe(nodeId('feature', 'feat-1'));
		expect(edge?.from).not.toBe(nodeId('project', 'p1'));
	});

	it('falls back to the project root when the referenced feature is absent', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-14T00:00:00.000Z',
			features: featuresWith('feat-1'),
			gaps: [gap({ featureRef: 'ghost' })]
		});

		const edge = graph.edges.find((e) => e.id === 'e:gap:g1');
		expect(edge?.from).toBe(nodeId('project', 'p1'));
	});

	it('anchors a gap with no featureRef to the project root', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-14T00:00:00.000Z',
			features: featuresWith('feat-1'),
			gaps: [gap({})]
		});

		const edge = graph.edges.find((e) => e.id === 'e:gap:g1');
		expect(edge?.from).toBe(nodeId('project', 'p1'));
	});
});

const usersWith = (capabilityId: string): ProjectUsersDraft => ({
	projectId: 'p1',
	roles: [
		{
			id: 'role-1',
			name: 'Merchant Admin',
			description: '',
			userCountMin: 1,
			userCountMax: null,
			tone: 'admin', sourceIds: []
		}
	],
	offStructureCapabilities: [{ id: capabilityId, label: 'Export returns & refund reports', note: null }],
	permissions: [
		{ roleId: 'role-1', capabilityId, capabilitySource: 'off_structure', action: 'read' }
	],
	capabilityProfiles: [],
	lastSavedAt: null
});

const rulesWith = (inventory: ProjectRulesDraft['inventory']): ProjectRulesDraft => ({
	projectId: 'p1',
	inventory,
	issues: [],
	scenarios: [],
	lastSavedAt: null
});

describe('buildKnowledgeGraph — permissions', () => {
	it('connects a role to a feature projected after the users context', () => {
		const users: ProjectUsersDraft = {
			...usersWith('unused'),
			offStructureCapabilities: [],
			permissions: [
				{
					roleId: 'role-1',
					capabilityId: 'feat-1',
					capabilitySource: 'feature',
					action: 'read'
				}
			]
		};
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-21T00:00:00.000Z',
			users,
			features: featuresWith('feat-1')
		});

		expect(graph.edges).toContainEqual(
			expect.objectContaining({
				from: nodeId('role', 'role-1'),
				to: nodeId('feature', 'feat-1'),
				kind: 'accesses',
				label: 'read'
			})
		);
	});

	it('connects a page grant to the screen Experience already owns', () => {
		const experience = createEmptyExperienceDraft('p1');
		experience.screens = [createScreen({ id: 'scr-1', name: 'Invoices' })];
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-23T00:00:00.000Z',
			users: {
				...usersWith('unused'),
				offStructureCapabilities: [],
				permissions: [
					{
						roleId: 'role-1',
						capabilityId: 'screen:scr-1',
						capabilitySource: 'surface',
						action: 'view'
					}
				]
			},
			experience
		});

		expect(graph.edges).toContainEqual(
			expect.objectContaining({
				from: nodeId('role', 'role-1'),
				to: nodeId('screen', 'scr-1'),
				kind: 'accesses',
				label: 'view'
			})
		);
	});

	it('gives a behavior surface its own node under the owning feature, and reaches it', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-23T00:00:00.000Z',
			users: {
				...usersWith('unused'),
				offStructureCapabilities: [],
				permissions: [
					{
						roleId: 'role-1',
						capabilityId: 'surface:feat-1:dlg-confirm',
						capabilitySource: 'surface',
						action: 'view'
					}
				]
			},
			features: featuresWith('feat-1'),
			surfaces: [
				{
					id: 'surface:feat-1:dlg-confirm',
					label: 'Confirm Return',
					source: 'surface',
					sourceRefId: 'feat-1',
					sourceRefLabel: 'Request a return',
					kind: 'surface',
					surfaceKind: 'dialog'
				}
			]
		});

		// The node id matches the behavior overlay's scheme, so the kernel layer
		// describes the same node instead of adding a twin.
		expect(graph.nodes).toContainEqual(
			expect.objectContaining({
				id: nodeId('surface', 'dlg-confirm'),
				kind: 'surface',
				context: 'behavior',
				label: 'Confirm Return',
				detail: 'dialog'
			})
		);
		expect(graph.edges).toContainEqual(
			expect.objectContaining({
				from: nodeId('feature', 'feat-1'),
				to: nodeId('surface', 'dlg-confirm'),
				kind: 'contains'
			})
		);
		expect(graph.edges).toContainEqual(
			expect.objectContaining({
				from: nodeId('role', 'role-1'),
				to: nodeId('surface', 'dlg-confirm'),
				kind: 'accesses',
				label: 'view'
			})
		);
	});
});

describe('buildKnowledgeGraph — rule nesting', () => {
	it('nests a permission rule under its capability, not the project root', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-14T00:00:00.000Z',
			users: usersWith('cap-1'),
			rules: rulesWith([
				{
					id: 'perm-role-1-cap-1-read',
					label: 'Merchant Admin → read · Export returns & refund reports',
					category: 'permissions',
					source: 'permission',
					sourceRefId: 'cap-1',
					statement: '…',
					mandatory: true
				}
			])
		});

		const edge = graph.edges.find((e) => e.id === 'e:proj-rule:perm-role-1-cap-1-read');
		expect(edge?.from).toBe(nodeId('capability', 'cap-1'));
		expect(edge?.from).not.toBe(nodeId('project', 'p1'));

		// The "· Export returns & refund reports" suffix repeats the capability it
		// now nests under, so the graph node drops it.
		const node = graph.nodes.find((n) => n.id === nodeId('rule', 'perm-role-1-cap-1-read'));
		expect(node?.label).toBe('Merchant Admin → read');
	});

	it('keeps a root-anchored rule label intact (no parent to strip)', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-14T00:00:00.000Z',
			rules: rulesWith([
				{
					id: 'fr-0',
					label: 'Refunds require an approval record',
					category: 'business',
					source: 'definition_rule',
					sourceRefId: 'definition.business.rules[0]',
					statement: '…',
					mandatory: true
				}
			])
		});

		const node = graph.nodes.find((n) => n.id === nodeId('rule', 'fr-0'));
		expect(node?.label).toBe('Refunds require an approval record');
	});

	it('leaves a homeless definition rule on the project root', () => {
		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-14T00:00:00.000Z',
			rules: rulesWith([
				{
					id: 'fr-0',
					label: 'Refunds require an approval record',
					category: 'business',
					source: 'definition_rule',
					sourceRefId: 'definition.business.rules[0]',
					statement: '…',
					mandatory: true
				}
			])
		});

		const edge = graph.edges.find((e) => e.id === 'e:proj-rule:fr-0');
		expect(edge?.from).toBe(nodeId('project', 'p1'));
	});
});

describe('buildKnowledgeGraph — experience surfaces', () => {
	it('connects component and template builder elements to their actual surface owner', () => {
		const experience = createEmptyExperienceDraft('p1');
		experience.screens = [
			createScreen({ id: 'screen-1', name: 'Expense form' }),
			createScreen({ id: 'screen-2', name: 'Confirmation' })
		];
		experience.components = [createComponent({ id: 'component-1', name: 'Expense card' })];
		experience.templates = [createTemplate({ id: 'template-1', name: 'Dashboard' })];

		const componentElement = createElementNode('component-1', 'component-root', 'text');
		componentElement.label = 'Merchant';
		const templateElement = createElementNode('template-1', 'template-root', 'heading');
		templateElement.label = 'Expenses';
		const navigationElement = createElementNode('screen-1', 'screen-root', 'button');
		navigationElement.label = 'Continue';
		navigationElement.wiring.transitions.push({
			id: 'transition-1',
			trigger: 'click',
			effect: { kind: 'navigate', target: 'screen-2' }
		});
		const componentHost = createGroupNode('screen-1', 'screen-root', 'Expense card host');
		componentHost.componentId = 'component-1';
		experience.builder.nodes[componentElement.id] = componentElement;
		experience.builder.nodes[templateElement.id] = templateElement;
		experience.builder.nodes[navigationElement.id] = navigationElement;
		experience.builder.nodes[componentHost.id] = componentHost;

		const graph = buildKnowledgeGraph({
			projectId: 'p1',
			generatedAt: '2026-07-21T00:00:00.000Z',
			experience
		});

		expect(graph.edges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					from: nodeId('project', 'p1'),
					to: nodeId('component', 'component-1'),
					kind: 'contains'
				}),
				expect.objectContaining({
					from: nodeId('component', 'component-1'),
					to: nodeId('element', componentElement.id),
					kind: 'contains'
				}),
				expect.objectContaining({
					from: nodeId('template', 'template-1'),
					to: nodeId('element', templateElement.id),
					kind: 'contains'
				}),
				expect.objectContaining({
					from: nodeId('screen', 'screen-1'),
					to: nodeId('component', 'component-1'),
					kind: 'uses'
				}),
				expect.objectContaining({
					from: nodeId('element', navigationElement.id),
					to: nodeId('screen', 'screen-2'),
					kind: 'transitions',
					label: 'click'
				})
			])
		);
	});
});
