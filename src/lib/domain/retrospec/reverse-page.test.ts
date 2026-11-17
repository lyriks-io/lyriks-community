import { describe, expect, it } from 'vitest';
import { celebrationLine, liveTitle, readingEnd, relaunchOffered, relaunchQuestion, reverseLead, runReach, scopeLine } from './reverse-page';

describe('the Reverse page says what it does, and asks before the next run [criterion:2dbed801]', () => {
	it('says under its title what Lyriks reads, from where the runs read', () => {
		expect(reverseLead('Taskora', 'repo')).toBe('Lyriks reads the code of Taskora and rebuilds its specification: features, rules and users.');
		expect(reverseLead('Taskora', 'docs')).toBe('Lyriks reads the documentation of Taskora and rebuilds its specification: features, rules and users.');
		expect(reverseLead('Taskora', 'both')).toContain('reads the code and the documentation of Taskora');
	});

	it('asks a complementary run from the commit the last validated run recorded, erasing nothing', () => {
		const q = relaunchQuestion({ complementary: true, fromCommit: '7c0d4b1' });
		expect(q.title).toBe('Launch a complementary Reverse-Specification?');
		expect(q.message).toContain('erases nothing');
		expect(q.message).toContain('since commit 7c0d4b1');
		expect(q.message).toContain('the whole product again');
		expect(q.message).toContain('Only what it changes goes back to validation.');
	});

	it('asks a complementary run from what the specification cites when no commit was recorded', () => {
		const q = relaunchQuestion({ complementary: true, fromCommit: null });
		expect(q.message).toContain('reads only what is new or changed since in the code and the documentation its elements cite');
	});

	it('asks a first run as reading the whole product', () => {
		expect(relaunchQuestion({ complementary: false }).title).toBe('Launch a new Reverse-Specification?');
	});

	it('says what becomes of a last run not validated, and only then', () => {
		const next = { complementary: true, fromCommit: null } as const;
		expect(relaunchQuestion(next, true).message).toContain('it closes and stays in the history, and the validations already given are kept.');
		expect(relaunchQuestion(next).message).not.toContain('closes');
	});
});

describe('Relaunch the analysis is offered once the analysis of the last run is over, to who may edit [unspa:8c76cb65:e296dd4f]', () => {
	it('is offered after a validated run to its editor [unspa:8c76cb65:e296dd4f:8561d989]', () => {
		expect(relaunchOffered(true, 'done')).toBe(true);
	});

	it('is offered on a run ready to review or still in review [unspa:8c76cb65:e296dd4f:3a5f8d13]', () => {
		for (const status of ['bilan', 'review'] as const) expect(relaunchOffered(true, status)).toBe(true);
	});

	it('is never offered to a reader [unspa:8c76cb65:e296dd4f:67152567]', () => {
		for (const status of ['bilan', 'review', 'done'] as const) expect(relaunchOffered(false, status)).toBe(false);
	});

	it('is never offered while the run waits for its prompt or its AI reads [unspa:8c76cb65:e296dd4f:9c75fc28]', () => {
		for (const status of ['start', 'source', 'running'] as const) expect(relaunchOffered(true, status)).toBe(false);
	});
});

describe('the summary of a Reverse-Specification says whether Lyriks read the whole product [criterion:a05bca06]', () => {
	const base = { productName: 'Shop', mode: 'repo' as const, pct: 23, closed: false, closedBy: null };

	it('reads whole once Lyriks ran its final check, from where the run read', () => {
		expect(readingEnd({ ...base, checked: true })).toEqual({ whole: true, title: 'Lyriks has read the code of Shop' });
		expect(readingEnd({ ...base, mode: 'both', checked: true }).title).toBe('Lyriks has read the code and the documentation of Shop');
	});

	it('reads partial when a person closed the analysis before the final check, with who and at what share', () => {
		const end = readingEnd({ ...base, checked: false, closed: true, closedBy: 'Carmen' });
		expect(end).toEqual({ whole: false, pct: 23, title: 'Lyriks read 23 % of the code of Shop', line: 'Closed by Carmen at 23 %, before Lyriks ran its final check.' });
	});

	it('reads partial when the review started before anyone closed the analysis or Lyriks checked it', () => {
		const end = readingEnd({ ...base, mode: 'docs', checked: false });
		expect(end.whole).toBe(false);
		expect(end.title).toBe('Lyriks read 23 % of the documentation of Shop');
		if (!end.whole) expect(end.line).toBe('The review started at 23 %, before Lyriks ran its final check.');
	});
});

