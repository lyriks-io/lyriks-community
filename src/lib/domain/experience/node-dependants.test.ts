import { describe, expect, it } from 'vitest';
import {
	createElementNode,
	createGroupNode,
	emptyBuilder,
	ensureScreenRoot,
	fieldStatePath,
	type BuilderElementNode
} from './builder';
import { nodeDeletionImpact } from './node-dependants';

function scene() {
	const b = emptyBuilder();
	const loginRoot = ensureScreenRoot(b, 'scr-login');
	const homeRoot = ensureScreenRoot(b, 'scr-home');
	const row = createGroupNode('scr-login', loginRoot, 'Row');
	b.nodes[row.id] = row;
	(b.nodes[loginRoot] as { childIds: string[] }).childIds.push(row.id);
	const email = createElementNode('scr-login', row.id, 'input');
	email.label = 'Email';
	email.wiring.binding = { targetKind: 'state', targetRef: 'form.email' };
	b.nodes[email.id] = email;
	row.childIds.push(email.id);
	const submit = createElementNode('scr-login', loginRoot, 'button');
	submit.label = 'Sign in';
	submit.wiring.transitions = [
		{ id: 't1', trigger: 'click', effect: { kind: 'navigate', target: 'scr-home' }, when: { path: 'form.email', op: 'truthy' } }
	];
	b.nodes[submit.id] = submit;
	(b.nodes[loginRoot] as { childIds: string[] }).childIds.push(submit.id);
	const greeting = createElementNode('scr-home', homeRoot, 'text');
	greeting.label = 'Welcome {form.email}';
	b.nodes[greeting.id] = greeting;
	(b.nodes[homeRoot] as { childIds: string[] }).childIds.push(greeting.id);
	const lone = createElementNode('scr-home', homeRoot, 'text');
	lone.label = 'Nothing reads me';
	b.nodes[lone.id] = lone;
	(b.nodes[homeRoot] as { childIds: string[] }).childIds.push(lone.id);
	b.stateSeeds = [{ path: 'form.email', value: '' }];
	return { b, row, email, submit, greeting, lone };
}

describe('what breaks when a node is deleted', () => {
	it('names every reader of the path the node provides, and which ones sit on another screen', () => {
		const { b, email, submit, greeting } = scene();
		const impact = nodeDeletionImpact(b, email.id);
		expect(impact.providedPaths).toEqual(['form.email']);
		expect(impact.dependants.map((d) => [d.nodeId, d.kind, d.offSurface])).toEqual([
			[submit.id, 'guard', false],
			[greeting.id, 'label', true],
			['', 'seed', false]
		]);
		expect(impact.offSurfaceDependants.map((d) => d.label)).toEqual(['Welcome {form.email}']);
	});

	it('walks the whole subtree: deleting the row that holds the input breaks the same readers', () => {
		const { b, row, email } = scene();
		const impact = nodeDeletionImpact(b, row.id);
		expect(impact.removedNodeIds).toEqual([row.id, email.id]);
		expect(impact.dependants).toHaveLength(3);
	});

	it('is silent for a node nothing depends on', () => {
		const { b, lone } = scene();
		expect(nodeDeletionImpact(b, lone.id).dependants).toEqual([]);
	});

	it('treats a synthetic field path as provided too', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 's1');
		const input = createElementNode('s1', root, 'input') as BuilderElementNode;
		b.nodes[input.id] = input;
		const btn = createElementNode('s1', root, 'button');
		btn.wiring.visibleWhen = { path: fieldStatePath(input), op: 'truthy' };
		b.nodes[btn.id] = btn;
		const impact = nodeDeletionImpact(b, input.id);
		expect(impact.dependants.map((d) => d.kind)).toEqual(['visibility']);
	});
});
