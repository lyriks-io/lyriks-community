import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, findingHoldsGate, readAgainOf, type EvolutionRequest } from '$domain/evolution';
import { landedNoticeWords, orderWords } from '$ui/evolution/impact-board';
import { F, NOW, REQUEST, given, read, requestOf, seed, send, stored, worldOf, type State, type WorldOptions } from './simulation-readings.fixture';

// The deadline of the behaviour verification a coherence reading waits for: short, so a late one is late within a test.
vi.mock('$env/dynamic/private', async (original) => ({
	env: { ...(await original<{ env: Record<string, string | undefined> }>()).env, LYRIKS_EVO_BEHAVIOUR_READ_MS: '40' }
}));
vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./simulation-readings.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
// What a landing queues is recorded; the queued readings run when the test lets them, and it waits for them to finish.
const queue = vi.hoisted(() => ({ ids: [] as string[], run: false }));
vi.mock('$lib/server/evolution-read-again.server', async (original) => {
	const real = await original<typeof import('$lib/server/evolution-read-again.server')>();
	return {
		...real,
		readAgainInBackground: (requests: Parameters<typeof real.readAgainInBackground>[0], run: Parameters<typeof real.readAgainInBackground>[1]) => {
			queue.ids.push(...requests.map((r) => r.id));
			if (queue.run) real.readAgainInBackground(requests, run);
		}
	};
});
const { readAgainSettled } = await import('$lib/server/evolution-read-again.server');

/**
 * The scenarios of "Read the change again after another request landed"
 * (action d632b48b of feat-32, as EVO-005 spec version 1 has them), run
 * against the real code: the event is another request declared live through
 * POST /api/evolution and the real batch; this request is read back from the
 * store. It succeeds when this request is told and its readings are to run
 * again on the new version; it is refused, nothing moving for it, when it is
 * not under way or shares nothing with the one that landed.
 */

const SURFACE = 'b8f8a781';
const ACTION = 'd632b48b';
/** The request that lands: EVO-002 once this one is EVO-001. */
const LANDING = '7a0b1c2d-0000-4000-8000-000000000002';
const QUIET = '7a0b1c2d-0000-4000-8000-000000000003';

/** An approved request amending `feature` with a criterion only, ready to be declared live. */
function approved(id: string, feature: string, title = 'Validate the elements of a specification'): EvolutionRequest {
	return createEvolutionRequest({
		id,
		title,
		stage: 'delivered',
		status: 'open',
		specVersion: 1,
		frozen: true,
		leafIds: [feature],
		drafts: [createDraftLeaf({ id: `draft:${id}`, kind: 'amend', baseLeafId: feature, acceptanceCriteria: [{ id: `c-${id}`, text: 'A validated element reads validated.' }] })]
	});
}

/** This request at the Impact analysis, its readings in, up to date with its drafts. */
const READ: State = { 'request.stage': 'coherence', 'impact.status': 'ready', 'impact.upToDate': true, 'coherence.status': 'ready', 'coherence.upToDate': true };

/** The paths of the action, read off this request as the store holds it. */
function stateAfter(request: EvolutionRequest): State {
	const latest = readAgainOf(request)[0];
	const since = (at: string | null) => at !== null && (!latest || at >= latest.landing.at);
	return {
		'impact.upToDate': since(request.impactReport.ranAt),
		'coherence.upToDate': since(request.coherenceReport.ranAt),
		'simulation.landedNotice': (request.otherLandings ?? []).length > 0,
		'coherence.blockingUndecided': request.coherenceFindings.filter(findingHoldsGate).length
	};
}

interface Case {
	readonly id: string;
	readonly name: string;
	readonly given: State;
	/** The landing touches another feature than the one this request amends. */
	readonly sharesNothing?: boolean;
	readonly draftsApply?: boolean;
	readonly expected: 'success' | 'blocked';
	readonly then?: State;
}

const SCENARIOS: readonly Case[] = [
	{
		id: '06d219da',
		name: 'A request sharing a feature is read again when another one lands',
		given: READ,
		expected: 'success',
		then: { 'impact.upToDate': false, 'coherence.upToDate': false, 'simulation.landedNotice': true }
	},
	{ id: 'a0dacbeb', name: 'A draft that no longer applies reads as a blocking finding', given: READ, draftsApply: false, expected: 'success', then: { 'coherence.blockingUndecided': 1 } },
	{ id: 'd1a1e7d4', name: 'A request sharing nothing is not read again', given: READ, sharesNothing: true, expected: 'blocked' },
	{ id: '89991174', name: 'A cancelled request is not read again', given: { ...READ, 'request.status': 'cancelled' }, expected: 'blocked' }
];

/** Store this request beside the one about to land, declare that one live, and let what it queued run when asked. */
async function land(state: State, more: WorldOptions & { readonly feature?: string; readonly runQueued?: boolean } = {}) {
	const here = requestOf(state);
	const w = seed(worldOf(state, {}, { requests: [here, approved(LANDING, more.feature ?? F), ...(more.requests ?? [])], draftsApply: more.draftsApply, behaviourReadInTime: more.behaviourReadInTime }));
	queue.run = more.runQueued === true;
	const outcome = await send(w, [{ op: 'declare_deployment', requestId: LANDING }]);
	expect(outcome.status).toBe('success');
	await readAgainSettled();
	return { w, outcome, here: stored(REQUEST) };
}

beforeEach(() => {
	queue.ids = [];
	queue.run = false;
});

