import { describe, expect, it } from 'vitest';
import { createApprovalItem, type ApprovalItem } from './draft';
import { settledByWrite, stampDecisions } from './sign-off';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const item = (id: string, status: ApprovalItem['status'], rest: Partial<ApprovalItem> = {}) => createApprovalItem({ id, status, ...rest });

describe('what only a person may settle [criterion:8f3053e9]', () => {
	it('names an approval moved to Approved or Accepted risk, or added with one of them', () => {
		const stored = [item('a', 'in_review'), item('b', 'in_review')];
		const sent = [item('a', 'approved'), item('b', 'accepted_risk'), item('c', 'approved')];
		expect(settledByWrite(stored, sent).map((i) => i.id)).toEqual(['a', 'b', 'c']);
	});

	it('leaves out an approval a person settled and sent back unchanged, and one filed In review', () => {
		const stored = [item('a', 'approved')];
		expect(settledByWrite(stored, [item('a', 'approved'), item('b', 'in_review')])).toEqual([]);
	});
});

describe('who signed off what, and when [criterion:f89af5b5]', () => {
	it('stamps the person and the time of the write on a status that moved, never the stamp sent', () => {
		const stored = [item('a', 'in_review', { decidedBy: bob, decidedAt: '2026-11-01T00:00:00.000Z' })];
		const sent = [item('a', 'approved', { decidedBy: { id: 'forged', name: 'Forged' }, decidedAt: '1999-01-01T00:00:00.000Z' })];
		expect(stampDecisions(stored, sent, ana, '2026-11-17T03:00:00.000Z')[0]).toMatchObject({ status: 'approved', decidedBy: ana, decidedAt: '2026-11-17T03:00:00.000Z' });
	});

	it('keeps the stored stamp while the status stays, whatever the caller sent', () => {
		const stored = [item('a', 'approved', { decidedBy: bob, decidedAt: '2026-11-01T00:00:00.000Z' })];
		const sent = [item('a', 'approved', { title: 'Renamed', decidedBy: ana, decidedAt: '2026-11-17T03:00:00.000Z' })];
		expect(stampDecisions(stored, sent, ana, '2026-11-17T03:00:00.000Z')[0]).toMatchObject({ title: 'Renamed', decidedBy: bob, decidedAt: '2026-11-01T00:00:00.000Z' });
	});

	it('stamps a new approval filed past Draft, not a new Draft', () => {
		const [filed, draft] = stampDecisions([], [item('a', 'in_review'), item('b', 'draft')], ana, 'now');
		expect(filed).toMatchObject({ decidedBy: ana, decidedAt: 'now' });
		expect(draft).toMatchObject({ decidedBy: null, decidedAt: null });
	});
});
