import { describe, expect, it, vi } from 'vitest';
import { createApprovalItem, createEmptyApprovalsDraft, type ApprovalItem } from '$domain/approvals';
import { saveApprovals } from './approvals-save.server';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };

function services(stored: ApprovalItem[]) {
	const save = vi.fn(async () => ({ savedAt: 'now', revision: 3 }));
	return { save, services: { loadApprovalsDraft: { execute: async () => ({ ...createEmptyApprovalsDraft('p'), items: stored }) }, saveApprovalsDraft: { execute: save } } as never };
}
const draft = (items: ApprovalItem[]) => ({ ...createEmptyApprovalsDraft('p'), items });
const opts = { expectedRevision: 2, origin: null };

describe('the save door of the approvals worklist', () => {
	it('refuses an AI client that settles an approval itself, and writes nothing [criterion:8f3053e9]', async () => {
		const { services: s, save } = services([createApprovalItem({ id: 'a', status: 'in_review' })]);
		const write = saveApprovals(s, 'p', draft([createApprovalItem({ id: 'a', status: 'accepted_risk' })]), opts, { kind: 'ai_client', decider: async () => ana });
		await expect(write).rejects.toMatchObject({ status: 403, body: { message: 'Only a person signs off an approval: file it In review and ask a person to approve it.' } });
		expect(save).not.toHaveBeenCalled();
	});

	it('lets an AI client file an approval In review, stamped with the person behind it', async () => {
		const { services: s, save } = services([]);
		const answer = await saveApprovals(s, 'p', draft([createApprovalItem({ id: 'a', status: 'in_review' })]), opts, { kind: 'ai_client', decider: async () => ana });
		expect(save).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ id: 'a', decidedBy: ana })] }), opts);
		expect(answer).toMatchObject({ revision: 3, decisions: { a: { decidedBy: ana } } });
	});

	it('records who approved when a person signs off [criterion:f89af5b5]', async () => {
		const { services: s, save } = services([createApprovalItem({ id: 'a', status: 'in_review' })]);
		await saveApprovals(s, 'p', draft([createApprovalItem({ id: 'a', status: 'approved' })]), opts, { kind: 'person', decider: async () => ana });
		expect(save).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ status: 'approved', decidedBy: ana, decidedAt: expect.any(String) })] }), opts);
	});
});