describe('Read the change again after another request landed, as the landing of another request through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = given(scenario.given);
			// A blocking finding is only met once the readings ran again on the new version.
			const { here } = await land(state, { feature: scenario.sharesNothing ? 'feat-pay' : F, draftsApply: scenario.draftsApply, runQueued: scenario.draftsApply === false });
			const final = stateAfter(here);
			expect(final['simulation.landedNotice'] ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(final).toMatchObject(scenario.then ?? {});
				return;
			}
			// Nothing moves for it: its readings stay as they were, nothing is queued.
			expect(queue.ids).not.toContain(REQUEST);
			expect(final).toMatchObject({ 'impact.upToDate': true, 'coherence.upToDate': true });
		});
	}
});

describe('Requests under way read again after a landing (EVO-005)', () => {
	it('every request under way sharing a feature with the one that landed has its impact and coherence run again on the new specification [criterion:ac-leaf-ce79c746-a4b8-40fe-93e8-5c1f5ba2f02f]', async () => {
		const { here } = await land(given(READ), { runQueued: true });
		expect(here.impactReport.ranAt).toBe(NOW);
		expect(here.coherenceReport.ranAt).toBe(NOW);
		expect(readAgainOf(here)[0]).toMatchObject({ upToDate: true, neverRead: false });
	});

	it('a landing queues the readings of every request under way it shares a feature or a table with [criterion:ac-leaf-cd5444e7-2879-47bd-a844-ccccd8c78fc7]', async () => {
		const state = given(READ);
		const quiet = { ...requestOf(state, {}, QUIET), drafts: [createDraftLeaf({ id: 'draft:quiet', kind: 'amend', baseLeafId: 'feat-ship' })], leafIds: ['feat-ship'] };
		await land(state, { requests: [quiet] });
		expect(queue.ids).toEqual([REQUEST]);
	});

	it('the Simulation of such a request opens on the request that landed, on what, and what that changes for it [criterion:ac-leaf-550bcc24-1398-4d13-8d6a-a6ce1f37e622]', async () => {
		const state = given(READ);
		await land(state, { runQueued: true });
		const run = await read(worldOf(state, {}, { requests: [stored(REQUEST), stored(LANDING)] }), `&requestId=${REQUEST}`);
		const landings = ((run.body?.request as Record<string, unknown>).landingOrder as { otherLandings: { key: string; on: string[]; upToDate: boolean; neverRead: boolean }[] }).otherLandings;
		expect(landings).toHaveLength(1);
		expect(landings[0]).toMatchObject({ key: 'EVO-002', on: ['Cart'], upToDate: true });
		expect(landedNoticeWords(landings[0]).line).toBe('EVO-002 landed on Cart, read again on the new version.');
		expect(stored(REQUEST).history.map((h) => h.summary)).toContain('EVO-002 landed on Cart: read again on the new version');
	});

	it('a draft that no longer applies after another landing reads as a blocking finding naming what moved [criterion:ac-leaf-a2d5cd08-335f-44d7-983a-0a81c82ba452]', async () => {
		const { here } = await land(given(READ), { runQueued: true, draftsApply: false });
		const blocking = here.coherenceFindings.filter(findingHoldsGate);
		expect(blocking).toHaveLength(1);
		expect(blocking[0].title).toBe('The behaviour drafted on Cart no longer applies: action a1 no longer exists. Rework it in the drafts before the build.');
	});

	it('if the readings cannot run again, the Simulation says it reads the version before that landing and offers to read again [criterion:ac-leaf-7e16f2cb-15c1-442e-9f35-1179bce7e198]', async () => {
		const state = given(READ);
		await land(state, { runQueued: true, behaviourReadInTime: false });
		// The behaviour verification did not answer in time: the coherence kept the reading of the version before.
		const latest = readAgainOf(stored(REQUEST))[0];
		expect(latest.upToDate).toBe(false);
		const words = landedNoticeWords({ key: latest.landing.key, on: ['Cart'], upToDate: latest.upToDate, neverRead: latest.neverRead });
		expect(words).toEqual({ line: 'EVO-002 landed on Cart: this Simulation still reads the version before that landing.', stale: true });
	});

	it('each row of Evolutions in progress reads its order: lands before, lands after, or not ordered yet [criterion:ac-leaf-4162228b-6ca7-4176-97e6-138d453376d3]', async () => {
		const state = given(READ);
		const ahead = { ...approved(LANDING, F), stage: 'implementation' as const };
		const behind = { ...approved(QUIET, F, 'Edit the draft in place'), stage: 'implementation' as const, landsAfter: [REQUEST] };
		const elsewhere = { ...approved('7a0b1c2d-0000-4000-8000-000000000004', 'feat-ship', 'Shipping'), stage: 'implementation' as const };
		const overlapping = { ...approved('7a0b1c2d-0000-4000-8000-000000000005', F, 'Not ordered'), stage: 'implementation' as const };
		const here = { ...requestOf(state), landsAfter: [LANDING] };
		const run = await read(worldOf(state, {}, { requests: [here, ahead, behind, elsewhere, overlapping] }), `&requestId=${REQUEST}`);
		const rows = ((run.body?.request as Record<string, unknown>).crossEvolutions as { shown: { key: string; verdict: 'overlap' | 'compatible' | 'conflict' | 'spec_pending'; order: 'before' | 'after' | null; decision: null }[] }).shown;
		const said = Object.fromEntries(rows.map((row) => [row.key, orderWords(row)?.line ?? null]));
		expect(said).toEqual({ 'EVO-002': 'Lands before this one', 'EVO-003': 'Lands after this one', 'EVO-004': null, 'EVO-005': 'Not ordered yet' });
	});
});
