import { describe, it, expect } from 'vitest';
import {
	FEEDBACK_EMAIL,
	FEEDBACK_INVITE_AFTER_USAGE_MS,
	FEEDBACK_INVITE_EVERY_MS,
	FEEDBACK_INVITE_SNOOZE_AFTER_SENT_MS,
	FEEDBACK_RATINGS,
	MAX_FEEDBACK_ITEMS,
	feedbackInviteDue,
	feedbackItems,
	feedbackMailto,
	feedbackReport,
	feedbackSendable,
	feedbackSubject,
	notesAfterEdit,
	type FeedbackContext,
	type FeedbackDraft
} from './feedback';

const draft: FeedbackDraft = {
	items: [
		{
			message: 'The save bar overlaps the footer\nSteps: open a project, scroll down.'
		}
	],
	rating: '',
	contactEmail: 'ada@example.com'
};

const many: FeedbackDraft = {
	...draft,
	items: [
		{ message: 'The save bar overlaps the footer' },
		{ message: 'Let me duplicate a screen' },
		{ message: '' }
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
			{ message: 'The save bar overlaps the footer' },
			{ message: 'Let me duplicate a screen' }
		]);
		const flood = {
			...draft,
			items: Array.from({ length: MAX_FEEDBACK_ITEMS + 5 }, () => ({
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
		expect(report.split('\n')[0]).toBe('Lyriks feedback');
		expect(report).toContain('The save bar overlaps the footer');
		expect(report).toContain('--\nEdition: Community');
		expect(report).toContain('Platform: 0.9.9');
		expect(report).toContain('Licence: get_ab12 (community, 1 seat, active)');
		expect(report).toContain('Install: LYR-INST-1234');
	});

	it('numbers a list, each item its own line with no kind beside it [criterion:3dc73755]', () => {
		const report = feedbackReport(many, null);
		expect(report).toContain('Lyriks feedback · 2 items');
		expect(report).toContain('1. The save bar overlaps the footer');
		expect(report).toContain('2. Let me duplicate a screen');
		expect(report).not.toMatch(/\[(Bug|Idea|Other)\]/);
	});

	it('keeps the continuation lines of an item under its number', () => {
		const report = feedbackReport(
			{ ...many, items: [...many.items, { message: 'first\nsecond' }] },
			null
		);
		expect(report).toContain('3. first\n   second');
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

describe('the rating [criterion:c583b8d4]', () => {
	it('reads Bad, Okay, Good from left to right', () => {
		expect(FEEDBACK_RATINGS.map((r) => r.label)).toEqual(['Bad', 'Okay', 'Good']);
	});
});

describe('the notes list grows as it is written [criterion:c583b8d4]', () => {
	let made = 0;
	const row = (message = '') => ({ id: `r${++made}`, message });
	const newRow = () => row();

	it('brings the next empty row under the empty row once it is written in', () => {
		const rows = [row('The save bar overlaps the footer')];
		const next = notesAfterEdit(rows, 0, newRow);
		expect(next.map((r) => r.message)).toEqual(['The save bar overlaps the footer', '']);
		expect(next[0]).toBe(rows[0]);
	});

	it('adds nothing while the edited row is not the last, or is still blank', () => {
		const rows = [row('one'), row('two'), row()];
		expect(notesAfterEdit(rows, 0, newRow)).toBe(rows);
		expect(notesAfterEdit([row('   ')], 0, newRow)).toHaveLength(1);
	});

	it('takes the extra empty row back when the row above it is emptied again', () => {
		const rows = [row('one'), row(''), row()];
		const next = notesAfterEdit(rows, 1, newRow);
		expect(next).toEqual([rows[0], rows[1]]);
	});

	it('never removes the row being written in', () => {
		// A blank in the middle stays; emptying the row before the last only drops the last.
		const rows = [row('one'), row(''), row(''), row()];
		expect(notesAfterEdit(rows, 2, newRow)).toEqual(rows.slice(0, 3));
		expect(notesAfterEdit(rows, 1, newRow)).toBe(rows);
	});

	it('stops at the most one message can carry', () => {
		const full = Array.from({ length: MAX_FEEDBACK_ITEMS }, (_, i) => row(`note ${i}`));
		expect(notesAfterEdit(full, MAX_FEEDBACK_ITEMS - 1, newRow)).toBe(full);
	});
});

describe('feedbackSendable', () => {
	it('accepts a written item, a rating, or both; refuses neither', () => {
		expect(feedbackSendable(draft)).toBe(true);
		expect(feedbackSendable({ ...draft, items: [], rating: 'good' })).toBe(true);
		expect(feedbackSendable({ ...draft, items: [{ message: '   ' }], rating: '' })).toBe(
			false
		);
	});
});

describe('feedbackSubject', () => {
	it('titles with its first line', () => {
		expect(feedbackSubject(draft)).toBe('[Lyriks feedback] The save bar overlaps the footer');
	});

	it('counts the items when there are several', () => {
		expect(feedbackSubject(many)).toBe('[Lyriks feedback] 2 items');
	});

	it('bounds a long first line', () => {
		const long = { ...draft, items: [{ message: 'x'.repeat(200) }] };
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
