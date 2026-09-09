import { describe, it, expect } from 'vitest';
import {
	FEEDBACK_EMAIL,
	FEEDBACK_INVITE_AFTER_USAGE_MS,
	FEEDBACK_INVITE_EVERY_MS,
	FEEDBACK_INVITE_SNOOZE_AFTER_SENT_MS,
	MAX_FEEDBACK_ITEMS,
	feedbackInviteDue,
	feedbackItems,
	feedbackMailto,
	feedbackReport,
	feedbackSendable,
	feedbackSubject,
	type FeedbackContext,
	type FeedbackDraft
} from './feedback';

const draft: FeedbackDraft = {
	items: [
		{
			category: 'bug',
			message: 'The save bar overlaps the footer\nSteps: open a project, scroll down.'
		}
	],
	rating: '',
	contactEmail: 'ada@example.com'
};

const many: FeedbackDraft = {
	...draft,
	items: [
		{ category: 'bug', message: 'The save bar overlaps the footer' },
		{ category: 'idea', message: 'Let me duplicate a screen' },
		{ category: 'other', message: '' }
	]
};

const context: FeedbackContext = {
	edition: 'Community',
	versions: 'Platform: 0.9.9\nBack: not configured',
	license: 'Licence: get_ab12 (community, 1 seat, active)',
	install: 'LYR-INST-1234'
};

describe('feedbackItems', () => {
	it('trims, drops the blank rows the dialog always shows, and bounds the list', () => {
		expect(feedbackItems(many)).toEqual([
			{ category: 'bug', message: 'The save bar overlaps the footer' },
			{ category: 'idea', message: 'Let me duplicate a screen' }
		]);
		const flood = {
			...draft,
			items: Array.from({ length: MAX_FEEDBACK_ITEMS + 5 }, () => ({
				category: 'idea' as const,
				message: ' one more '
			}))
		};
		expect(feedbackItems(flood)).toHaveLength(MAX_FEEDBACK_ITEMS);
		expect(feedbackItems(flood)[0].message).toBe('one more');
	});
});

describe('feedbackReport', () => {
	it('carries the message, then the install facts behind a separator', () => {
		const report = feedbackReport(draft, context);
		expect(report).toContain('Lyriks feedback · Bug');
		expect(report).toContain('The save bar overlaps the footer');
		expect(report).toContain('--\nEdition: Community');
		expect(report).toContain('Platform: 0.9.9');
		expect(report).toContain('Licence: get_ab12 (community, 1 seat, active)');
		expect(report).toContain('Install: LYR-INST-1234');
	});

	it('numbers a list and names each item type', () => {
		const report = feedbackReport(many, null);
		expect(report).toContain('Lyriks feedback · 2 items');
		expect(report).toContain('1. [Bug] The save bar overlaps the footer');
		expect(report).toContain('2. [Idea] Let me duplicate a screen');
	});

	it('keeps the continuation lines of an item under its number', () => {
		const report = feedbackReport(
			{ ...many, items: [...many.items, { category: 'bug', message: 'first\nsecond' }] },
			null
		);
		expect(report).toContain('3. [Bug] first\n   second');
	});

	it('omits the whole context block when nothing is attached', () => {
		const report = feedbackReport(draft, null);
		expect(report).not.toContain('Edition:');
		expect(report).not.toContain('--');
	});

	it('carries a rating, and stands alone without any item', () => {
		const rated = { ...draft, rating: 'bad' as const, items: [] };
		const report = feedbackReport(rated, null);
		expect(report).toContain('Rating: Bad');
		expect(feedbackSubject(rated)).toBe('[Lyriks feedback] Rated bad');
	});
});

describe('feedbackSendable', () => {
	it('accepts a written item, a rating, or both; refuses neither', () => {
		expect(feedbackSendable(draft)).toBe(true);
		expect(feedbackSendable({ ...draft, items: [], rating: 'good' })).toBe(true);
		expect(feedbackSendable({ ...draft, items: [{ category: 'bug', message: '   ' }], rating: '' })).toBe(
			false
		);
	});
});

describe('feedbackSubject', () => {
	it('titles with the item type and its first line', () => {
		expect(feedbackSubject(draft)).toBe('[Lyriks Bug] The save bar overlaps the footer');
	});

	it('counts the items when there are several', () => {
		expect(feedbackSubject(many)).toBe('[Lyriks feedback] 2 items');
	});

	it('bounds a long first line', () => {
		const long = { ...draft, items: [{ category: 'bug' as const, message: 'x'.repeat(200) }] };
		expect(feedbackSubject(long).length).toBeLessThan(80);
	});

	it('stays a valid subject for an empty draft', () => {
		expect(feedbackSubject({ ...draft, items: [] })).toBe('[Lyriks feedback]');
	});
});

describe('feedbackInviteDue', () => {
	const now = 1_000_000_000_000;
	const ready = {
		usageMs: FEEDBACK_INVITE_AFTER_USAGE_MS,
		invitedAt: null,
		sentAt: null,
		muted: false
	};

	it('waits for real cumulative usage', () => {
		expect(feedbackInviteDue({ ...ready, usageMs: FEEDBACK_INVITE_AFTER_USAGE_MS - 1 }, now)).toBe(false);
		expect(feedbackInviteDue(ready, now)).toBe(true);
	});

	it('never fires when muted', () => {
		expect(feedbackInviteDue({ ...ready, muted: true }, now)).toBe(false);
	});

	it('fires at most once per week', () => {
		expect(feedbackInviteDue({ ...ready, invitedAt: now - FEEDBACK_INVITE_EVERY_MS + 1 }, now)).toBe(false);
		expect(feedbackInviteDue({ ...ready, invitedAt: now - FEEDBACK_INVITE_EVERY_MS }, now)).toBe(true);
	});

	it('stays quiet after the user actually sent feedback', () => {
		expect(
			feedbackInviteDue({ ...ready, sentAt: now - FEEDBACK_INVITE_SNOOZE_AFTER_SENT_MS + 1 }, now)
		).toBe(false);
		expect(feedbackInviteDue({ ...ready, sentAt: now - FEEDBACK_INVITE_SNOOZE_AFTER_SENT_MS }, now)).toBe(true);
	});
});

describe('feedbackMailto', () => {
	it('targets the team address with an encoded subject and body', () => {
		const url = feedbackMailto(draft, context);
		expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=`)).toBe(true);
		expect(url).toContain(encodeURIComponent('The save bar overlaps the footer'));
		expect(url).toContain(encodeURIComponent('Edition: Community'));
		// Raw newlines would truncate the body in some clients; they must be encoded.
		expect(url).not.toContain('\n');
	});
});
