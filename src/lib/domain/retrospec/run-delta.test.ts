import { describe, expect, it } from 'vitest';
import { parseRetrospecDocument, withoutServerReadings, type RetrospecDocument, type RetrospecRun } from './document';
import { deltaCommits, deltaLine, deltaSize, runDelta, type RunDelta, deltaElement, deltaPlaces, deltaRow, type DeltaElement } from './run-delta';
import type { SpecElement } from './spec-validation';

const bob = { id: 'bob@x.io', name: 'Bob' };
const run = (id: string, over: Partial<RetrospecRun> = {}): RetrospecRun => ({
	id,
	mode: 'repo',
	implicit: false,
	startedAt: '2026-11-09T10:00:00.000Z',
	startedBy: bob,
	baseline: {},
	launchedAt: null,
	analysisEndedAt: null,
	analysisEndedBy: null,
	reviewStartedAt: null,
	itemTotal: 0,
	publishedAt: null,
	publishedBy: null,
	baselineId: null,
	verdicts: {},
	...over
});
const docOf = (...runs: RetrospecRun[]): RetrospecDocument => ({ version: 1, runs, comments: {} });
const element = (id: string, fingerprint: string, title = id): SpecElement => ({ id, title, fingerprint });
const later = { fromRunId: 'run-1', fromCommit: null, scope: 'delta' } as const;
const atStart = { fingerprints: { 'action:f:a': 'one', 'rule:f:r': 'two', 'term:gone': 'three' }, titles: { 'action:f:a': 'Sign in', 'rule:f:r': 'A rule', 'term:gone': 'Term · Slug' } };

describe('the list of what a later run changed is docked on the specification [criterion:03192a6e]', () => {
	const row = (id: string, order: number, over: Partial<DeltaElement> = {}): DeltaElement => ({ id, kind: 'Rule', title: id, place: 'Access › Accounts', order, ...over });
	const delta = (over: Partial<RunDelta>): RunDelta => ({ since: 'start', added: [], changed: [], removed: [], total: 9, fromCommit: null, toCommit: null, ...over });
	const under = { id: 'action:f:a', title: 'Sign in' };

	it('names the action a rule belongs to even when nothing of it changed', () => {
		const [place] = deltaPlaces(delta({ added: [row('rule:f:r', 2, { under })] }));
		expect(place.place).toBe('Access › Accounts');
		expect(place.blocks).toHaveLength(1);
		expect(place.blocks[0].head).toMatchObject({ id: 'action:f:a', title: 'Sign in', kind: 'Action', status: null });
		expect(place.blocks[0].rules.map((r) => r.id)).toEqual(['rule:f:r']);
	});

	it('puts the rules of a new action under it, with its own tag', () => {
		const [place] = deltaPlaces(delta({ added: [row('action:f:a', 1, { kind: 'Action', title: 'Sign in' }), row('rule:f:r', 2, { under }), row('rule:f:s', 3, { under })] }));
		expect(place.blocks).toHaveLength(1);
		expect(place.blocks[0].head).toMatchObject({ status: 'new', title: 'Sign in' });
		expect(place.blocks[0].rules).toHaveLength(2);
	});

	it('keeps the order of the pages across new and changed, place by place', () => {
		const places = deltaPlaces(delta({ added: [row('term:t', 9, { place: 'Glossary', kind: 'Term' }), row('feature:f', 1, { kind: 'Feature' })], changed: [row('flow:f', 5, { kind: 'Flow' })] }));
		expect(places.map((p) => p.place)).toEqual(['Access › Accounts', 'Glossary']);
		expect(places[0].blocks.map((b) => [b.head.id, b.head.status])).toEqual([
			['feature:f', 'new'],
			['flow:f', 'changed']
		]);
	});

	it('closes the list with what is no longer in the specification', () => {
		const places = deltaPlaces(delta({ added: [row('feature:f', 1, { kind: 'Feature' })], removed: [{ id: 'rule:f:gone', kind: 'Rule', title: 'Gone rule' }] }));
		expect(places.at(-1)).toMatchObject({ place: 'No longer in the specification', blocks: [{ head: { title: 'Gone rule', status: 'removed' } }] });
	});

	it('reads the flow of a feature by what it is, its place naming the feature', () => {
		expect(deltaRow('flow:f', 'Actions · Accounts').title).toBe('Flow of the actions');
	});

	it('takes the place and the action from the elements', () => {
		const titles = new Map([['action:f:a', 'Sign in']]);
		expect(deltaElement({ id: 'rule:f:r', title: 'R', place: 'Access › Accounts', under: 'action:f:a' }, titles, 4)).toMatchObject({ place: 'Access › Accounts', under, order: 4 });
	});
});

