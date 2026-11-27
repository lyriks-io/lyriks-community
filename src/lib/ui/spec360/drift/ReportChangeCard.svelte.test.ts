import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { ReportCard } from '$domain/retrospec';
import ReportChangeCard from './ReportChangeCard.svelte';

const card = (over: Partial<ReportCard> = {}): ReportCard => ({ id: 'c1', kind: 'changed', title: 'Sign in', place: 'Access › Accounts', current: 'Sign in: With a password', dockedOn: null, proposed: 'Sign in with a key', code: 'if (key)', where: 'src/a.ts:1', anchor: 'action:f:a', decision: null, rework: null, revertBrief: 'brief', ...over });
const body = (c: ReportCard, canDecide = true, readerName: string | null = null) => render(ReportChangeCard, { props: { projectId: 'p', card: c, canDecide, busy: false, onDecide: () => {}, readerName } }).body;
/** The reader's own box that validates, the cross that rejects (criterion f56c25b5). */
const OWN_BOX = /<button[^>]*title="You · click to validate"[^>]*data-own-box/;
const CROSS = /<button[^>]*aria-label="Reject Sign in"[^>]*title="Say what must change before it goes into the specification"/;
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

	it('ends on Revert, the cross and the reader\'s box for who may decide, and nothing for anyone else [criterion:f56c25b5] [criterion:a58e31d0]', () => {
		const page = body(card());
		expect(page).toMatch(OWN_BOX);
		expect(page).toMatch(CROSS);
		expect(page).toContain('>Revert</button>');
		expect(page.indexOf('>Revert</button>')).toBeLessThan(page.search(CROSS));
		expect(page.search(CROSS)).toBeLessThan(page.search(OWN_BOX));
		expect(page).not.toMatch(/>\s*(Validate|Reject)\s*<\/button>/);
		const reader = body(card(), false);
		expect(reader).not.toMatch(OWN_BOX);
		expect(reader).not.toMatch(CROSS);
		expect(reader).not.toContain('>Revert</button>');
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
		expect(page).not.toMatch(OWN_BOX);
		expect(body(card({ decision: { verdict: 'validated', by: { id: 'a', name: 'Ann' }, at: 'x' } }), false)).not.toContain('Take it back');
	});

	it('takes a validation back from the green box of who decided, a rejection from the filled cross [criterion:67bde8ab]', () => {
		const validated = body(card({ decision: { verdict: 'validated', by: { id: 'a', name: 'Ann Lee' }, at: 'x' } }));
		expect(validated).toMatch(/<button[^>]*title="Ann Lee validated this · click to take it back"[^>]*data-stamp-ok="true"[^>]*data-own-box/);
		expect(validated).toContain('>AL<');
		expect(body(card({ decision: { verdict: 'validated', by: { id: 'a', name: 'Ann Lee' }, at: 'x' } }), true, 'Ann Lee')).toContain('>YOU<');
		const read = body(card({ decision: { verdict: 'validated', by: { id: 'a', name: 'Ann Lee' }, at: 'x' } }), false);
		expect(read).toMatch(/<span[^>]*role="img"[^>]*aria-label="Ann Lee · validated"/);
		expect(read).not.toContain('data-own-box');
		const rejected = body(card({ decision: { verdict: 'rejected', by: { id: 'a', name: 'Ann' }, at: 'x', note: 'n' } }));
		expect(rejected).toMatch(/<button[^>]*aria-label="Take back the rejection of Sign in"[^>]*data-reject-state="rejected"/);
		expect(body(card({ decision: { verdict: 'rejected', by: { id: 'a', name: 'Ann' }, at: 'x', note: 'n' } }), false)).not.toMatch(/<button[^>]*data-reject-state/);
	});

	it('reads a rejection with what must change, and a rework beside what was asked [criterion:795a0461]', () => {
		const rejected = body(card({ decision: { verdict: 'rejected', by: { id: 'a', name: 'Ann' }, at: '2026-11-09T10:00:00.000Z', note: 'Say 30 days, not 7' } }));
		expect(rejected).toContain('Rejected, to rework');
		expect(rejected).toContain('What must change');
		expect(rejected).toContain('Say 30 days, not 7');
		const reworked = body(card({ rework: { note: 'Say 30 days, not 7', by: { id: 'a', name: 'Ann' }, at: '2026-11-09T10:00:00.000Z' } }));
		expect(reworked).toContain('Asked by Ann');
		expect(reworked).toContain('Say 30 days, not 7');
		expect(reworked).toContain('>Revert</button>');
		expect(reworked).toMatch(CROSS);
		expect(reworked).toMatch(OWN_BOX);
	});
});
