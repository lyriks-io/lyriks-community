import { describe, it, expect } from 'vitest';
import { createEmptyRulesDraft, createEdgeCase } from '$domain/rules';
import { rulesAcceptanceOps } from './rules-projection';

function opFor(edges: ReturnType<typeof createEdgeCase>[]) {
	const draft = createEmptyRulesDraft('p1');
	draft.scenarios = edges;
	const [op] = rulesAcceptanceOps('p1', draft);
	if (op.kind !== 'mirrorFeatureAcceptance') throw new Error('unreachable');
	return op;
}

describe('rulesAcceptanceOps', () => {
	it('targets the Experience feature and is always emitted (even with no edge cases)', () => {
		const op = opFor([]);
		expect(op.featureId).toBe('p1__experience');
		expect(op.acceptanceCriteria).toEqual([]);
	});

	it('maps the Rules "error" outcome to unspa "failure"', () => {
		const op = opFor([createEdgeCase({ id: 'e1', title: 'X', expectedOutcome: 'error' })]);
		expect(op.acceptanceCriteria[0]).toMatchObject({ id: 'ac-edge-e1', expectedOutcome: 'failure' });
	});

	it('omits relatedSurfaceId when the edge case names no journey', () => {
		const op = opFor([createEdgeCase({ id: 'e2', title: 'Y', relatedJourneyId: null })]);
		expect('relatedSurfaceId' in (op.acceptanceCriteria[0] as object)).toBe(false);
	});
});
