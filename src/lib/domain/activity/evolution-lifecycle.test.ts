import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type EvolutionRequest, type HistoryEntry } from '$domain/evolution';
import { notificationsFor, type ActivityEvent } from './activity';
import { evolutionActivity, workingOn } from './evolution-activity';

/** The life of an evolution as its notifications tell it (criterion 4bf1182d of feat-feedback-docs). */

const members = [
	{ id: 'lea@x.io', name: 'Léa Moreau' },
	{ id: 'hugo@x.io', name: 'Hugo Bernard' },
	{ id: 'carmen@x.io', name: 'Carmen Martin' },
	{ id: 'tom@x.io', name: 'Tom Roux' }
];
const entry = (id: string, type: HistoryEntry['type'], authorId: string, recordedAt: string, authorKind: HistoryEntry['authorKind'] = 'person'): HistoryEntry => ({
	id,
	type,
	summary: type,
	authorId,
	authorKind,
	recordedAt,
	proposalId: null,
	acceptedByPersonId: null,
	supersededById: null,
	channel: 'page'
});

function request(over: Partial<EvolutionRequest> = {}): EvolutionRequest {
	return createEvolutionRequest({
		id: 'r1',
		title: 'Bulk task export',
		createdAt: '2026-11-01T08:00:00.000Z',
		requester: 'lea@x.io',
		leafIds: ['f-export', 'f-tasks', 'f-perms', 'f-projects'],
		history: [entry('h1', 'stage_crossing', 'lea@x.io', '2026-11-01T08:00:01.000Z'), entry('h2', 'field_signature', 'hugo@x.io', '2026-11-02T08:00:00.000Z')],
		...over
	});
}
const read = (e: ActivityEvent | undefined) => (e?.notice?.body ?? []).map((r) => (r.strong ? `**${r.text}**` : r.text)).join('');
const of = (events: ActivityEvent[], title: string) => events.find((e) => e.notice?.title === title);

