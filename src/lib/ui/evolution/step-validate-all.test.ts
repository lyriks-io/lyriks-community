import { describe, expect, it } from 'vitest';
import { stepValidateTip, waitingCount } from './step-validate-all';

describe("a step's Validate all says what it validates", () => {
	it('names the sections of a step of prose', () => {
		expect(stepValidateTip('Briefing', [{ count: 3, one: 'section' }])).toBe('Validate in your name the 3 sections of the Briefing still waiting on you, in one go');
		expect(stepValidateTip('Solution', [{ count: 1, one: 'section' }])).toBe('Validate in your name the 1 section of the Solution still waiting on you, in one go');
	});

	it('lists every kind of element of the Specification, the journey as the one there is, and leaves out what waits on nobody', () => {
		const parts = [
			{ count: 2, one: 'feature' },
			{ count: 0, one: 'action' },
			{ count: 1, one: 'journey', definite: true },
			{ count: 3, one: 'path' }
		];
		expect(stepValidateTip('Specification', parts)).toBe('Validate in your name 2 features, the journey and 3 paths of the Specification still waiting on you, in one go');
		expect(waitingCount(parts)).toBe(6);
	});
});
