import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { DriftChangeView } from '$lib/shared/code-drift-page';
import DriftChangeCard from './DriftChangeCard.svelte';
import { DriftReview } from './drift-review.svelte';

const change = (over: Partial<DriftChangeView> = {}): DriftChangeView => ({
	key: 'f1|a1|rule:r1',
	featureId: 'f1',
	featureName: 'Ordering',
	coreName: 'Shop',
	elementId: 'rule:f1:r1',
	elementName: 'No order after 6 pm',
	actionId: 'a1',
	type: 'Rule changed',
	shift: 'changed',
	title: 'A rule of “Place an order” changed in the code',
	where: 'src/orders.js:17',
	what: 'The code of “No order after 6 pm” changed.',
	specText: 'When the customer asks to place an order, if the hour is 18 or later, then the system shall refuse it.',
	snippet: "if (hour >= 20) return refused('Closed');",
	prompt: 'Restore the previous behaviour of “No order after 6 pm”.',
	impact: { risk: 'high', summary: 'A guard reads differently in the code.', rows: [{ key: 'feature', value: 'Ordering' }] },
	decision: null,
	...over
});
const review = (c: DriftChangeView, canWrite = true) => new DriftReview(() => ({ projectId: 'p1', canWrite, me: 'You', changes: [c] }));
const view = (c: DriftChangeView, canWrite = true, readerName: string | null = null) => render(DriftChangeCard, { props: { projectId: 'p1', change: c, review: review(c, canWrite), readerName } }).body;
/** The reader's own box that accepts, the cross that rejects (criterion c53c0474). */
const OWN_BOX = /<button[^>]*title="You · click to accept"[^>]*data-own-box/;
const CROSS = /<button[^>]*aria-label="Reject [^"]*"[^>]*title="Reject it and restore the previous behaviour"[^>]*aria-expanded="false"/;

describe('a code change on the Code drift page [criterion:4903ceb0]', () => {
	it('shows its type, where it belongs and where the code is, the spec beside the code', () => {
		const body = view(change());
		expect(body).toContain('Rule changed');
		expect(body).toContain('Shop › Ordering');
		expect(body).toContain('src/orders.js:17');
		expect(body).toContain('In the spec');
		expect(body).toContain('In the code now');
		expect(body).toContain('if (hour >= 20) return refused(');
		expect(body).toContain('href="/projects/p1/spec/features/f1');
		expect(body).not.toMatch(/Commit /);
	});
});

describe('the decisions on a code change [criterion:53e7e3da]', () => {
	it('offers the impact, then the cross and the reader\'s box while it waits [criterion:c53c0474]', () => {
		const body = view(change());
		expect(body).toMatch(/>Impact analysis</);
		expect(body).toMatch(CROSS);
		expect(body).toMatch(OWN_BOX);
		expect(body.search(CROSS)).toBeLessThan(body.search(OWN_BOX));
		expect(body).not.toMatch(/>Accept the code change</);
		expect(body).not.toMatch(/>Reject and restore…</);
	});

	it('reads accepted with the version it captured, rejected as waiting for the code to follow [criterion:857f69d4]', () => {
		const kept = view(change({ decision: { decision: 'kept', by: 'Ana P.', at: new Date().toISOString(), version: 'v1.1' } }));
		expect(kept).toContain('Accepted');
		expect(kept).toContain('Accepted as it is in the code (version v1.1 captured)');
		expect(kept).toContain("The spec's words are unchanged.");
		// Undone from the green box of who accepted it (criterion 857f69d4).
		expect(kept).toMatch(/<button[^>]*title="Ana P\. accepted this · click to take it back"[^>]*data-own-box/);
		expect(kept).not.toMatch(/>Undo</);
		expect(view(change({ decision: { decision: 'kept', by: 'Ana P.', at: new Date().toISOString(), version: 'v1.1' } }), true, 'Ana P.')).toContain('>YOU<');
		const back = view(change({ decision: { decision: 'sent_back', by: 'Ana P.', at: new Date().toISOString(), version: null } }));
		expect(back).toContain('Rejected · restore requested');
		expect(back).toContain('Waiting for the code to follow the spec');
		expect(back).toMatch(/>Show the brief</);
		expect(back).toMatch(/<button[^>]*aria-label="Undo the rejection of [^"]*"[^>]*title="Undo: the change reads to review again"[^>]*data-reject-state="rejected"/);
	});

	it('shows a reader the changes without the decisions [criterion:e40e0788]', () => {
		const body = view(change(), false);
		expect(body).not.toMatch(/>Accept the code change</);
		expect(body).toContain('A project editor accepts or rejects it.');
		const decided = view(change({ decision: { decision: 'sent_back', by: 'Ana P.', at: new Date().toISOString(), version: null } }), false);
		expect(decided).not.toMatch(/>Undo</);
		expect(body).not.toMatch(OWN_BOX);
		expect(decided).not.toMatch(/<button[^>]*data-reject-state/);
	});
});
