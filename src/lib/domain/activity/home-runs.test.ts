import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type EvolutionRequest } from '$domain/evolution';
import { evolutionNext, evolutionPercent } from './evolution-progress';
import { homeRuns, runGroups, runMark, type HomeRunCard, type RunContext } from './home-runs';
import type { HomeRun, HomeSource } from './home-source';
import { NO_READS } from './reads';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const ctx: RunContext = {
	me: 'me@x.io',
	roster: [
		{ id: 'me@x.io', name: 'Dylan Martin' },
		{ id: 'lea@x.io', name: 'Léa Petit' }
	],
	now: NOW
};

const req = (over: Partial<EvolutionRequest>): EvolutionRequest =>
	createEvolutionRequest({ id: 'r1', title: 'Multi-currency invoicing', createdAt: '2026-10-20T08:00:00.000Z', ...over });
const source = (over: Partial<HomeSource>): HomeSource => ({ id: 'fac', name: 'Facturo', requests: [], reads: NO_READS, run: null, drift: null, mayEdit: true, ...over });
const run = (over: Partial<HomeRun>): HomeRun => ({
	state: 'running',
	title: 'Reverse-Specification of Facturo',
	source: 'From the code',
	detail: '62 % read',
	href: '/projects/fac/retrospec',
	at: '2026-10-26T10:00:00.000Z',
	pct: 62,
	...over
});

const FULL_NEED = { description: 'Invoices in several currencies', situation: 'Euro only', symptoms: 'Lost deals', cost: '3 a month', objectives: 'Bill in USD and GBP', measures: 'Deals kept' };

describe('evolution progress', () => {
	it('reads the next act of a request from its stage and its validated steps', () => {
		expect(evolutionNext(req({}))).toMatchObject({ step: 1, action: 'Write the Briefing' });
		expect(evolutionNext(req({ stage: 'coherence' }))).toMatchObject({ step: 4, stepName: 'Simulation' });
		expect(evolutionNext(req({ stage: 'delivered' }))).toBeNull();
		expect(evolutionNext(req({ status: 'cancelled' }))).toBeNull();
		expect(evolutionPercent(evolutionNext(req({ stage: 'implementation' })))).toBe(67);
		expect(evolutionNext(req({ need: { ...FULL_NEED, situation: '', objectives: '' } }))?.action).toBe('Finish the Briefing');
		expect(evolutionNext(req({ need: FULL_NEED }))?.action).toBe('Validate the Briefing');
	});
});

describe('Running now tells what Lyriks is doing for the reader [criterion:ee8adfec]', () => {
	const one = (r: HomeRun) => homeRuns([source({ run: r })], ctx)[0] as HomeRunCard | undefined;

	it('reads a Reverse-Specification running, inactive or waiting, and leaves a validated one out', () => {
		expect(one(run({}))).toMatchObject({ kind: 'reverse_specification', label: 'Reverse-Specification', state: 'running', line: '62 % read', pct: 62, href: '/projects/fac/retrospec' });
		expect(one(run({ pct: 93, detail: '93 % read' }))?.state).toBe('running');
		expect(one(run({ state: 'paused', detail: 'Stopped at 62 %: your LLM stopped calling Lyriks' }))).toMatchObject({ state: 'inactive', line: 'Stopped at 62 %: your LLM stopped calling Lyriks' });
		expect(one(run({ state: 'review', detail: '1 of 3 validated', pct: 33 }))).toMatchObject({ state: 'waiting', line: 'In review · 1 of 3 validated' });
		expect(one(run({ state: 'not_launched', detail: 'The prompt was not run yet', pct: 0 }))?.state).toBe('waiting');
		expect(one(run({ state: 'validated', pct: 100 }))).toBeUndefined();
	});

	it('reads an evolution an AI works on as running, and one whose step waits on the reader as waiting', () => {
		const live = req({ id: 'r9', liveSessions: [{ id: 's1', personId: 'lea@x.io', startedAt: '2026-10-26T11:50:00.000Z' }] });
		const asked = req({
			id: 'r2',
			need: FULL_NEED,
			stepValidations: [
				{ step: 'need', validatorIds: [], validations: [{ by: 'lea@x.io', kind: 'person', at: '2026-10-21T08:00:00.000Z' }] },
				{ step: 'solution', validatorIds: [], validations: [{ by: 'lea@x.io', kind: 'person', at: '2026-10-21T08:00:00.000Z' }] }
			],
			stepDescriptions: { ...req({}).stepDescriptions, solution: 'a', functional_spec: 'b', technical_spec: 'c' },
			namedValidators: [{ target: 'step:functional_spec', people: ['lea@x.io', 'me@x.io'], gone: [] }]
		});
		const idle = req({ id: 'r3' });
		const delivered = req({ id: 'r4', stage: 'delivered' });
		const runs = homeRuns([source({ requests: [live, asked, idle, delivered], keys: { r9: 'EVO-077' } })], ctx);
		expect(runs.map((r) => [r.label, r.state, r.line])).toEqual([
			['EVO-002', 'waiting', 'Step 2 of 6 · Finish the Solution · waiting for you'],
			['EVO-077', 'running', 'Lyriks for Léa P. is working on the Briefing']
		]);
		expect(runs[0]).toMatchObject({ kind: 'evolution', href: '/projects/fac/evolution?request=r2' });
	});

	it('puts INACTIVE first, then WAITING and RUNNING, the furthest first within', () => {
		const runs = homeRuns(
			[
				source({ id: 'a', name: 'Alpha', run: run({ pct: 40 }) }),
				source({ id: 'b', name: 'Beta', run: run({ pct: 95 }) }),
				source({ id: 'c', name: 'Gamma', run: run({ state: 'paused' }) }),
				source({ id: 'd', name: 'Delta', run: run({ state: 'complete', pct: 100 }) })
			],
			ctx
		);
		expect(runs.map((r) => [r.project, r.state])).toEqual([
			['Gamma', 'inactive'],
			['Delta', 'waiting'],
			['Beta', 'running'],
			['Alpha', 'running']
		]);
	});

	it('reads as one list up to five runs, then grouped under their state', () => {
		const card = (state: HomeRunCard['state'], i: number): HomeRunCard => ({ id: `r${i}`, projectId: 'p', project: 'P', kind: 'evolution', label: 'EVO-001', state, line: '', pct: 0, href: '/' });
		expect(runGroups([])).toEqual([]);
		const five = ['running', 'waiting', 'running', 'inactive', 'running'].map((s, i) => card(s as HomeRunCard['state'], i));
		expect(runGroups(five).map((g) => [g.state, g.runs.length])).toEqual([[null, 5]]);
		const six = [...five, card('waiting', 6)];
		expect(runGroups(six).map((g) => [g.state, g.runs.length])).toEqual([
			['inactive', 1],
			['waiting', 2],
			['running', 3]
		]);
	});
});

describe('a run put aside is hidden for its state [action:a6a79b22]', () => {
	it('marks the run and its state, so a run that moves on shows again', () => {
		expect(runMark({ id: 'retro:p1', state: 'inactive' })).toBe('run:retro:p1:inactive');
		expect(runMark({ id: 'retro:p1', state: 'running' })).not.toBe(runMark({ id: 'retro:p1', state: 'inactive' }));
	});
});
