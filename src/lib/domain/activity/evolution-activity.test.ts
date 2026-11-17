import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type EvolutionRequest } from '$domain/evolution';
import { lineFor, notificationsFor } from './activity';
import { dossierPlace, evolutionActivity } from './evolution-activity';

const members = [
	{ id: 'dylan@x.io', name: 'Dylan Martin' },
	{ id: 'carmen@x.io', name: 'Carmen Roux' },
	{ id: 'sarah@x.io', name: 'Sarah Klein' }
];

function request(over: Partial<EvolutionRequest>): EvolutionRequest {
	return createEvolutionRequest({
		id: 'r1',
		title: 'Multi-currency invoicing',
		createdAt: '2026-10-20T08:00:00.000Z',
		history: [
			{ id: 'h1', type: 'stage_crossing', summary: 'opened', authorId: 'dylan@x.io', authorKind: 'person', recordedAt: '2026-10-20T08:00:01.000Z', proposalId: null, acceptedByPersonId: null, supersededById: null, channel: 'page' }
		],
		...over
	});
}

describe('evolution activity', () => {
	it('names the place of an answer the way the request page does', () => {
		expect(dossierPlace('00-need.objectives')).toEqual({ step: 'Briefing', title: 'Target situation' });
		expect(dossierPlace('request.origin')).toEqual({ step: 'Briefing', title: 'Request origin' });
		expect(dossierPlace('step.technical_spec.data')).toEqual({ step: 'Solution', title: 'Technical requirements' });
		expect(dossierPlace('05-functional.acceptance@leaf-1')).toEqual({ step: 'Specification', title: 'A feature' });
	});

	it('reads the opening of a request from its first recorded act, and skips deleted ones', () => {
		const events = evolutionActivity('fac', { requests: [request({}), request({ id: 'r2', status: 'deleted' })] }, members);
		const created = events.filter((e) => e.kind === 'created');
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ actor: { id: 'dylan@x.io', kind: 'person' }, line: 'created the evolution EVO-001 · Multi-currency invoicing', where: 'Evolutions' });
		expect(created[0].href).toBe('/projects/fac/evolution?request=r1');
	});

	it('groups the validations a person gave on one step in one sitting, and leaves refusals out', () => {
		const at = (min: number) => new Date(Date.parse('2026-10-21T09:00:00.000Z') + min * 60000).toISOString();
		const r = request({
			fieldValidations: [
				{ key: '00-need.objectives', versionId: 'v1', by: 'sarah@x.io', byKind: 'person', at: at(0) },
				{ key: '00-need.measures', versionId: 'v2', by: 'sarah@x.io', byKind: 'person', at: at(1) },
				{ key: '00-need.situation', versionId: 'v3', by: 'sarah@x.io', byKind: 'person', at: at(2) },
				{ key: '00-need.cost', versionId: 'v4', by: 'sarah@x.io', byKind: 'person', at: at(40) },
				{ key: '00-need.symptoms', versionId: 'v5', by: 'carmen@x.io', byKind: 'person', at: at(41), verdict: 'refused' }
			]
		});
		const lines = evolutionActivity('fac', { requests: [r] }, members)
			.filter((e) => e.kind === 'validated')
			.map((e) => `${e.actor.id} ${e.line} @ ${e.where}`);
		expect(lines).toEqual([
			'sarah@x.io validated 3 answers @ EVO-001 · Briefing',
			'sarah@x.io validated “Current situation” @ EVO-001 · Briefing'
		]);
	});

	it('tells a person they were named or answered, and never notifies their own acts', () => {
		const r = request({
			fieldThreads: [
				{
					id: 't1',
					key: '00-need.objectives',
					state: 'open',
					changeValue: null,
					changedBy: null,
					changedAt: null,
					messages: [
						{ id: 'm1', author: 'dylan@x.io', authorKind: 'person', body: 'Should we add payment times?', postedAt: '2026-10-22T10:00:00.000Z' },
						{ id: 'm2', author: 'sarah@x.io', authorKind: 'person', body: 'Agreed, let us add it.', postedAt: '2026-10-22T11:00:00.000Z', replyTo: 'm1' },
						{ id: 'm3', author: 'carmen@x.io', authorKind: 'person', body: '@Dylan which rounding rule?', postedAt: '2026-10-22T12:00:00.000Z' },
						{ id: 'm4', author: 'sarah@x.io', authorKind: 'person', body: 'secret', postedAt: '2026-10-22T13:00:00.000Z', privateTo: 'sarah@x.io' }
					]
				}
			]
		});
		const events = evolutionActivity('fac', { requests: [r] }, members);
		const forDylan = notificationsFor(events, 'dylan@x.io')
			.filter((e) => e.kind !== 'created')
			.map((e) => `${e.actor.id} ${lineFor(e, 'dylan@x.io')}`);
		expect(forDylan).toEqual(['carmen@x.io mentioned you', 'sarah@x.io replied to your comment']);
		// Whom a message does not concern reads what was done, not "you".
		expect(events.filter((e) => e.kind === 'mention').map((e) => lineFor(e, 'sarah@x.io'))).toEqual(['wrote on “Target situation”']);
		// The creation of the request is the team's news, not hers.
		expect(notificationsFor(events, 'sarah@x.io').filter((e) => e.kind !== 'created')).toEqual([]);
		expect(events.some((e) => e.text === 'secret')).toBe(false);
		expect(events.find((e) => e.kind === 'comment')?.line).toBe('opened a discussion on “Target situation”');
	});

	it('tells a person what their AI finished for them, and nobody else', () => {
		const r = request({
			aiClicks: [
				{ id: 'c1', personId: 'dylan@x.io', kind: 'prefill', fieldPath: '00-need.situation', leafId: null, at: '2026-10-23T08:00:00.000Z', state: 'answered', answeredAt: '2026-10-23T08:02:00.000Z' },
				{ id: 'c2', personId: 'dylan@x.io', kind: 'prefill', fieldPath: '00-need.cost', leafId: null, at: '2026-10-23T09:00:00.000Z', state: 'answered', answeredAt: '2026-10-23T09:01:00.000Z', answeredNothing: true }
			]
		});
		const events = evolutionActivity('fac', { requests: [r] }, members);
		const mine = notificationsFor(events, 'dylan@x.io');
		expect(mine).toHaveLength(1);
		expect(mine[0]).toMatchObject({ kind: 'ai_done', text: 'Prefilled “Current situation” of EVO-001.', where: 'EVO-001 · Briefing' });
		expect(notificationsFor(events, 'sarah@x.io').filter((e) => e.kind !== 'created')).toEqual([]);
	});

	it('tells each validation by its author and its place', () => {
		const r = request({
			fieldValidations: [
				{ key: '00-need.objectives', versionId: 'v1', by: 'sarah@x.io', byKind: 'person', at: '2026-10-21T09:00:00.000Z' },
				{ key: 'step.solution.description', versionId: 'v2', by: 'dylan@x.io', byKind: 'person', at: '2026-10-22T09:00:00.000Z' }
			]
		});
		const events = evolutionActivity('fac', { requests: [r] }, members);
		expect(events.filter((e) => e.kind === 'validated').map((e) => [e.actor.id, e.line])).toEqual([
			['sarah@x.io', 'validated “Target situation”'],
			['dylan@x.io', 'validated “Functional requirements”']
		]);
	});
});