describe('the summary of a later run says what changed [criterion:03192a6e]', () => {
	const current = run('run-2', { complementary: later, atStart });

	it('reads each element against what it read as the run started, in the order of the pages', () => {
		const delta = runDelta(docOf(run('run-1'), current), current, [element('feature:new', 'x', 'New feature'), element('action:f:a', 'changed', 'Sign in'), element('rule:f:r', 'two', 'A rule')]);
		expect(delta.since).toBe('start');
		expect(delta.added).toMatchObject([{ id: 'feature:new', kind: 'Feature', title: 'New feature' }]);
		expect(delta.changed).toMatchObject([{ id: 'action:f:a', kind: 'Action', title: 'Sign in' }]);
		expect(delta.removed).toEqual([{ id: 'term:gone', kind: 'Term', title: 'Slug' }]);
		expect(delta.total).toBe(3);
		expect(deltaSize(delta)).toBe(3);
	});

	it('says how much changed, since when and out of how many', () => {
		const delta = runDelta(docOf(current), current, [element('feature:new', 'x'), element('action:f:a', 'changed'), element('rule:f:r', 'two')]);
		expect(deltaLine(delta)).toBe('Since this run started: 1 new, 1 changed and 1 removed, out of 3 elements.');
	});

	it('says nothing of what did not happen', () => {
		const delta = runDelta(docOf(current), current, [element('action:f:a', 'changed'), element('rule:f:r', 'two'), element('term:gone', 'three')]);
		expect(deltaLine(delta)).toBe('Since this run started: 1 changed, out of 3 elements.');
	});

	it('says when the run changed nothing', () => {
		const delta = runDelta(docOf(current), current, [element('action:f:a', 'one'), element('rule:f:r', 'two'), element('term:gone', 'three')]);
		expect(deltaSize(delta)).toBe(0);
		expect(deltaLine(delta)).toBe('This run changed nothing in the specification: what it read still holds.');
	});

	it('says the commits it read between, the one it read alone when no other is known, nothing before it reported one', () => {
		const base: RunDelta = { since: 'start', added: [], changed: [], removed: [], total: 0, fromCommit: 'aaa1111', toCommit: 'bbb2222' };
		expect(deltaCommits(base)).toBe('From commit aaa1111 to bbb2222.');
		expect(deltaCommits({ ...base, fromCommit: null })).toBe('Read up to commit bbb2222.');
		expect(deltaCommits({ ...base, toCommit: null })).toBeNull();
	});

	it('shortens the commits the run records', () => {
		const withCommits = run('run-2', { complementary: { ...later, fromCommit: '1234567890' }, commit: { sha: 'abcdef0123', repository: null, at: 'x' }, atStart });
		const delta = runDelta(docOf(withCommits), withCommits, []);
		expect([delta.fromCommit, delta.toCommit]).toEqual(['1234567', 'abcdef0']);
	});

	it('reads a run started before Lyriks recorded it against the fingerprints of the last validation', () => {
		const validated = run('run-1', { fingerprints: { 'action:f:a': 'one', 'term:old': 'x' }, verdicts: { 'term:old': { title: 'Term · Old', tab: 't', validatedBy: [], flag: null } } });
		const old = run('run-2', { complementary: later });
		const delta = runDelta(docOf(validated, old), old, [element('action:f:a', 'two', 'Sign in')]);
		expect(delta.since).toBe('validation');
		expect(delta.changed.map((e) => e.id)).toEqual(['action:f:a']);
		expect(delta.removed).toEqual([{ id: 'term:old', kind: 'Term', title: 'Old' }]);
		expect(deltaLine(delta)).toContain('Since the last validation:');
	});

	it('falls back on the validations the run carried when the last validation recorded nothing', () => {
		const old = run('run-2', { complementary: later, carried: { 'action:f:a': { fingerprint: 'one', validatedBy: [{ person: bob, at: 'x' }] } } });
		const delta = runDelta(docOf(run('run-1'), old), old, [element('action:f:a', 'two'), element('feature:never', 'x')]);
		expect(delta.since).toBe('validation');
		expect(delta.changed.map((e) => e.id)).toEqual(['action:f:a']);
		expect(delta.added.map((e) => e.id)).toEqual(['feature:never']);
	});

	it('says it cannot tell when nothing recorded what the specification read, or the elements cannot be read', () => {
		const bare = run('run-2', { complementary: later });
		const unknown = runDelta(docOf(run('run-1'), bare), bare, [element('action:f:a', 'one')]);
		expect(unknown.since).toBeNull();
		expect(deltaLine(unknown)).toBe('Lyriks did not record what the specification read before this run, so it cannot list what changed.');
		expect(runDelta(docOf(current), current, null).since).toBeNull();
	});

	it('keeps what the run read at its start through a save, and away from the page', () => {
		const stored = parseRetrospecDocument(JSON.parse(JSON.stringify(docOf(current))));
		expect(stored.runs[0].atStart).toEqual(atStart);
		expect(withoutServerReadings(stored.runs[0]).atStart).toBeUndefined();
	});
});
