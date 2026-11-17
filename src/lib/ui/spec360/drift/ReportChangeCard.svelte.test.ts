import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { ReportCard } from '$domain/retrospec';
import ReportChangeCard from './ReportChangeCard.svelte';

const card = (over: Partial<ReportCard> = {}): ReportCard => ({ id: 'c1', kind: 'changed', title: 'Sign in', place: 'Access › Accounts', current: 'Sign in: With a password', dockedOn: null, proposed: 'Sign in with a key', code: 'if (key)', where: 'src/a.ts:1', anchor: 'action:f:a', decision: null, rework: null, revertBrief: 'brief', ...over });
const body = (c: ReportCard, canDecide = true) => render(ReportChangeCard, { props: { projectId: 'p', card: c, canDecide, busy: false, onDecide: () => {} } }).body;
const part = (page: string, mark: string) => page.slice(page.indexOf(mark), page.indexOf('</div></div>', page.indexOf(mark)) + 1);

describe('each change of a later run is decided on Mismatch, docked on the specification as it reads today [criterion:42311513]', () => {
	it('sets what the specification says today beside what the run found, under its place', () => {
		const page = body(card());
		expect(page).toContain('Access › Accounts');
		expect(page.indexOf('data-spec-today')).toBeLessThan(page.indexOf('data-run-found'));
		expect(page).toContain('In the specification today');
		expect(page).toContain('Sign in: With a password');
		expect(page).toContain('What the run found');
		expect(page).toContain('Sign in with a key');
		expect(page).toContain('src/a.ts:1');
	});

	it('offers Validate, Revert and Reject to who may decide, and nothing to anyone else', () => {
		const page = body(card());
		for (const word of ['Validate', 'Revert', 'Reject']) expect(page).toContain(`>${word}</button>`);
		const reader = body(card(), false);
		for (const word of ['Validate', 'Revert', 'Reject']) expect(reader).not.toContain(`>${word}</button>`);
	});

	it('docks a new element on the one it attaches to', () => {
		const page = body(card({ kind: 'new', current: null, dockedOn: 'Accounts' }));
		expect(part(page, 'data-spec-today')).toContain('Nothing here yet.');
		expect(part(page, 'data-spec-today')).toContain('It would dock on: Accounts');
	});

	it('says a removed element is no longer in the product', () => {
		expect(body(card({ kind: 'removed' }))).toContain('No longer in the product.');
	});

	it('reads a decision with who took it, and offers to take it back in place of the three buttons', () => {
		const page = body(card({ decision: { verdict: 'reverted', by: { id: 'a', name: 'Ann' }, at: '2026-11-09T10:00:00.000Z' } }));
		expect(page).toContain('Revert requested');
		expect(page).toContain('Ann');
		expect(page).toContain('Take it back');
		expect(page).not.toContain('>Validate</button>');
		expect(body(card({ decision: { verdict: 'validated', by: { id: 'a', name: 'Ann' }, at: 'x' } }), false)).not.toContain('Take it back');
	});

	it('reads a rejection with what must change, and a rework beside what was asked [criterion:eb132bbd]', () => {
		const rejected = body(card({ decision: { verdict: 'rejected', by: { id: 'a', name: 'Ann' }, at: '2026-11-09T10:00:00.000Z', note: 'Say 30 days, not 7' } }));
		expect(rejected).toContain('Rejected, to rework');
		expect(rejected).toContain('What must change');
		expect(rejected).toContain('Say 30 days, not 7');
		const reworked = body(card({ rework: { note: 'Say 30 days, not 7', by: { id: 'a', name: 'Ann' }, at: '2026-11-09T10:00:00.000Z' } }));
		expect(reworked).toContain('Asked by Ann');
		expect(reworked).toContain('Say 30 days, not 7');
		expect(reworked).toContain('>Validate</button>');
	});
});
