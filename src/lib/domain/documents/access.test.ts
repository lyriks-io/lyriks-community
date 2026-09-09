import { describe, expect, it } from 'vitest';
import { sourceAccess, sourceAccessIssues } from './access';

describe('sourceAccess', () => {
	it('reads a followable address as a link, whatever the note says', () => {
		expect(sourceAccess({ url: 'https://svelte.dev/docs/kit', note: '' })).toBe('link');
		expect(sourceAccess({ url: '/api/files/interview.pdf', note: 'x' })).toBe('link');
		expect(sourceAccess({ url: 'data:application/pdf;base64,AAA', note: '' })).toBe('link');
	});

	it('reads a row without an address as inline when the note carries the content', () => {
		expect(sourceAccess({ url: '', note: 'Interview, 2026-03-11: "we lose two days per invoice"' })).toBe(
			'inline'
		);
		expect(sourceAccess({ url: '   ', note: 'x' })).toBe('inline');
	});

	it('reports an address nobody else can open, even when a note exists', () => {
		expect(sourceAccess({ url: 'file:///mnt/c/Users/me/Downloads/matrix.md', note: 'summary' })).toBe(
			'unreachable'
		);
		expect(sourceAccess({ url: 'Ops lead interview, 2026-03-11', note: '' })).toBe('unreachable');
		expect(sourceAccess({ url: 'Claude Code session of 2026-09-03 in /home/me', note: 'plan' })).toBe(
			'unreachable'
		);
		expect(sourceAccess({ url: 'javascript:alert(1)', note: '' })).toBe('unreachable');
	});

	it('reports a row with nothing to open and nothing to read', () => {
		expect(sourceAccess({ url: '', note: '' })).toBe('empty');
		expect(sourceAccess({})).toBe('empty');
	});
});

describe('sourceAccessIssues', () => {
	it('lists only the rows a reader cannot consult, named and explained', () => {
		const issues = sourceAccessIssues([
			{ id: 'ok-link', title: 'Docs', url: 'https://example.test/docs', note: '' },
			{ id: 'ok-inline', title: 'Interview', url: '', note: 'verbatim excerpt' },
			{ id: 'dead', title: 'Runbook', url: 'file:///home/me/runbook.md', note: 'summary' },
			{ id: 'blank', title: '', url: '', note: '' }
		]);
		expect(issues.map((issue) => [issue.id, issue.access])).toEqual([
			['dead', 'unreachable'],
			['blank', 'empty']
		]);
		expect(issues[0].message).toContain('Source "Runbook" cannot be opened');
		expect(issues[0].message).toContain('file:///home/me/runbook.md');
		expect(issues[1].message).toContain('Source "blank" has nothing to open');
	});

	it('keeps a prose reference readable in the message instead of dumping it whole', () => {
		const long = 'Claude Code session of 2026-09-03 in /home/me/Lyriks, plan written by the agent and approved';
		const [issue] = sourceAccessIssues([{ id: 'plan', title: 'Plan', url: long, note: '' }]);
		expect(issue.message).toContain(`${long.slice(0, 60)}...`);
		expect(issue.message).not.toContain('approved');
	});
});
