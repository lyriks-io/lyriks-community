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

	it('puts a case on the feature it tests, and clears the feature a case left', () => {
		const draft = createEmptyRulesDraft('p1');
		draft.scenarios = [
			createEdgeCase({ id: 'e1', title: 'On a feature', relatedFeatureId: 'feat-a' }),
			createEdgeCase({ id: 'e2', title: 'Product-wide' })
		];
		const ops = rulesAcceptanceOps('p1', draft, ['feat-b']);
		const rowsOf = (featureId: string) => {
			const op = ops.find((o) => o.kind === 'mirrorFeatureAcceptance' && o.featureId === featureId);
			if (!op || op.kind !== 'mirrorFeatureAcceptance') throw new Error(`no op for ${featureId}`);
			return op.acceptanceCriteria.map((c) => (c as { id: string }).id);
		};
		expect(rowsOf('feat-a')).toEqual(['ac-edge-e1']);
		expect(rowsOf('p1__experience')).toEqual(['ac-edge-e2']);
		expect(rowsOf('feat-b')).toEqual([]);
	});

	it('omits relatedSurfaceId when the edge case names no journey', () => {
		const op = opFor([createEdgeCase({ id: 'e2', title: 'Y', relatedJourneyId: null })]);
		expect('relatedSurfaceId' in (op.acceptanceCriteria[0] as object)).toBe(false);
	});
});
