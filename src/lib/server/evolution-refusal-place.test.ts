import { describe, expect, it } from 'vitest';
import { refusalPlace } from './evolution-operations.server';

/** A refused operation a person resolves names the place where they resolve it. */
describe('the place a refusal sends a person to', () => {
	it('is the proposal, the line or the remark the operation named', () => {
		expect(refusalPlace({ proposalId: 'p1' }, 'decide_proposal')).toEqual({ kind: 'proposal', id: 'p1' });
		expect(refusalPlace({ lineId: 'l1' }, 'decide_line')).toEqual({ kind: 'line', id: 'l1' });
		expect(refusalPlace({ observationId: 'o1' }, 'rule_observation')).toEqual({ kind: 'observation', id: 'o1' });
	});

	it('is the next gate for a crossing, a waiver or a rebrief', () => {
		for (const name of ['cross_stage', 'lift_waiver', 'rebrief', 'close_request']) {
			expect(refusalPlace({}, name)).toEqual({ kind: 'next-step' });
		}
	});

	it('is the request itself when the operation names no place', () => {
		expect(refusalPlace({ title: 'x' }, 'update_request')).toBeUndefined();
	});
});
