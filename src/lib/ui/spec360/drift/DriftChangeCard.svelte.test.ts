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
const view = (c: DriftChangeView, canWrite = true) => render(DriftChangeCard, { props: { projectId: 'p1', change: c, review: review(c, canWrite) } }).body;

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
	it('offers the impact, the acceptance and the rejection while it waits', () => {
		const body = view(change());
		expect(body).toMatch(/>Impact analysis</);
		expect(body).toMatch(/>Accept into the spec</);
		expect(body).toMatch(/>Reject and restore…</);
	});

	it('reads accepted with the version it captured, rejected as waiting for the code to follow', () => {
		const kept = view(change({ decision: { decision: 'kept', by: 'Ana P.', at: new Date().toISOString(), version: 'v1.1' } }));
		expect(kept).toContain('Accepted');
		expect(kept).toContain('The spec now follows the code (version v1.1)');
		expect(kept).toMatch(/>Undo</);
		const back = view(change({ decision: { decision: 'sent_back', by: 'Ana P.', at: new Date().toISOString(), version: null } }));
		expect(back).toContain('Rejected · restore requested');
		expect(back).toContain('Waiting for the code to follow the spec');
		expect(back).toMatch(/>Show the brief</);
	});

	it('shows a reader the changes without the decisions', () => {
		const body = view(change(), false);
		expect(body).not.toMatch(/>Accept into the spec</);
		expect(body).toContain('A project editor accepts or rejects it.');
		const decided = view(change({ decision: { decision: 'sent_back', by: 'Ana P.', at: new Date().toISOString(), version: null } }), false);
		expect(decided).not.toMatch(/>Undo</);
	});
});
