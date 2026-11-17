import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createApprovalItem, createEmptyApprovalsDraft } from '$domain/approvals';
import type { Baseline } from '$domain/baselines';
import { ApprovalsStore } from '$ui/approvals/draft-store.svelte';
import { BaselinesStore } from '$ui/baselines/draft-store.svelte';
import ApprovalsBoard from '$ui/approvals/ApprovalsBoard.svelte';
import BaselinesBoard from '$ui/baselines/BaselinesBoard.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

const session = { isAuthenticated: true } as never;
const notifier = { notify: vi.fn() };
const clean = (html: string) => html.replace(/<!--.*?-->/g, '');

describe('the Approvals tab of Traceability', () => {
	const draft = { ...createEmptyApprovalsDraft('p'), items: [createApprovalItem({ id: 'a', title: 'Scope sign-off', status: 'approved', reviewer: 'Ana', decidedBy: { id: 'ana@acme.io', name: 'Ana P.' }, decidedAt: '2026-11-17T03:40:00.000Z' })] };
	const board = (canWrite: boolean) => clean(render(ApprovalsBoard, { props: { store: new ApprovalsStore(draft, session, notifier), canWrite } }).body);

	it('reads the worklist to a reader without its controls [criterion:af8a9874]', () => {
		const html = board(false);
		expect(html).toContain('Scope sign-off');
		expect(html).not.toContain('Add approval');
		expect(html).not.toContain('<select');
		expect(html).not.toContain('aria-label="Remove approval"');
	});

	it('says who set the status and when, to readers and writers alike [criterion:f89af5b5]', () => {
		expect(board(false)).toContain('Approved by Ana P. · 2026-11-17 03:40');
		expect(board(true)).toContain('Approved by Ana P. · 2026-11-17 03:40');
		expect(board(true)).toContain('Add approval');
	});
});

describe('the Baselines tab of Traceability', () => {
	const baseline = (id: string): Baseline => ({ id, name: `Baseline ${id}`, note: 'Signed', createdAt: '2026-11-01T10:00:00.000Z', readiness: 40, coherence: 80, featureCount: 3, content: '# spec' });
	const current = { readiness: 50, coherence: 90, featureCount: 4 };
	const board = (canWrite: boolean, validationIds: string[] = []) =>
		clean(render(BaselinesBoard, { props: { store: new BaselinesStore({ projectId: 'p', baselines: [baseline('b2'), baseline('b1')], lastSavedAt: null }, session, notifier), current, canWrite, validationIds } }).body);

	it('lets a reader read and export, without capture, fields or crosses [criterion:3ff28fc2]', () => {
		const html = board(false);
		expect(html).not.toContain('Capture a baseline');
		expect(html).not.toContain('aria-label="Delete baseline"');
		expect(html).not.toContain('placeholder="Add a note…"');
		expect(html).toContain('Baseline b2');
		expect(html).toContain('Export');
	});

	it('draws no cross on the baseline the validated specification stands on [criterion:40d632f9]', () => {
		const html = board(true, ['b1']);
		expect(html.match(/aria-label="Delete baseline"/g)).toHaveLength(1);
		expect(html).toContain('The validated specification stands on it');
	});
});
