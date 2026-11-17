import { describe, expect, it } from 'vitest';
import { driftBandOf } from './drift-band';

describe('the band above the Specification 360° pages [criterion:7b21b4a6]', () => {
	it('counts the changes still to review, in the singular for one', () => {
		expect(driftBandOf([null, 'kept', null, 'sent_back'])).toEqual({
			title: '2 code changes are not in the spec',
			lead: 'Made outside Knowledge and Changes. Review them.',
			go: 'Review'
		});
		expect(driftBandOf([null])?.title).toBe('1 code change is not in the spec');
	});

	it('keeps the rejected ones in sight once none is left to review', () => {
		expect(driftBandOf(['kept', 'sent_back'])?.title).toBe('1 rejected code change waits for the code to follow the spec');
		expect(driftBandOf(['sent_back', 'sent_back'])?.title).toBe('2 rejected code changes wait for the code to follow the spec');
	});

	it('shows nothing once every change is accepted, or when none was found', () => {
		expect(driftBandOf(['kept', 'kept'])).toBeNull();
		expect(driftBandOf([])).toBeNull();
	});
});

describe('the band counts the changes made in the spec by hand [criterion:68b978c4]', () => {
	it('names them beside the code changes to review', () => {
		expect(driftBandOf([null], { toReview: 2, kept: 0 })?.lead).toBe('Made outside Knowledge and Changes. Review them. 2 changes made in the spec by hand are to review.');
	});

	it('leads with them when no code change waits', () => {
		expect(driftBandOf(['kept'], { toReview: 1, kept: 0 })).toEqual({
			title: '1 change made in the spec by hand is to review',
			lead: 'The next Reverse-Specification reads the code against each one; it is decided then.',
			go: 'Review'
		});
	});

	it('keeps the kept edits in sight until the code follows them [criterion:fea8666f]', () => {
		expect(driftBandOf([], { toReview: 0, kept: 2 })?.title).toBe('2 kept changes of the spec wait for the code to follow them');
		expect(driftBandOf(['sent_back'], { toReview: 0, kept: 1 })?.lead).toBe(
			'A restore was requested: each one leaves once the code reads as the spec again. 1 kept change of the spec waits for the code to follow it.'
		);
	});
});