describe('the Reverse page says what each run reads, while it reads and once it is over [criterion:25254e5a]', () => {
	const delta = runReach({ fromCommit: 'abc1234def', scope: 'delta', handEdits: 0 });
	const whole = runReach({ fromCommit: null, scope: 'whole' });
	const first = runReach(null);

	it('reads a run without a specification to start from as a first run', () => {
		expect(first).toEqual({ kind: 'first' });
		expect(runReach(undefined)).toEqual({ kind: 'first' });
	});

	it('says a first run reads the whole product', () => {
		expect(reverseLead('Kutt', 'repo', first)).toBe('Lyriks reads the code of Kutt and rebuilds its specification: features, rules and users.');
		expect(liveTitle('Kutt', 'repo', first)).toBe('Lyriks is reading the code of Kutt');
		expect(scopeLine('repo', first)).toBe('The whole product, read for the first time.');
	});

	it('says a later run reads what changed, from the short id of its commit', () => {
		expect(reverseLead('Kutt', 'repo', delta)).toBe('Lyriks reads what changed in the code of Kutt and brings its specification up to date.');
		expect(liveTitle('Kutt', 'repo', delta)).toBe('Lyriks is reading what changed in the code of Kutt');
		expect(scopeLine('repo', delta)).toBe('What changed in the code since commit abc1234. The rest of the specification is not read again.');
	});

	it('says what it reads with no commit to start from', () => {
		const none = runReach({ fromCommit: null, scope: 'delta' });
		expect(scopeLine('repo', none)).toBe('What is new, and what changed in the code the specification cites. The rest of the specification is not read again.');
		expect(scopeLine('docs', none)).toContain('what changed in the documents the specification cites');
	});

	it('names the changes made by hand when there are some', () => {
		expect(scopeLine('repo', runReach({ fromCommit: 'abc1234', scope: 'delta', handEdits: 2 }))).toBe('What changed in the code since commit abc1234, with the 2 changes made by hand in the specification. The rest of the specification is not read again.');
		expect(scopeLine('repo', runReach({ fromCommit: 'abc1234', scope: 'delta', handEdits: 1 }))).toContain(', with the change made by hand in the specification.');
	});

	it('names the documents beside the commit on a run that reads both', () => {
		expect(scopeLine('both', delta)).toContain('since commit abc1234, and what is new or changed in the documents the specification cites');
	});

	it('says a later run reads the whole product again and erases nothing', () => {
		expect(reverseLead('Kutt', 'docs', whole)).toBe('Lyriks reads all of the documentation of Kutt again and brings its specification up to date.');
		expect(liveTitle('Kutt', 'repo', whole)).toBe('Lyriks is reading all of the code of Kutt again');
		expect(scopeLine('repo', whole)).toBe('The whole product again, from the specification already gathered. Nothing is erased.');
	});

	it('says what a later run read once it is over', () => {
		const base = { productName: 'Kutt', mode: 'repo' as const, pct: 23, closed: true, closedBy: 'Carmen' };
		expect(readingEnd({ ...base, reach: delta, checked: true }).title).toBe('Lyriks has read what changed in the code of Kutt');
		expect(readingEnd({ ...base, reach: whole, checked: true }).title).toBe('Lyriks has read all of the code of Kutt again');
		expect(readingEnd({ ...base, reach: delta, checked: false }).title).toBe('Lyriks read part of what changed in the code of Kutt');
		expect(readingEnd({ ...base, reach: whole, checked: false }).title).toBe('Lyriks read part of the code of Kutt again');
	});

	it('celebrates a later run for bringing the specification up to date', () => {
		expect(celebrationLine('Kutt', 'repo', delta, 40)).toBe('Lyriks has read what changed in the code of Kutt and brought its specification up to date: 40 % of it is found in the code.');
		expect(celebrationLine('Kutt', 'repo', first, null)).toBe('Lyriks has read the code of Kutt and rebuilt its specification.');
	});
});

describe('a run that holds its changes says nothing is written yet [criterion:50b00229]', () => {
	const delta = runReach({ fromCommit: 'abc1234', scope: 'delta' });

	it('ends the Scope line with it', () => {
		expect(scopeLine('repo', delta, true)).toBe('What changed in the code since commit abc1234. The rest of the specification is not read again. Nothing is written before you validate it on Mismatch.');
	});

	it('celebrates the reading, never a specification brought up to date', () => {
		expect(celebrationLine('Kutt', 'repo', delta, 40, true)).toBe('Lyriks has read what changed in the code of Kutt. Nothing is written yet: what it found waits for you on Mismatch.');
	});
});
