import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { RunDelta } from '$domain/retrospec';
import RetroDelta from './RetroDelta.svelte';

const rows = (n: number, kind: string) => Array.from({ length: n }, (_, i) => ({ id: `feature:${kind}-${i}`, kind: 'Feature', title: `${kind} ${i}` }));
const delta = (over: Partial<RunDelta> = {}): RunDelta => ({ since: 'start', added: rows(1, 'added'), changed: rows(1, 'changed'), removed: [{ id: 'rule:f:gone', kind: 'Rule', title: 'Gone rule' }], total: 10, fromCommit: 'aaa1111', toCommit: 'bbb2222', ...over });
const body = (d: RunDelta, validated = false, reportHref: string | null = null) => render(RetroDelta, { props: { projectId: 'kutt-1', delta: d, goesBack: !validated, reportHref } }).body;

describe('the summary of a later run says what changed [criterion:03192a6e]', () => {
	it('heads the block with how much changed, since when, between which commits, and what goes back to validation', () => {
		const page = body(delta());
		expect(page).toMatch(/What changed · 3/);
		expect(page).toContain('Since this run started: 1 new, 1 changed and 1 removed, out of 10 elements. From commit aaa1111 to bbb2222. Only these go back to validation.');
	});

	it('no longer says what goes back to validation once the run is validated', () => {
		expect(body(delta(), true)).not.toContain('Only these go back to validation.');
	});

	it('lists new and changed elements as links to Knowledge, a removed one as its title alone', () => {
		const page = body(delta());
		expect(page).toMatch(/>New</);
		expect(page).toMatch(/>Changed</);
		expect(page).toMatch(/>Removed</);
		expect(page).toContain('href="/projects/kutt-1/spec');
		const removed = page.slice(page.indexOf('No longer in the specification'));
		expect(removed).toContain('Gone rule');
		expect(removed).not.toContain('<a ');
	});

	it('docks each element under its place, each rule under its action', () => {
		const under = { id: 'action:f:a', title: 'Read my account' };
		const page = body(delta({ added: [{ id: 'rule:f:r', kind: 'Rule', title: 'When the user asks', place: 'Access › Keys', under, order: 1 }], changed: [], removed: [] }));
		expect(page.indexOf('Access › Keys')).toBeLessThan(page.indexOf('Read my account'));
		expect(page.indexOf('Read my account')).toBeLessThan(page.indexOf('When the user asks'));
		expect(page).not.toContain('>Rule<');
	});

	it('shows three rules per action before Show all', () => {
		const under = { id: 'action:f:a', title: 'A' };
		const added = Array.from({ length: 5 }, (_, i) => ({ id: `rule:f:${i}`, kind: 'Rule', title: `rule ${i}`, place: 'P', under, order: i }));
		const page = body(delta({ added, changed: [], removed: [] }));
		expect(page).toContain('rule 2');
		expect(page).not.toContain('rule 3');
		expect(page).toContain('Show all 5 rules');
	});

	it('shows twelve places before Show all', () => {
		const added = Array.from({ length: 14 }, (_, i) => ({ id: `feature:${i}`, kind: 'Feature', title: `f${i}`, place: `Place ${i}`, order: i }));
		const page = body(delta({ added, changed: [], removed: [] }));
		expect(page).toContain('Place 11');
		expect(page).not.toContain('Place 12');
		expect(page).toContain('Show all 14 places');
	});

	it('says a changed element only reads what it says now', () => {
		expect(body(delta())).toContain('Open a changed element to read what it says now: Lyriks did not keep what it read before.');
		expect(body(delta({ changed: [] }))).not.toContain('Open a changed element');
	});

	it('says when the run changed nothing, with no group and no count', () => {
		const page = body(delta({ added: [], changed: [], removed: [] }));
		expect(page).toContain('This run changed nothing in the specification: what it read still holds.');
		expect(page).not.toContain('What changed ·');
		expect(page).not.toContain('Only these go back to validation.');
	});

	it('says when it cannot tell', () => {
		expect(body(delta({ since: null, added: [], changed: [], removed: [] }))).toContain('so it cannot list what changed.');
	});
});

describe('the list of a later run lives on Mismatch until it is validated [criterion:f61f8c94]', () => {
	it('leads to Mismatch with how much changed, and no list', () => {
		const page = body(delta(), false, '/projects/kutt-1/drift');
		expect(page).toMatch(/What changed · 3/);
		expect(page).toContain('href="/projects/kutt-1/drift"');
		expect(page).toContain('Review on Mismatch');
		expect(page).not.toContain('added 0');
	});

	it('has nowhere to lead when the run changed nothing', () => {
		expect(body(delta({ added: [], changed: [], removed: [] }), false, '/projects/kutt-1/drift')).not.toContain('Review on Mismatch');
	});
});
