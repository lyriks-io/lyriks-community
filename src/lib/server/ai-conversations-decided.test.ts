import { describe, expect, it } from 'vitest';
import { decidedNote } from './ai-conversations.server';

const proposal = { summary: 'The freeze waits for the deployment branch', featureId: 'feat-31' };

describe('the AI in session learns at once that its change was validated or rejected [criterion:0b6441f6]', () => {
	it('a validated change: written, and the AI carries on with the code and the index', () => {
		expect(decidedNote(proposal, 'applied')).toBe(
			'The person validated your change "The freeze waits for the deployment branch": Lyriks wrote it on feat-31. Carry on from it: the code, then the index.'
		);
	});

	it('a rejected change: nothing written, and the AI asks one question on what to change', () => {
		expect(decidedNote(proposal, 'rejected')).toBe(
			'The person rejected your change "The freeze waits for the deployment branch": nothing was written. Ask them, in one question, what to change.'
		);
	});
});
