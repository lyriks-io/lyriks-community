import { describe, expect, it } from 'vitest';
import { driftNotices, DRIFT_ROWS_SHOWN } from './home-drift';
import type { HomeCodeChange, HomeSource } from './home-source';
import { markRead, NO_READS } from './reads';

const NOW = '2026-11-06T12:00:00.000Z';
const change = (over: Partial<HomeCodeChange>): HomeCodeChange => ({
	key: 'f1|a1|rule:r1',
	featureId: 'f1',
	featureName: 'Change phone number',
	shift: 'changed',
	elementLabel: 'Rule · Wait before a new number',
	specText: 'A user waits 30 days before changing number again',
	snippet: 'let waitDays = 7',
	where: 'ChangePhoneNumber.swift:42',
	code: 'ChangePhoneNumber.swift\t42\tlet waitDays = 7',
	readAt: '2026-11-06T09:00:00.000Z',
	decided: false,
	...over
});
const source = (over: Partial<HomeSource>): HomeSource => ({ id: 'sig', name: 'Signal for iOS', requests: [], reads: NO_READS, run: null, drift: [change({})], mayEdit: true, ...over });

describe('A feature whose code changed outside Lyriks reads as a DRIFT card that opens Mismatch [criterion:d18e3e74]', () => {
	it('tells one DRIFT card per feature with changes still to decide, under CODE WATCH, opening Mismatch', () => {
		const [card, ...rest] = driftNotices(
			source({ drift: [change({}), change({ key: 'f1|a1|rule:r2', specText: 'The days left are shown', snippet: '' , shift: 'gone' }), change({ featureId: 'f2', key: 'f2|x', decided: true })] }),
			NOW
		);
		expect(rest).toEqual([]);
		expect(card).toMatchObject({ at: '2026-11-06T09:00:00.000Z', unread: true, href: '/projects/sig/drift' });
		expect(card.notice).toMatchObject({ section: 'Code watch', level: 'drift', title: 'A change was made outside the process.', action: { label: 'Review on Mismatch', icon: 'go' } });
		expect(card.notice.body.map((r) => r.text).join('')).toBe('The code of “Change phone number” changed outside Lyriks: 2 elements of the specification no longer match it.');
		expect(card.notice.visual).toEqual({
			kind: 'speccode',
			rows: [
				{ spec: 'A user waits 30 days before changing number again', code: 'let waitDays = 7', where: 'ChangePhoneNumber.swift:42', gone: false },
				{ spec: 'The days left are shown', code: '', where: 'ChangePhoneNumber.swift:42', gone: true }
			],
			more: 0
		});
	});

	it('shows the first changes in its picture and counts the others', () => {
		const many = Array.from({ length: DRIFT_ROWS_SHOWN + 2 }, (_, i) => change({ key: `f1|a1|rule:${i}` }));
		const [card] = driftNotices(source({ drift: many }), NOW);
		expect(card.notice.visual).toMatchObject({ kind: 'speccode', more: 2 });
	});

	it('tells nothing to a reader who may not edit, nor while the specification is a draft', () => {
		expect(driftNotices(source({ mayEdit: false }), NOW)).toEqual([]);
		expect(driftNotices(source({ drift: null }), NOW)).toEqual([]);
		expect(driftNotices(source({ drift: [change({ decided: true })] }), NOW)).toEqual([]);
	});

	it('is a new card when the code reads something new, and reads read once marked', () => {
		const [card] = driftNotices(source({}), NOW);
		const [again] = driftNotices(source({ drift: [change({ code: 'ChangePhoneNumber.swift\t42\tlet waitDays = 3' })] }), NOW);
		expect(again.id).not.toBe(card.id);
		expect(driftNotices(source({ reads: markRead(NO_READS, [card.id]) }), NOW)[0].unread).toBe(false);
	});
});
