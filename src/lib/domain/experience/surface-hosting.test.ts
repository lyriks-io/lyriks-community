import { describe, it, expect } from 'vitest';
import { emptyBuilder, ensureScreenRoot, createElementNode, createGroupNode, addNode } from './builder';
import { hostedSurfacesResolver } from './surface-hosting';

describe('hostedSurfacesResolver', () => {
	it('hosts a component embedded via a group', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const group = createGroupNode('scr', root);
		group.componentId = 'cmp-nav';
		addNode(b, group);

		expect([...hostedSurfacesResolver(b.nodes)('scr')]).toContain('cmp-nav');
	});

	it('hosts a list row-template component so nav authored inside it counts', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const list = createElementNode('scr', root, 'list');
		list.componentId = 'cmp-row'; // the row template — an "Open" link lives inside it
		addNode(b, list);

		const hosted = hostedSurfacesResolver(b.nodes)('scr');
		expect([...hosted]).toContain('cmp-row');
	});
});
