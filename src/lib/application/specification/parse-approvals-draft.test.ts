import { describe, expect, it } from 'vitest';
import { createEmptyApprovalsDraft, stampDecisions } from '$domain/approvals';
import { parseApprovalsDraft, parseStoredApprovalsDraft } from './parse-approvals-draft';

const stored = {
	items: [
		{
			id: 'a1',
			title: 'Sign off the data model',
			area: 'Infrastructure & Data',
			reviewer: 'Lea',
			status: 'approved',
			deadline: '',
			note: '',
			decidedBy: { id: 'u-1', name: 'Lea Martin' },
			decidedAt: '2026-11-17T10:00:00.000Z'
		}
	]
};

describe('a sign-off keeps who set its status and when [criterion:f89af5b5]', () => {
	it('reads the stamps the server stored back from storage', () => {
		const [item] = parseStoredApprovalsDraft(stored, 'p1').items;
		expect(item.decidedBy).toEqual({ id: 'u-1', name: 'Lea Martin' });
		expect(item.decidedAt).toBe('2026-11-17T10:00:00.000Z');
	});

	it('never takes them from a worklist a caller sends [criterion:1f20ef7c]', () => {
		const [item] = parseApprovalsDraft(stored, 'p1').items;
		expect(item.decidedBy).toBeNull();
		expect(item.decidedAt).toBeNull();
	});

	it('keeps the stored stamp of a row the next save does not move', () => {
		const previous = parseStoredApprovalsDraft(stored, 'p1');
		const sent = parseApprovalsDraft({ items: [{ ...stored.items[0], note: 'Read again' }] }, 'p1');
		const [item] = stampDecisions(previous.items, sent.items, { id: 'u-2', name: 'Sam' }, '2026-11-17T12:00:00.000Z');
		expect(item.decidedBy).toEqual({ id: 'u-1', name: 'Lea Martin' });
		expect(item.decidedAt).toBe('2026-11-17T10:00:00.000Z');
	});

	it('drops a malformed stored stamp instead of showing it', () => {
		const [item] = parseStoredApprovalsDraft({ items: [{ ...stored.items[0], decidedBy: { name: 'No id' }, decidedAt: 42 }] }, 'p1').items;
		expect(item.decidedBy).toBeNull();
		expect(item.decidedAt).toBeNull();
	});
});

describe('the Approvals gate on a worklist a caller sends', () => {
	it('reads anything but an object as an empty worklist for the project', () => {
		for (const input of [null, 'items', 3]) expect(parseApprovalsDraft(input, 'p1')).toEqual(createEmptyApprovalsDraft('p1'));
	});

	it('drops a row without an id or repeating one, and keeps the first', () => {
		const { items } = parseApprovalsDraft({ items: [{ title: 'No id' }, { id: '', title: 'Empty id' }, { id: 'a1', title: 'First' }, { id: 'a1', title: 'Again' }, 'a2'] }, 'p1');
		expect(items.map((i) => [i.id, i.title])).toEqual([['a1', 'First']]);
	});

	it('reads an unknown status as a draft and a row with no area as about the whole specification', () => {
		const [item] = parseApprovalsDraft({ items: [{ id: 'a1', status: 'signed', area: 4 }] }, 'p1').items;
		expect(item.status).toBe('draft');
		expect(item.area).toBe('Whole specification');
		expect(parseApprovalsDraft({ items: [{ id: 'a1', status: 'changes_requested' }] }, 'p1').items[0].status).toBe('changes_requested');
	});
});
