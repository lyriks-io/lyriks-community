import { describe, expect, it } from 'vitest';
import { parseRetrospecReading } from './parse-retrospec-reading';

describe('what a person’s AI reports of its retrospecification [criterion:c50587fb]', () => {
	it('reads the commit, as an object or a bare hash, and the checks', () => {
		expect(parseRetrospecReading({ commit: { sha: ' abc1234 ', repository: 'shop' } })).toEqual({ ok: true, reading: { commit: { sha: 'abc1234', repository: 'shop' }, checks: [], received: false, changes: [], withdrawn: [], finished: false, written: [] } });
		expect(parseRetrospecReading({ commit: 'abc1234' })).toEqual({ ok: true, reading: { commit: { sha: 'abc1234', repository: null }, checks: [], received: false, changes: [], withdrawn: [], finished: false, written: [] } });
		expect(parseRetrospecReading({ checks: [{ anchor: 'action:f:a', says: 'other', code: 'x', where: 'a.ts:1' }] })).toEqual({
			ok: true,
			reading: { commit: null, checks: [{ itemId: 'action:f:a', verdict: 'other', code: 'x', where: 'a.ts:1' }], received: false, changes: [], withdrawn: [], finished: false, written: [] }
		});
	});

	it('reads that the AI received the prompt only from a plain true [criterion:a6f870af]', () => {
		const received = (body: unknown) => {
			const parsed = parseRetrospecReading(body);
			return parsed.ok && parsed.reading.received;
		};
		expect(received({ received: true })).toBe(true);
		expect(received({ received: 'true' })).toBe(false);
		expect(received({})).toBe(false);
	});

	it('reads nothing as a reading of where the run stands', () => {
		expect(parseRetrospecReading(null)).toEqual({ ok: true, reading: { commit: null, checks: [], received: false, changes: [], withdrawn: [], finished: false, written: [] } });
	});

	it('refuses a check that says neither same nor other [criterion:23397c95]', () => {
		expect(parseRetrospecReading({ checks: [{ anchor: 'action:f:a', says: 'maybe' }] })).toEqual({ ok: false, reason: 'The check of action:f:a says "same" or "other".' });
		expect(parseRetrospecReading({ checks: [{ says: 'same' }] })).toEqual({ ok: false, reason: 'Each check names the anchor of the edit it reads.' });
	});
});

describe('what a run that holds its changes reports [criterion:50b00229]', () => {
	const reading = (body: unknown) => {
		const parsed = parseRetrospecReading(body);
		if (!parsed.ok) throw new Error(parsed.reason);
		return parsed.reading;
	};
	const change = { id: 'c1', kind: 'changed', anchor: 'action:f:a', title: 'Sign in', proposed: 'With a key', code: 'if (key)', where: 'src/a.ts:1' };

	it('reads a difference whole', () => {
		expect(reading({ changes: [change] }).changes).toEqual([{ ...change, dock: null }]);
		expect(reading({ withdrawn: [' c1 '] }).withdrawn).toEqual(['c1']);
		expect(parseRetrospecReading({ withdrawn: [''] })).toEqual({ ok: false, reason: 'withdrawn names the id of each change.' });
		expect(reading({ finished: true }).finished).toBe(true);
	});

	it('refuses a change that does not say what it touches, or what it would read', () => {
		const refused = (over: Record<string, unknown>) => parseRetrospecReading({ changes: [{ ...change, ...over }] });
		expect(refused({ kind: 'moved' })).toMatchObject({ ok: false });
		expect(refused({ anchor: undefined })).toMatchObject({ ok: false, reason: 'The change c1 names the anchor of the element it changes or removes.' });
		expect(refused({ kind: 'new', anchor: undefined })).toMatchObject({ ok: false, reason: 'The new element c1 names the anchor it docks on.' });
		expect(refused({ proposed: '' })).toMatchObject({ ok: false, reason: 'The change c1 says what the element would read.' });
	});

	it('takes a removal without what it would read', () => {
		expect(reading({ changes: [{ ...change, kind: 'removed', proposed: undefined }] }).changes[0].proposed).toBe('');
	});

	it('reads what a validated change became [criterion:1aaa8316]', () => {
		expect(reading({ written: [{ change: 'c1', elements: [{ anchor: 'action:f:a', title: 'Sign in' }] }] }).written).toEqual([{ change: 'c1', elements: [{ anchor: 'action:f:a', title: 'Sign in' }] }]);
		expect(parseRetrospecReading({ written: [{ change: 'c1' }] })).toMatchObject({ ok: false });
	});
});
