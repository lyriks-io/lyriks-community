import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from './parse-evolution-draft';

/**
 * A stored reading comes back through this parser. A field it does not name is
 * dropped, which is how the touched feature a node was reached from vanished
 * between the walk and the screen, and every row fell back to the verb of the
 * request as a whole.
 */
describe('an impact finding read back from storage', () => {
	const stored = (extra: Record<string, unknown>) =>
		parseEvolutionDraft(
			{
				requests: [
					{
						id: 'r1',
						title: 'T',
						impactFindings: [
							{
								id: 'imp-1',
								hypothesis: 'change',
								section: 'permissions',
								nodeId: 'role:admin',
								nodeLabel: 'Admin',
								nodeKind: 'role',
								groupPath: ['Checkout'],
								note: 'Next to "Checkout": this role can use it.',
								depth: 1,
								severity: 'high',
								...extra
							}
						]
					}
				]
			},
			'p1'
		).requests[0].impactFindings[0];

	it('keeps the touched feature the walk reached it from', () => {
		expect(stored({ fromLeafId: 'feat-a' }).fromLeafId).toBe('feat-a');
	});

	it('leaves an older reading without one as it was', () => {
		expect('fromLeafId' in stored({})).toBe(false);
		// A row reached from a feature the change uses as it stands keeps saying so (ac-evo-imp-used).
		expect(stored({ fromUsed: true }).fromUsed).toBe(true);
		expect('fromUsed' in stored({})).toBe(false);
	});
});

describe('what a closed request keeps, read back from storage', () => {
	const read = (extra: Record<string, unknown>) =>
		parseEvolutionDraft({ projectId: 'p1', requests: [{ id: 'r1', title: 'Notes', status: 'closed', ...extra }] }, 'p1').requests[0];

	it('keeps the deferred line a request was started from, and drops a link that names none [criterion:03b7eacf]', () => {
		expect(read({ deferredFrom: { requestId: 'r0', lineId: 'l1' } }).deferredFrom).toEqual({ requestId: 'r0', lineId: 'l1' });
		expect(read({ deferredFrom: { requestId: 'r0' } }).deferredFrom).toBeUndefined();
		expect(read({}).deferredFrom).toBeUndefined();
	});

	it('keeps the baseline its close captured and what the AI reported on the ticket', () => {
		const request = read({
			closingBaselineId: 'b-1',
			ticketPost: { at: '2026-10-26T10:00:00.000Z', by: 'ana@team.test', byKind: 'ai_client', ticketKey: 'FAC-242', tool: 'Jira', commented: true, movedToDone: false, note: 'No done status' }
		});
		expect(request.closingBaselineId).toBe('b-1');
		expect(request.ticketPost).toMatchObject({ ticketKey: 'FAC-242', tool: 'Jira', commented: true, movedToDone: false, note: 'No done status' });
	});

	it('drops a report naming no ticket, and a ticket click with no message', () => {
		const request = read({
			ticketPost: { tool: 'Jira', commented: true },
			aiClicks: [{ id: 'c1', personId: 'ana@team.test', kind: 'ticket', fieldPath: 'request.ticket', ticket: { key: 'FAC-242' }, state: 'waiting', at: '' }]
		});
		expect('ticketPost' in request).toBe(false);
		expect(request.aiClicks[0]).toMatchObject({ kind: 'ticket' });
		expect('ticket' in request.aiClicks[0]).toBe(false);
	});

	it('keeps the step and the brief of a close click, and drops one naming no step [criterion:ac-leaf-ac-evo-verd-steps-to-ai]', () => {
		const click = { personId: 'ana@team.test', kind: 'close', state: 'waiting', at: '' };
		const request = read({
			aiClicks: [
				{ ...click, id: 'c1', fieldPath: 'request.close.sync', close: { step: 'sync', brief: 'node .lyriks/tools/sync-index.mjs' } },
				{ ...click, id: 'c2', fieldPath: 'request.close.push', close: { step: 'push', brief: 'git push' } }
			]
		});
		expect(request.aiClicks[0].close).toEqual({ step: 'sync', brief: 'node .lyriks/tools/sync-index.mjs' });
		expect('close' in request.aiClicks[1]).toBe(false);
	});
});
