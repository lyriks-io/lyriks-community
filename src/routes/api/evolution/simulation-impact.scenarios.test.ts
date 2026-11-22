import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '$domain/evolution';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, COMMUNITY, OUTSIDE, PROJECT, REQUEST, VIEWER, act, given, mia, readState, seed, send, servicesOf, stored, worldOf } from './simulation-readings.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./simulation-readings.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * "Read the impact of the change" (action 0536f24c of the screen "Change:
 * Simulation and readings", feature feat-lyriks-copy-a52881-32, surface
 * b8f8a781), run through the real door POST /api/evolution. The fixture
 * (simulation-readings.fixture.ts) fakes only the IO edges. A walk asked
 * without a hypothesis or a depth supposes a change, two links out
 * (parameters a7bea46e and b0c3879a): its scenarios send only what they name.
 */

beforeEach(() => forgetShortMemos());

const runImpact = (params: { readonly hypothesis?: string; readonly depth?: number } = {}) => ({ op: 'run_impact', requestId: REQUEST, ...params });

describe('Read the impact of the change (0536f24c)', () => {
	it('The AI reads the impact of a change at depth 2 [unspa:b8f8a781:0536f24c:7857a16c]', async () => {
		const run = await act(given({}, AI_CLIENT), [runImpact()]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'impact.status': 'ready', 'impact.depth': 2, 'impact.proofsCompared': true });
		expect(stored().impactReport.hypothesis).toBe('change');
	});

	it('A walk of depth zero is refused [unspa:b8f8a781:0536f24c:a23cc790]', async () => {
		const run = await act(given(), [runImpact({ depth: 0 })]);
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 422, message: 'The depth must be at least one step.' });
		expect(run.finalState).toMatchObject({ 'impact.status': 'not_run' });
	});

	it('A walk past five links is refused [unspa:b8f8a781:0536f24c:c79283df]', async () => {
		const run = await act(given(), [runImpact({ depth: 6 })]);
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 422, message: 'The propagation stops at 5 steps.' });
		expect(run.finalState).toMatchObject({ 'impact.status': 'not_run' });
	});

	it('A Community installation reads no proof plane [unspa:b8f8a781:0536f24c:a107c583]', async () => {
		const state = given({}, COMMUNITY);
		const w = worldOf(state);
		seed(w);
		// Community locks the Evolution doors (EVO-001), so the act behind them is driven directly, the solver absent.
		expect((await send(w, [runImpact()])).refusal?.status).toBe(403);
		const operator: Actor = { id: mia.id, kind: 'person', role: 'member', channel: 'page' };
		const outcome = await applyEvolutionOperations(servicesOf(w), { projectId: PROJECT, operations: [runImpact()], actor: operator, origin: null });
		expect(outcome.ok).toBe(true);
		expect(readState(stored())).toMatchObject({ 'impact.status': 'ready', 'impact.proofsCompared': false });
	});

	it('A cancelled request is read no more [unspa:b8f8a781:0536f24c:cc95159a]', async () => {
		const run = await act(given({ 'request.status': 'cancelled' }), [runImpact()]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This request is cancelled: reopen it first.');
		expect(run.finalState).toMatchObject({ 'impact.status': 'not_run' });
	});

	it('A viewer asks for no reading [unspa:b8f8a781:0536f24c:0a7f992b]', async () => {
		const run = await act(given({}, VIEWER), [runImpact()]);
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
		expect(run.finalState).toMatchObject({ 'impact.status': 'not_run' });
	});

	it('refuses someone outside the workspace as if the project did not exist (rule e1eaf4ff)', async () => {
		const run = await act(given({}, OUTSIDE), [runImpact()]);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it.each([
		['closed', 'This request is closed.'],
		['deleted', 'This request is deleted.']
	])('refuses a %s request (rules 3f162d80, 1dc99284)', async (status, message) => {
		const run = await act(given({ 'request.status': status }), [runImpact()]);
		expect(run.refusal?.message).toBe(message);
	});
});

/* ───────────── Check the coherence of the change ───────────── */

const runCoherence = { op: 'run_coherence', requestId: REQUEST };
