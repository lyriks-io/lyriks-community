import { describe, expect, it } from 'vitest';
import { carrierOfLine, deferredCarriers, deferredSuggestions } from './deferred-suggestions';
import type { EvolutionRequest, ImplementationFinding } from './draft';

const line = (id: string, over: Partial<ImplementationFinding> = {}) =>
	({ id, iteration: 1, verdict: 'missing', decision: 'validated', requirement: 'Export › rule "No link to export"', specStatement: `Spec of ${id}`, scope: 'request', leafId: 'feat-x', ...over }) as ImplementationFinding;

const request = (id: string, lines: ImplementationFinding[] = [], over: Partial<EvolutionRequest> = {}) =>
	({ id, iteration: 1, status: 'open', implementationFindings: lines, ...over }) as EvolutionRequest;

describe('a deferred omission reads as a suggestion for as long as it stays deferred [criterion:35991202]', () => {
	it('offers one suggestion per deferred omission, named after it and its request', () => {
		expect(deferredSuggestions([request('a', [line('l1')])])).toEqual([
			{ lineId: 'l1', title: 'No link to export', statement: 'Spec of l1', leafId: 'feat-x', fromRequestId: 'a', fromKey: 'EVO-001' }
		]);
	});

	it('is gone as soon as the choice is taken back, with nothing left behind', () => {
		expect(deferredSuggestions([request('a', [line('l1', { decision: 'undecided' })])])).toEqual([]);
		expect(deferredSuggestions([request('a', [line('l1', { decision: 'invalidated' })])])).toEqual([]);
	});

	it('offers nothing for a gap kept as built, an inherited line, an older iteration or a cancelled request', () => {
		expect(deferredSuggestions([request('a', [line('l1', { verdict: 'non_conform' })])])).toEqual([]);
		expect(deferredSuggestions([request('a', [line('l1', { requirement: 'Data change: amends table "Domain"' })])])).toEqual([]);
		expect(deferredSuggestions([request('a', [line('l1', { scope: 'inherited' })])])).toEqual([]);
		expect(deferredSuggestions([request('a', [line('l1', { iteration: 0 })])])).toEqual([]);
		expect(deferredSuggestions([request('a', [line('l1')], { status: 'cancelled' })])).toEqual([]);
	});
});

describe('a started suggestion leaves the list and its line names the evolution [criterion:03b7eacf]', () => {
	const carrier = (status: EvolutionRequest['status'] = 'open') => request('b', [], { status, deferredFrom: { requestId: 'a', lineId: 'l1' } });

	it('leaves the list once an evolution carries its line, and the line names it', () => {
		const requests = [request('a', [line('l1')]), carrier()];
		expect(deferredSuggestions(requests)).toEqual([]);
		expect(deferredCarriers(requests, requests[0])).toEqual({ l1: { id: 'b', key: 'EVO-002' } });
	});

	it('comes back when the evolution is cancelled or deleted, the line still deferred', () => {
		expect(deferredSuggestions([request('a', [line('l1')]), carrier('cancelled')]).map((s) => s.lineId)).toEqual(['l1']);
		expect(deferredSuggestions([request('a', [line('l1')])]).map((s) => s.lineId)).toEqual(['l1']);
	});

	it('leaves the evolution as it is when the deferral is taken back', () => {
		const requests = [request('a', [line('l1', { decision: 'undecided' })]), carrier()];
		expect(carrierOfLine(requests, 'l1')?.id).toBe('b');
		expect(deferredSuggestions(requests)).toEqual([]);
		expect(deferredCarriers(requests, requests[0])).toEqual({});
	});
});
