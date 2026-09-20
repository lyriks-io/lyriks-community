import { describe, it, expect } from 'vitest';
import { nodeId } from './graph';
import type { GraphNode } from './graph';
import { nodeSourceHref, rawNodeId } from './node-link';

/**
 * Kernel behavior nodes carry a `beh:` namespace and, below the feature, a
 * composite `<featureId>:<localId>`. A field report claimed the deep link
 * anchored on the literal string "beh"; these lock in what it actually does, so
 * the next reader does not have to rebuild the chain by hand.
 */
function behaviorNode(kind: GraphNode['kind'], rawId: string): GraphNode {
	return { id: nodeId(kind, rawId), kind, context: 'behavior', label: 'x' };
}

describe('deep links to kernel behavior nodes', () => {
	it('strips the kernel namespace from the raw id', () => {
		expect(rawNodeId(behaviorNode('feature', 'beh:feat-ecology'))).toBe('feat-ecology');
		expect(rawNodeId(behaviorNode('rule', 'beh:feat-ecology:6ef8edbf'))).toBe('feat-ecology:6ef8edbf');
	});

	it('anchors a feature on itself', () => {
		expect(nodeSourceHref('p1', behaviorNode('feature', 'beh:feat-ecology'))).toBe(
			'/projects/p1/features?tab=behavior&node=feat-ecology'
		);
	});

	it('anchors depth below a feature on the card that owns it, never on the namespace', () => {
		for (const kind of ['rule', 'scenario', 'criterion', 'constant'] as const) {
			const href = nodeSourceHref('p1', behaviorNode(kind, `beh:feat-ecology:local1`));
			expect(href).toBe('/projects/p1/features?tab=behavior&node=feat-ecology');
			expect(href).not.toContain('node=beh');
		}
	});
});
