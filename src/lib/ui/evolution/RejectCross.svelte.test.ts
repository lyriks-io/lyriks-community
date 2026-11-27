import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RejectCross from './RejectCross.svelte';

/** The cross that refuses an item of a request, and once refused restores it (criteria 7c214ba8, 916e2ee4). */
const body = (props: Record<string, unknown>) => render(RejectCross, { props: { name: 'Pay an invoice', title: 'Not wanted: take it out of the request', onclick: () => {}, ...props } as never }).body;

describe('the cross refuses, filled once refused [criterion:7c214ba8] [criterion:916e2ee4]', () => {
	it('is offered as a button named Reject <name>, with no word', () => {
		const html = body({});
		expect(html).toMatch(/<button[^>]*aria-label="Reject Pay an invoice"[^>]*title="Not wanted: take it out of the request"[^>]*data-reject-state="offered"/);
		expect(html).not.toMatch(/>\s*Reject\s*</);
	});

	it('restores from the filled cross, named Restore <name>', () => {
		expect(body({ rejected: true, restoreTitle: 'Restore this element' })).toMatch(/<button[^>]*aria-label="Restore Pay an invoice"[^>]*title="Restore this element"[^>]*data-reject-state="rejected"/);
	});

	it('reads only, filled, where the item cannot be restored', () => {
		const html = body({ rejected: true });
		expect(html).not.toContain('<button');
		expect(html).toContain('aria-label="Rejected: Pay an invoice"');
	});
});
