import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { CrossEvolutionReading } from '$lib/server/evolution-cross.server';
import SimulationCrossRow from './SimulationCrossRow.svelte';
import { crossWords, landedNoticeWords, orderWords } from './impact-board';

const row = (over: Partial<CrossEvolutionReading>): CrossEvolutionReading =>
	({
		id: 'r2',
		key: 'EVO-002',
		title: 'Validate the elements of a specification',
		stage: 'implementation',
		specVersion: 1,
		href: '/projects/p/evolution?request=r2',
		verdict: 'overlap',
		shared: [{ kind: 'feature', id: 'f', name: 'Validate', here: 'amend', there: 'amend', conflict: false, hereWrites: null, thereWrites: null, common: [] }],
		theirs: [],
		order: null,
		decision: null,
		open: true,
		...over
	}) as CrossEvolutionReading;

const shown = (cross: CrossEvolutionReading, ordering: boolean, open = true) =>
	render(SimulationCrossRow, {
		props: { cross, words: crossWords('EVO-001', { ...cross, key: cross.key ?? cross.title }), open, onToggle: () => {}, ordering: ordering ? { onSet: () => {}, onAcceptRisk: () => {} } : null }
	}).body;

describe('each row of Evolutions in progress reads its order [criterion:ac-leaf-4162228b-6ca7-4176-97e6-138d453376d3]', () => {
	it('reads lands before, lands after, or not ordered yet, and nothing on a pair that shares nothing', () => {
		expect(shown(row({ order: 'before' }), false)).toContain('Lands before this one');
		expect(shown(row({ order: 'after' }), false)).toContain('Lands after this one');
		expect(shown(row({}), false)).toContain('Not ordered yet');
		expect(shown(row({ verdict: 'compatible', shared: [] }), false)).not.toContain('ordered yet');
	});

	it('offers Lands first and Lands after to who may write, never to a reader (action b5a3aa1e)', () => {
		expect(shown(row({}), true)).toContain('>Lands first<');
		expect(shown(row({}), true)).toContain('>Lands after<');
		expect(shown(row({}), false)).not.toContain('>Lands first<');
		expect(shown(row({ open: false }), true)).not.toContain('>Lands first<');
	});

	it('says an undecided conflict and offers to accept the risk; a decided one says how', () => {
		const conflict = row({ verdict: 'conflict', shared: [{ kind: 'feature', id: 'f', name: 'Validate', here: 'amend', there: 'remove', conflict: true, hereWrites: null, thereWrites: null, common: [] }] });
		expect(shown(conflict, true)).toContain('Accept the risk');
		expect(shown(conflict, true)).toContain('Conflict undecided');
		const accepted = { ...conflict, decision: { requestId: 'r1', kind: 'risk' as const, reason: 'It retires later.', by: 'a', at: 'now' } };
		expect(shown(accepted, true)).toContain('Conflict accepted as a risk: It retires later.');
		expect(shown(accepted, true)).not.toContain('>Accept the risk<');
	});
});

describe('the words of the order and of a landing (EVO-005)', () => {
	it('orders only a pair that shares something', () => {
		expect(orderWords({ key: 'EVO-2', verdict: 'spec_pending', order: null, decision: null })).toBeNull();
		expect(orderWords({ key: 'EVO-2', verdict: 'conflict', order: 'before', decision: { kind: 'order', reason: '' } })).toEqual({ line: 'Lands before this one', decided: 'Conflict decided by the order.' });
	});

	it('says a landing read again, one whose readings did not run, and one read at the Impact analysis [criterion:ac-leaf-7e16f2cb-15c1-442e-9f35-1179bce7e198]', () => {
		expect(landedNoticeWords({ key: 'EVO-2', on: ['Cart'], upToDate: true, neverRead: false })).toEqual({ line: 'EVO-2 landed on Cart, read again on the new version.', stale: false });
		expect(landedNoticeWords({ key: 'EVO-2', on: ['Cart'], upToDate: false, neverRead: false }).stale).toBe(true);
		expect(landedNoticeWords({ key: 'EVO-2', on: [], upToDate: false, neverRead: true }).line).toBe('EVO-2 landed: this request is read on the new version at its Impact analysis.');
	});
});
