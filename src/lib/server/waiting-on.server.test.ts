import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, stepTarget, type EvolutionRequest } from '$domain/evolution';
import { waitingOnOf } from './evolution-view.server';

const version = (key: string, id: string) => ({ id, key, value: 'Written.', by: 'ana@team.test', byKind: 'person' as const, source: 'typed' as const, proposalId: null, at: '2026-10-22T09:00:00.000Z' });
const request = (over: Partial<EvolutionRequest>) =>
	createEvolutionRequest({ id: 'req-1', title: 'Pickup reminders', origin: 'customer_feedback', stage: 'specification', ...over });

/** Who a request waits on, read by the board (ac-evo-board-waiting-on-you). */
describe('the board reads who a request waits on [criterion:ac-leaf-ac-evo-board-waiting-on-you]', () => {
	it('names the people named on a written answer who have not validated it yet', () => {
		const waiting = request({
			fieldVersions: [version('00-need.situation', 'v1')],
			fieldValidations: [{ key: '00-need.situation', versionId: 'v1', by: 'bo@team.test', byKind: 'person', at: '2026-10-22T09:05:00.000Z' }],
			namedValidators: [{ target: '00-need.situation', people: ['bo@team.test', 'cy@team.test'], gone: [] }]
		});
		expect(waitingOnOf(waiting)).toEqual(['cy@team.test']);
	});

	it('waits on nobody for an answer not written yet, nor for an Approval not due', () => {
		expect(waitingOnOf(request({ namedValidators: [{ target: '00-need.situation', people: ['bo@team.test'], gone: [] }] }))).toEqual([]);
		const approval = { namedValidators: [{ target: stepTarget('approval'), people: ['bo@team.test'], gone: [] }] };
		expect(waitingOnOf(request(approval))).toEqual([]);
		expect(waitingOnOf(request({ ...approval, stage: 'acceptance' }))).toEqual(['bo@team.test']);
	});
});
