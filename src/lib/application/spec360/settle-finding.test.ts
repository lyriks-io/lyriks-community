import { describe, expect, it } from 'vitest';
import { keepFinding, reopenFinding } from './settle-finding';
import type { ProjectRulesDraft } from '$domain/rules';

const issue = (id: string, status: string, resolutionNote = '') => ({ id, status, resolutionNote, title: id }) as unknown as ProjectRulesDraft['issues'][number];
const rules = (issues: ProjectRulesDraft['issues']) => ({ issues }) as unknown as ProjectRulesDraft;

describe('a point rejected from the Overview is kept as it is, its note saying who and when [criterion:e0f69b3c]', () => {
	it('resolves the open issue only, with the note', () => {
		const next = keepFinding(rules([issue('a', 'open'), issue('b', 'open')]), 'a', 'Alexis M.', '2026-10-30T13:40:00.000Z');
		expect(next?.issues.map((i) => [i.id, i.status, i.resolutionNote])).toEqual([
			['a', 'resolved', 'Kept as it is by Alexis M. on 2026-10-30.'],
			['b', 'open', '']
		]);
	});

	it('keeps a note already written, and refuses an issue gone or already settled', () => {
		expect(keepFinding(rules([issue('a', 'in_review', 'Checked with the PO.')]), 'a', 'Alexis M.', '2026-10-30')?.issues[0].resolutionNote).toBe('Checked with the PO.\nKept as it is by Alexis M. on 2026-10-30.');
		expect(keepFinding(rules([issue('a', 'resolved')]), 'a', 'Alexis M.', '2026-10-30')).toBeNull();
		expect(keepFinding(rules([]), 'a', 'Alexis M.', '2026-10-30')).toBeNull();
	});

	it('never keeps a critical contradiction: it blocks the project health and is fixed through an evolution', () => {
		const blocking = { ...issue('a', 'open'), kind: 'contradiction', severity: 'critical' } as unknown as ProjectRulesDraft['issues'][number];
		expect(keepFinding(rules([blocking]), 'a', 'Alexis M.', '2026-10-30')).toBeNull();
		expect(keepFinding(rules([{ ...blocking, severity: 'major' }]), 'a', 'Alexis M.', '2026-10-30')?.issues[0].status).toBe('resolved');
	});
});

describe('Undo puts a rejected point back to review [criterion:e0f69b3c]', () => {
	it('opens the issue again, the line its keep added gone', () => {
		const kept = keepFinding(rules([issue('a', 'in_review', 'Checked with the PO.')]), 'a', 'Alexis M.', '2026-10-30')!;
		expect(reopenFinding(kept, 'a')?.issues.map((i) => [i.status, i.resolutionNote])).toEqual([['open', 'Checked with the PO.']]);
	});

	it('reopens only what a rejection settled', () => {
		expect(reopenFinding(rules([issue('a', 'resolved', 'Fixed by EVO-001.')]), 'a')).toBeNull();
		expect(reopenFinding(rules([issue('a', 'open')]), 'a')).toBeNull();
		expect(reopenFinding(rules([]), 'a')).toBeNull();
	});
});
