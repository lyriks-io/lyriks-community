import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { ScopeBoundaryView } from '$application/spec360/scope-boundary';
import ScopeDrawer from './ScopeDrawer.svelte';

const app = 'Outside the application-only specification requested by the owner.';
const view = (approval: ScopeBoundaryView['approval']): ScopeBoundaryView => ({
	covers: 'The Lyriks application, Community and Enterprise.',
	coveredCount: 109,
	fullProduct: false,
	leftOutCount: 3,
	leftOut: [
		{ name: 'Releasing and distributing', summary: 'building the images, issuing licence keys', sharedReason: app, items: [
			{ id: 'c1', name: 'Issue licence keys', later: false, reason: '' },
			{ id: 'c2', name: 'Prove a release', later: false, reason: '' }
		] },
		{ name: 'Other', summary: '', sharedReason: null, items: [{ id: 'c3', name: 'Voice input', later: true, reason: 'Next release.' }] }
	],
	decision: 'The owner asked to specify the application only.',
	decidedAt: '2026-11-12',
	approval,
	shown: 'fnv1a-1'
});

const drawer = (v: ScopeBoundaryView, canApprove = true) =>
	render(ScopeDrawer, { props: { open: true, onClose: () => {}, view: v, projectId: 'p1', canApprove } }).body;

describe('What is out of scope opens from a discreet link while it waits for approval [criterion:3b04797c]', () => {
	it('reads In scope, then Out of scope by group folded, and the decision with its date', () => {
		const html = drawer(view({ state: 'none', by: '', at: '' }));
		expect(html).toMatch(/<h2[^>]*>(<!--[^>]*-->)?Scope(<!--[^>]*-->)?<\/h2>/);
		expect(html).toContain('The Lyriks application, Community and Enterprise.');
		expect(html).toMatch(/In scope\s*<span[^>]*>109 capabilities<\/span>/);
		expect(html).toMatch(/Out of scope\s*(<!--[^>]*-->)?<span[^>]*>3 capabilities<\/span>/);
		expect(html.indexOf('In scope')).toBeLessThan(html.indexOf('Out of scope'));
		expect(html).toMatch(/<details[^>]*>\s*<summary/);
		expect(html).not.toMatch(/<details[^>]*open/);
		expect(html.match(new RegExp(`Why: ${app}`, 'g'))).toHaveLength(1);
		expect(html).toContain('Next release.');
		expect(html).toContain('Decided Nov 12, 2026:');
		expect(html).not.toContain('<input');
		expect(html).not.toContain('<textarea');
	});
});

describe('A person approves what the spec leaves out, as it stands [criterion:d16b352d]', () => {
	it('offers Approve to a writer while nobody approved the list', () => {
		const html = drawer(view({ state: 'none', by: '', at: '' }));
		expect(html).toContain('Nobody has approved this list yet.');
		expect(html).toMatch(/<button[^>]*>Approve<\/button>/);
	});

	it('reads who approved it and when, with nothing to press', () => {
		const html = drawer(view({ state: 'current', by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z' }));
		expect(html).toContain('Approved by Ann Lee on Nov 25, 2026.');
		expect(html).not.toMatch(/>Approve( again)?<\/button>/);
	});

	it('says the list changed since its approval and offers to approve it again', () => {
		const html = drawer(view({ state: 'changed', by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z' }));
		expect(html).toContain('Changed since Ann Lee approved it on Nov 25, 2026.');
		expect(html).toMatch(/<button[^>]*>Approve again<\/button>/);
	});

	it('gives a reader the line alone', () => {
		const html = drawer(view({ state: 'none', by: '', at: '' }), false);
		expect(html).toContain('Nobody has approved this list yet.');
		expect(html).not.toMatch(/>Approve<\/button>/);
	});
});

describe('Nothing waits for approval, no link [criterion:9424a65d]', () => {
	it('reads a full product, reached by an old address, as having nothing out of scope and nothing to approve', () => {
		const html = drawer({ covers: '', coveredCount: 4, fullProduct: true, leftOut: [], leftOutCount: 0, decision: '', decidedAt: null, approval: null, shown: 'fnv1a-0' });
		expect(html).toContain('Nothing is out of scope.');
		expect(html).not.toContain('Approval');
		expect(html).not.toMatch(/>Approve<\/button>/);
	});
});
