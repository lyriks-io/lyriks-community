import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { RunDelta } from '$domain/retrospec';
import type { HeldReportView } from '$lib/shared/code-drift-page';
import MismatchRunReport from './MismatchRunReport.svelte';

const SCOPE = 'What changed in the code since commit abc1234. The rest of the specification is not read again.';
const delta: RunDelta = { since: 'start', added: [{ id: 'feature:new', kind: 'Feature', title: 'New feature' }], changed: [], removed: [], total: 10, fromCommit: null, toCommit: 'bbb2222' };
const body = (d: RunDelta | null) => render(MismatchRunReport, { props: { projectId: 'kutt-1', report: { scope: SCOPE, delta: d, held: null } } }).body;

describe('Mismatch holds the report of a later Reverse-Specification [criterion:f61f8c94]', () => {
	it('says what the run reads and leads to it while its analysis is not over', () => {
		const page = body(null);
		expect(page).toContain('The report of this Reverse-Specification shows here when its analysis is over.');
		expect(page).toContain(SCOPE);
		expect(page).toContain('href="/projects/kutt-1/retrospec"');
		expect(page).not.toContain('What changed ·');
	});

	it('holds the list once the analysis is over, each element opening in Knowledge', () => {
		const page = body(delta);
		expect(page).toMatch(/What changed · 1/);
		expect(page).toContain('New feature');
		expect(page).toContain('href="/projects/kutt-1/spec');
		expect(page).not.toContain('Review on Mismatch');
	});

	it('says first that the changes are written, and when the code is compared again', () => {
		const page = body(delta);
		expect(page).toContain('Already in the specification');
		expect(page).toContain('so it wrote as it read. Only these elements go back to validation.');
		expect(page.indexOf('Already in the specification')).toBeLessThan(page.indexOf('What changed ·'));
		expect(page.indexOf('What changed ·')).toBeGreaterThan(-1);
		expect(page.slice(page.indexOf('What changed ·'))).not.toContain('Only these go back to validation.');
		expect(page).toContain('The changes made in the code outside Lyriks are compared again once this run is validated.');
		expect(page).toContain('Open Knowledge');
	});
});

const heldReport = (over: Partial<HeldReportView> = {}): HeldReportView => ({
	cards: [{ id: 'c1', kind: 'changed', title: 'Sign in', place: null, current: 'Today', dockedOn: null, proposed: 'Found', code: '', where: '', anchor: null, decision: null, rework: null, revertBrief: 'b' }],
	counts: { total: 1, pending: 1, validated: 0, reverted: 0, rejected: 0 },
	writing: false,
	written: null,
	reworkPrompt: 'rework',
	...over
});
const heldBody = (held: HeldReportView, canWrite = true) => render(MismatchRunReport, { props: { projectId: 'kutt-1', canWrite, report: { scope: SCOPE, delta: null, held } } }).body;
const decided = { total: 2, pending: 0, validated: 2, reverted: 0, rejected: 0 };

describe('each change of a later run is decided on Mismatch, docked on the specification as it reads today [criterion:42311513]', () => {
	it('says how many are to decide, and that nothing is in the specification yet', () => {
		const page = heldBody(heldReport());
		expect(page).toContain('to decide, of 1');
		expect(page).toContain('Nothing below is in the specification yet.');
		expect(page).toContain('Validate only records your decision: once every change is decided, Write the validated changes has Lyriks write them into the specification, exactly as your AI prepared them.');
		expect(page).toContain('Today');
		expect(page).toContain('Found');
	});

	it('offers Validate all only with several left to decide', () => {
		expect(heldBody(heldReport())).not.toContain('Validate all');
		expect(heldBody(heldReport({ counts: { total: 2, pending: 2, validated: 0, reverted: 0, rejected: 0 } }))).toContain('Validate all');
	});
});

describe('what a person validated on Mismatch is written once, by their AI [criterion:1aaa8316]', () => {
	it('offers the writing once nothing is left to decide [criterion:2afc5771]', () => {
		expect(heldBody(heldReport())).not.toMatch(/Write the \d+ validated/);
		expect(heldBody(heldReport({ counts: decided }))).toContain('Write the 2 validated changes');
	});

	it('closes a report with nothing validated [criterion:2afc5771]', () => {
		expect(heldBody(heldReport({ counts: { total: 1, pending: 0, validated: 0, reverted: 0, rejected: 1 } }))).toContain('Close this report');
		expect(heldBody(heldReport({ counts: { total: 1, pending: 0, validated: 0, reverted: 1, rejected: 0 } }))).not.toMatch(/Write the \d+ validated/);
		expect(heldBody(heldReport({ counts: { total: 1, pending: 0, validated: 0, reverted: 1, rejected: 0 } }))).toContain('Close this report');
	});

	it('sends what was rejected to the AI, and writes nothing meanwhile [criterion:852ceec0]', () => {
		const page = heldBody(heldReport({ counts: { total: 3, pending: 0, validated: 2, reverted: 0, rejected: 1 } }));
		expect(page).toContain('Send the 1 rejected change to your AI');
		expect(page).toContain('Nothing is written while a change is rejected');
		expect(page).not.toMatch(/Write the \d+ validated/);
		expect(page).not.toContain('Close this report');
		expect(heldBody(heldReport({ counts: { total: 2, pending: 1, validated: 0, reverted: 0, rejected: 1 } }))).toContain('Send the 1 rejected change');
		expect(page).toContain('Or take the rejection back.');
		const reader = heldBody(heldReport({ counts: { total: 2, pending: 0, validated: 1, reverted: 0, rejected: 1 } }), false);
		expect(reader).not.toContain('Send the');
		expect(reader).not.toContain('Nothing is written while a change is rejected');
	});

	it('says Lyriks writes, and offers no decision, once the writing opened [criterion:a646b474]', () => {
		const page = heldBody(heldReport({ counts: decided, writing: true, written: { total: 2, written: 1, underWay: true, stop: null } }));
		expect(page).toContain('Lyriks writes the 2 validated changes. 1 written so far.');
		expect(page).not.toContain('>Validate</button>');
		expect(page).not.toContain('Write the 2');
		expect(page).not.toContain('Copy the prompt');
		const done = heldBody(heldReport({ counts: decided, writing: true, written: { total: 2, written: 2, underWay: false, stop: null } }));
		expect(done).toContain('Lyriks wrote the 2 validated changes. Validate the specification in Knowledge.');
		expect(done).toContain('Open Knowledge');
	});

	it('says where the writing stopped, and offers an editor to start it again [criterion:5aec3583]', () => {
		const stopped = heldReport({ counts: decided, writing: true, written: { total: 2, written: 1, underWay: false, stop: { change: 'c1', title: 'Sign in', reason: 'the engine did not answer.' } } });
		const page = heldBody(stopped);
		expect(page).toContain('Lyriks wrote 1 of the 2 validated changes.');
		expect(page).toContain('It stopped at “Sign in”: the engine did not answer.');
		expect(page).toContain('Write the remaining 1');
		expect(page).toContain('Leave this change out');
		expect(heldBody(stopped, false)).not.toContain('Write the remaining');
		expect(heldBody(stopped, false)).not.toContain('Leave this change out');
	});

	it('offers a reader no way to write', () => {
		expect(heldBody(heldReport({ counts: decided }), false)).not.toMatch(/Write the \d+ validated/);
	});
});