describe('an evolution tells its life: created, simulated, approved, built, amended, cancelled, certified [criterion:4bf1182d]', () => {
	it('tells the whole project but its author that an evolution was created, with its sheet', () => {
		const events = evolutionActivity('tsk', { requests: [request()] }, members);
		const e = of(events, 'A new evolution was created.');
		expect(e).toMatchObject({ team: true, notice: { section: 'Evolution', level: 'info', action: { label: 'Open the evolution' } } });
		expect(read(e)).toBe('**“Bulk task export”** (EVO-001) is open in Draft. No impact report has been run yet. **Léa Moreau** opened it.');
		expect(e?.notice?.line).toBe('“Bulk task export” was added by Léa Moreau.');
		expect(notificationsFor(events, 'tom@x.io').map((x) => x.notice?.title)).toContain('A new evolution was created.');
		expect(notificationsFor(events, 'lea@x.io').map((x) => x.notice?.title)).not.toContain('A new evolution was created.');
	});

	it('tells the people who work on it that the impact report is ready, with the features it touches', () => {
		const r = request({
			impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: '2026-11-03T09:00:00.000Z' },
			impactFindings: [
				{ id: 'i1', nodeId: 'n1', nodeLabel: 'Export', nodeKind: 'feature', groupPath: ['Tasks'] },
				{ id: 'i2', nodeId: 'n2', nodeLabel: 'Export a project', nodeKind: 'action', groupPath: ['Tasks', 'Permissions'] }
			] as unknown as EvolutionRequest['impactFindings']
		});
		const events = evolutionActivity('tsk', { requests: [r] }, members);
		const e = of(events, 'The impact report is ready.');
		expect(read(e)).toBe('Lyriks simulated “Bulk task export” against the current specification: it touches **4 features** and moves **2 elements**.');
		expect(e?.notice?.visual).toMatchObject({ kind: 'chips', chips: [{ label: 'Export' }, { label: 'Permissions' }], figures: [{ n: '4' }, { n: '2' }] });
		expect(e?.to).toEqual(['lea@x.io', 'hugo@x.io']);
		expect(notificationsFor(events, 'tom@x.io').some((x) => x.notice?.title === 'The impact report is ready.')).toBe(false);
	});

	it('tells of breaking impacts only for blocking findings the request caused and nobody accepted', () => {
		const finding = (id: string, severity: string, more: object = {}) => ({ id, axis: 'rules', severity, title: `Finding ${id}`, requestNodeId: 'a', existingNodeId: 'b', fixNowTarget: '', published: true, ...more });
		const r = request({
			coherenceReport: { status: 'ready', projectScore: 80, requestDelta: -4, ranAt: '2026-11-03T10:00:00.000Z' },
			coherenceFindings: [
				finding('c1', 'blocking'),
				finding('c2', 'blocking', { scope: 'inherited' }),
				finding('c3', 'blocking', { risk: { by: 'hugo@x.io', at: '2026-11-03T11:00:00.000Z', reason: 'known' } }),
				finding('c4', 'major')
			] as unknown as EvolutionRequest['coherenceFindings']
		});
		const e = of(evolutionActivity('tsk', { requests: [r] }, members), 'The simulation found breaking impacts.');
		expect(e?.notice?.level).toBe('drift');
		expect(read(e)).toBe('Lyriks checked “Bulk task export” against the current specification: **1 blocking contradiction** would hold it at the gate, starting with “Finding c1”.');
		const clean = request({ ...r, coherenceFindings: [finding('c4', 'major')] as unknown as EvolutionRequest['coherenceFindings'] });
		expect(of(evolutionActivity('tsk', { requests: [clean] }, members), 'The simulation found breaking impacts.')).toBeUndefined();
	});

	it('tells that an evolution was approved when it crosses into Build, stamped with its version', () => {
		const r = request({ frozenVersions: [{ version: 1, at: '2026-11-04T09:00:00.000Z', by: 'hugo@x.io' }], stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: 'carmen@x.io', kind: 'person', at: '2026-11-03T09:00:00.000Z' }] }] as unknown as EvolutionRequest['stepValidations'] });
		const e = of(evolutionActivity('tsk', { requests: [r] }, members), 'An evolution was approved.');
		expect(read(e)).toBe('**“Bulk task export”** crossed into Build: its specification is frozen at **version 1** and implementation can start. **Hugo Bernard** approved it.');
		expect(e?.notice?.visual).toEqual({ kind: 'stamp', word: 'Approved', line: 'Version 1 · ready to build', people: [{ id: 'carmen@x.io', name: 'Carmen Martin' }, { id: 'hugo@x.io', name: 'Hugo Bernard' }] });
	});

	it('tells that implementation started at its first commit, with the commits of the last 14 days', () => {
		const r = request({
			history: [...request().history, entry('c1', 'code_commit', 'hugo@x.io', '2026-11-05T09:00:00.000Z', 'ai_client'), entry('c2', 'code_commit', 'hugo@x.io', '2026-11-05T15:00:00.000Z', 'ai_client'), entry('c3', 'code_commit', 'hugo@x.io', '2026-11-06T09:00:00.000Z', 'ai_client')]
		});
		const e = of(evolutionActivity('tsk', { requests: [r] }, members), 'Implementation has started.');
		expect(e).toMatchObject({ at: '2026-11-05T09:00:00.000Z', notice: { section: 'Implementation', line: 'Work began on “Bulk task export”.' } });
		expect(e?.notice?.visual?.kind === 'histogram' && e.notice.visual.days).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
	});

	it('tells that the specification changed during implementation, naming the version the code follows', () => {
		const r = request({ frozenVersions: [{ version: 2, at: '2026-11-04T09:00:00.000Z', by: 'hugo@x.io' }], history: [...request().history, entry('a1', 'spec_amended', 'hugo@x.io', '2026-11-05T10:00:00.000Z')] });
		const e = of(evolutionActivity('tsk', { requests: [r] }, members), 'The specification changed during implementation.');
		expect(e?.notice?.level).toBe('drift');
		expect(read(e)).toBe('The specification of “Bulk task export” was amended after **version 2** froze: the code built so far follows that version. **Hugo Bernard** amended it.');
		expect(e?.notice?.visual?.kind === 'chain' && e.notice.visual.nodes.map((n) => `${n.kicker} ${n.title}`)).toEqual(['Version 2 Frozen Nov 4', 'Amended Nov 5', 'Next Freeze again']);
	});

	it('tells that an evolution was cancelled, quoting why, and only while it stays cancelled', () => {
		const cancellation = { reason: 'Covered by Recurring tasks.', by: 'carmen@x.io', at: '2026-11-05T11:00:00.000Z' };
		const e = of(evolutionActivity('tsk', { requests: [request({ status: 'cancelled', cancellation })] }, members), 'An evolution was cancelled.');
		expect(read(e)).toBe('**“Bulk task export”** was cancelled. What it wrote into the specification stays. **Carmen Martin** cancelled it.');
		expect(e?.notice?.visual).toMatchObject({ kind: 'people', quote: 'Covered by Recurring tasks.', rows: [{ badge: 'Cancelled' }] });
		expect(of(evolutionActivity('tsk', { requests: [request({ cancellation })] }, members), 'An evolution was cancelled.')).toBeUndefined();
	});

	it('certifies an evolution declared live to the whole project but the person who declared it', () => {
		const r = request({ deployment: { releaseId: null, note: '', declaredBy: 'hugo@x.io', declaredAt: '2026-11-06T09:00:00.000Z' } });
		const events = evolutionActivity('tsk', { requests: [r] }, members);
		const e = of(events, 'The evolution is now part of the specification.');
		expect(e).toMatchObject({ team: true, notice: { section: 'Specification', level: 'certified', action: { label: 'See the updated specification' } } });
		expect(read(e)).toBe('**“Bulk task export”** is live and certified: the specification now holds what it changed, across **4 features**. **Hugo Bernard** declared it live.');
		expect(notificationsFor(events, 'tom@x.io').some((x) => x === e)).toBe(true);
		expect(notificationsFor(events, 'hugo@x.io').some((x) => x === e)).toBe(false);
	});

	it('counts as working on it its requester and whoever validated, signed or wrote on it, each once', () => {
		expect(workingOn(request({ requester: 'Léa (typed by hand)' }), members)).toEqual(['lea@x.io', 'hugo@x.io']);
	});
});
