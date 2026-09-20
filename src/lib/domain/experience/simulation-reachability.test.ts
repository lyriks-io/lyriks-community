import { describe, expect, it } from 'vitest';
import { addNode, createElementNode, createGroupNode, emptyBuilder, ensureScreenRoot, ensureSurfaceRoot, simulate, type ExperienceBuilder } from './index';

function button(b: ExperienceBuilder, surface: string, parent: string, label = 'Confirm') {
	const node = createElementNode(surface, parent, 'button');
	node.label = label;
	node.wiring.transitions.push({ id: node.id + '-set', trigger: 'click', effect: { kind: 'setState', target: 'confirmed', value: 'true' } });
	addNode(b, node);
	return node;
}

describe('simulation matches rendered interaction scope', () => {
	it('blocks an off-screen nodeId even with an explicit screenId', () => {
		const b = emptyBuilder();
		ensureScreenRoot(b, 'home');
		const target = button(b, 'other', ensureScreenRoot(b, 'other'));
		const run = simulate(b, { actions: [{ nodeId: target.id, screenId: 'other' }] });
		expect(run.errors[0].kind).toBe('visibility');
		expect(run.state.confirmed).toBeUndefined();
	});

	it('requires opening a hidden ancestor before using its child', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'home');
		const modal = createGroupNode('home', root);
		modal.presentation = 'overlay';
		modal.visibleWhen = { path: 'dialog.open', op: 'truthy' };
		addNode(b, modal);
		const target = button(b, 'home', modal.id);
		const open = button(b, 'home', root, 'Open');
		open.wiring.transitions[0].effect.target = 'dialog.open';
		const run = simulate(b, { actions: [{ nodeId: target.id, expectError: true }, { nodeId: open.id }, { nodeId: target.id }] });
		expect(run.ok).toBe(true);
		expect(run.actions[0].action).toBe('blocked');
		expect(run.state.confirmed).toBe(true);
	});

	it.each(['tabs', 'sidebar'] as const)('requires activating the %s panel', (presentation) => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'home');
		const tabs = createGroupNode('home', root);
		tabs.presentation = presentation;
		addNode(b, tabs);
		const first = createGroupNode('home', tabs.id);
		const second = createGroupNode('home', tabs.id);
		addNode(b, first); addNode(b, second);
		const target = button(b, 'home', second.id);
		const run = simulate(b, { actions: [{ nodeId: target.id, expectError: true }, { nodeId: tabs.id, tab: 0.5, expectError: true }, { nodeId: tabs.id, tab: 1 }, { nodeId: target.id }] });
		expect(run.ok).toBe(true);
		expect(run.actions[0].action).toBe('blocked');
		expect(run.state.confirmed).toBe(true);
	});

	it('does not expose a component through a hidden instance or a cycle', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'home');
		const component = ensureSurfaceRoot(b, 'component', 'Component');
		const target = button(b, 'component', component);
		const host = createGroupNode('home', root);
		host.componentId = 'component';
		host.visibleWhen = { path: 'show', op: 'truthy' };
		addNode(b, host);
		const cycle = createGroupNode('component', component);
		cycle.componentId = 'component';
		addNode(b, cycle);
		expect(simulate(b, { actions: [{ nodeId: target.id }] }).ok).toBe(false);
		const visibleHost = createGroupNode('home', root);
		visibleHost.componentId = 'component';
		addNode(b, visibleHost);
		expect(simulate(b, { actions: [{ nodeId: target.id }] }).ok).toBe(true);
	});

	it('does not persist an invalid selection consumed by expectError', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'home');
		const select = createElementNode('home', root, 'select');
		select.wiring.binding = { targetKind: 'state', targetRef: 'selected' };
		addNode(b, select);
		const run = simulate(b, { actions: [{ nodeId: select.id, type: 'invented', expectError: true }] });
		expect(run.ok).toBe(true);
		expect(run.state.selected).toBeUndefined();
	});
});
