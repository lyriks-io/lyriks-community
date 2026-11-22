import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, FINDING, NOW, OUTSIDE, REASON, REQUEST, TWIN, VIEWER, act, given, mia, read, requestOf, stored, worldOf } from './simulation-readings.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./simulation-readings.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The decisions on a finding and the read door of the screen "Change:
 * Simulation and readings" (feature feat-lyriks-copy-a52881-32, surface
 * b8f8a781), run through POST and GET /api/evolution. The fixture
 * (simulation-readings.fixture.ts) fakes only the IO edges: the dossier store,
 * the access port and the engine behind the readings.
 */

beforeEach(() => forgetShortMemos());

/* ───────────── Decide a finding ───────────── */

const decide = (decision: 'accept_risk' | 'reopen', params: { readonly reason?: string; readonly findingId?: string } = {}) => ({
	op: 'decide_finding',
	requestId: REQUEST,
	findingId: params.findingId ?? FINDING,
	decision,
	...(decision === 'accept_risk' ? { reason: params.reason ?? REASON } : {})
});

describe('Accept a finding as a known risk (3bebff7e)', () => {
	const ready = { 'coherence.status': 'ready' };

	it('A designer accepts a major impact as a known risk [unspa:b8f8a781:3bebff7e:1a1cd241]', async () => {
		const run = await act(given(ready), [decide('accept_risk')], { finding: true });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': true });
		// Kept on the request with the reason and the name; the history keeps it as a risk decision.
		expect(stored().coherenceFindings.find((f) => f.id === FINDING)?.risk).toEqual({ by: mia.id, at: NOW, reason: REASON });
		expect(stored().history.at(-1)?.type).toBe('risk_decision');
	});

	it('Accepting the last blocking finding frees the request [unspa:b8f8a781:3bebff7e:01f22546]', async () => {
		const run = await act(given({ ...ready, 'finding.severity': 'blocking', 'coherence.blockingUndecided': 1 }), [decide('accept_risk')], { finding: true });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.blockingUndecided': 0 });
	});

	it('An AI cannot accept a risk for a team [unspa:b8f8a781:3bebff7e:65cdcb65]', async () => {
		const run = await act(given(ready, AI_CLIENT), [decide('accept_risk')], { finding: true });
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('An AI client cannot accept a risk on behalf of the team.');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': false });
	});

	it('An AI alone in its workspace accepts a risk [unspa:b8f8a781:3bebff7e:b891b140]', async () => {
		const run = await act(given({ ...ready, 'workspace.singleMember': true }, AI_CLIENT), [decide('accept_risk')], { finding: true });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': true });
	});

	it('A risk is accepted with a reason only [unspa:b8f8a781:3bebff7e:8de6f295]', async () => {
		const run = await act(given(ready), [decide('accept_risk', { reason: '' })], { finding: true });
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('Accepting a risk needs a stated reason.');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': false });
	});

	it('A finding the request does not hold is refused [unspa:b8f8a781:3bebff7e:e83e67bf]', async () => {
		const run = await act(given(), [decide('accept_risk', { findingId: 'coh-nothing-here' })]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This finding does not exist on the request.');
	});

	it('A viewer decides no finding [unspa:b8f8a781:3bebff7e:a94a6662]', async () => {
		const run = await act(given(ready, VIEWER), [decide('accept_risk')], { finding: true });
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': false });
	});

	it('refuses someone outside the workspace as if the project did not exist (rule d0c80e67)', async () => {
		const run = await act(given(ready, OUTSIDE), [decide('accept_risk')], { finding: true });
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it.each([
		['cancelled', 'This request is cancelled: reopen it first.'],
		['closed', 'This request is closed.'],
		['deleted', 'This request is deleted.']
	])('refuses a decision on a %s request (rules 84e74cc0, 0640afd5, 85d8c4e7)', async (status, message) => {
		const run = await act(given({ ...ready, 'request.status': status }), [decide('accept_risk')], { finding: true });
		expect(run.refusal?.message).toBe(message);
	});
});

describe('Take back an accepted risk (2ff4c1af)', () => {
	it('Taking back a blocking risk holds the request again [unspa:b8f8a781:2ff4c1af:f56c8c94]', async () => {
		const run = await act(given({ 'coherence.status': 'ready', 'finding.severity': 'blocking', 'finding.riskAccepted': true }), [decide('reopen')], { finding: true });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': false, 'coherence.blockingUndecided': 1 });
		expect(stored().history.at(-1)?.summary).toContain('Risk taken back');
	});

	it('Taking back a major risk holds nothing [unspa:b8f8a781:2ff4c1af:2ad062d7]', async () => {
		const run = await act(given({ 'coherence.status': 'ready', 'finding.riskAccepted': true }), [decide('reopen')], { finding: true });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.blockingUndecided': 0, 'finding.riskAccepted': false });
	});

	it('An AI cannot take a risk back for a team [unspa:b8f8a781:2ff4c1af:5a9f8696]', async () => {
		const run = await act(given({ 'finding.riskAccepted': true }, AI_CLIENT), [decide('reopen')], { finding: true });
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('An AI client cannot accept a risk on behalf of the team.');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': true });
	});

	it('A closed request keeps its decisions [unspa:b8f8a781:2ff4c1af:a59d7f92]', async () => {
		const run = await act(given({ 'request.status': 'closed', 'finding.riskAccepted': true }), [decide('reopen')], { finding: true });
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This request is closed.');
		expect(run.finalState).toMatchObject({ 'finding.riskAccepted': true });
	});

	it('refuses a viewer: reopening a finding changes what holds the request (rule b564540f)', async () => {
		const run = await act(given({ 'finding.riskAccepted': true }, VIEWER), [decide('reopen')], { finding: true });
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
	});

	it('refuses a finding the request does not hold (rule 744e4be2)', async () => {
		const run = await act(given(), [decide('reopen', { findingId: 'coh-nothing-here' })]);
		expect(run.refusal?.message).toBe('This finding does not exist on the request.');
	});
});

/* ───────────── Read the readings, scores and graph of a change ───────────── */

describe('Read the readings, scores and graph of a change (36519783)', () => {
	it('A viewer reads the graph of a request [unspa:b8f8a781:36519783:80e52aae]', async () => {
		const run = await read(worldOf(given({}, VIEWER)), `&requestId=${REQUEST}&part=graph`);
		expect(run.status).toBe('success');
		expect(run.body).toMatchObject({ requestId: REQUEST });
		expect(run.body?.graph).toBeDefined();
	});

	it('The graph needs a request [unspa:b8f8a781:36519783:25c19cf5]', async () => {
		const run = await read(worldOf(given()), '&part=docking');
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 404, message: 'part=docking needs a requestId' });
	});

	it('A beginning two requests share is refused [unspa:b8f8a781:36519783:55849a48]', async () => {
		const state = given();
		const run = await read(worldOf(state, {}, { requests: [requestOf(state), requestOf(state, {}, TWIN)] }), '&requestId=6f0c1d2e');
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 400, message: `"6f0c1d2e" starts 2 requests: ${REQUEST}, ${TWIN}. Give more of the id.` });
	});

	it('A part the door does not offer is refused [unspa:b8f8a781:36519783:7819f718]', async () => {
		const run = await read(worldOf(given()), `&requestId=${REQUEST}&part=grpah`);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.status).toBe(400);
		expect(run.refusal?.message).toMatch(/^unknown part "grpah"\. Valid: .*\bgraph\b/);
	});

	it('Someone outside the workspace reads nothing [unspa:b8f8a781:36519783:60c73bbf]', async () => {
		const run = await read(worldOf(given({}, OUTSIDE)), `&requestId=${REQUEST}`);
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('reads a deleted request like one that never was (rule 97f08228)', async () => {
		const run = await read(worldOf(given({ 'request.status': 'deleted' })), `&requestId=${REQUEST}`);
		expect(run.refusal).toEqual({ status: 404, message: `Request "${REQUEST}" does not exist on this project.` });
	});

	it('every member reads the readings of a request, a viewer included (rule c93d3cd8)', async () => {
		const run = await read(worldOf(given({ 'impact.status': 'ready', 'impact.upToDate': true }, VIEWER)), `&requestId=${REQUEST}&part=impact`);
		expect(run.status).toBe('success');
		expect((run.body as { request: { impact: { status: string } } }).request.impact.status).toBe('ready');
	});
});
