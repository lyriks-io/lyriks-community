import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canRunCheck, type Actor } from '$domain/evolution';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import {
	AI_CLIENT,
	COMMUNITY,
	OUTSIDE,
	PROJECT,
	READ_AFTER,
	REQUEST,
	VIEWER,
	act,
	automatic,
	given,
	leo,
	mia,
	readState,
	requestOf,
	seed,
	send,
	servicesOf,
	stored,
	worldOf,
	type State
} from './simulation-readings.fixture';

// The installation sets the deadline of the behaviour verification a coherence reading waits for
// (LYRIKS_EVO_BEHAVIOUR_READ_MS): short here, so a late verification is late within a test.
vi.mock('$env/dynamic/private', async (original) => ({
	env: { ...(await original<{ env: Record<string, string | undefined> }>()).env, LYRIKS_EVO_BEHAVIOUR_READ_MS: '40' }
}));
vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./simulation-readings.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The readings of the screen "Change: Simulation and readings" (feature
 * feat-lyriks-copy-a52881-32, surface b8f8a781), and the moves of the request
 * other features make, which this screen records, run through the real door
 * POST /api/evolution. The fixture (simulation-readings.fixture.ts) fakes only
 * the IO edges: the dossier store, the access port and the engine behind the
 * readings.
 */

beforeEach(() => forgetShortMemos());

/* ───────────── What other features do, recorded here ───────────── */

describe('Record that what the change proposes moved (31d9a6a9)', () => {
	it('A draft moves after the readings [unspa:b8f8a781:31d9a6a9:8697d511]', async () => {
		// The drafts move after both readings ran: another feature is drafted on the request.
		const run = await act(given({ 'impact.status': 'ready', 'impact.upToDate': true, 'coherence.status': 'ready', 'coherence.upToDate': true }), [
			{ op: 'add_draft_leaf', requestId: REQUEST, kind: 'add', name: 'Gift wrap', description: 'Wrap an order as a gift.' }
		]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'impact.upToDate': false, 'coherence.upToDate': false });
		// Both readings stand as they were: only their freshness moved.
		expect(run.finalState).toMatchObject({ 'impact.status': 'ready', 'coherence.status': 'ready' });
	});
});

/** The texts of each step of specification but the last one, then the last write: a request written this far stands ready for the Impact analysis. */
const everythingButTheLastWrite = [
	{ op: 'update_need', requestId: REQUEST, description: 'Cap the cart at ten items.', situation: 'Carts of a hundred items time out at checkout.', objectives: 'No cart holds more than ten items.' },
	{ op: 'update_step_description', requestId: REQUEST, step: 'solution', description: 'The cart refuses an eleventh item.' },
	{ op: 'answer_step', requestId: REQUEST, step: 'solution', question: 'examples', answer: 'A cart of ten items refuses the next one.' },
	{ op: 'update_step_description', requestId: REQUEST, step: 'functional_spec', description: 'The person adds an item to a full cart and is told it is full.' },
	{ op: 'answer_step', requestId: REQUEST, step: 'functional_spec', question: 'refusals', answer: 'An eleventh item is refused.' },
	{ op: 'redraw_diagram', requestId: REQUEST, step: 'functional_spec', diagram: 'actor Buyer\nuse case Add an item: Buyer\nflow Add an item\nBuyer: adds an item' },
	{ op: 'update_step_description', requestId: REQUEST, step: 'technical_spec', description: 'The cart service counts the items before adding one.' }
];
const theLastWrite = { op: 'redraw_diagram', requestId: REQUEST, step: 'technical_spec', diagram: 'component CartService: changed' };

describe('Record that the request entered the Impact analysis (e6232ded)', () => {
	it('The request enters the Impact analysis [unspa:b8f8a781:e6232ded:b087a724]', async () => {
		const run = await act(given(), [...everythingButTheLastWrite, theLastWrite]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'request.stage': 'coherence' });
		expect(stored().history.some((h) => h.type === 'stage_crossing' && h.summary.toLowerCase().includes('coherence'))).toBe(true);
	});
});

describe('Record that the request was sent back to its specification (b06a1ed1)', () => {
	it('The request is sent back to its specification [unspa:b8f8a781:b06a1ed1:7add120f]', async () => {
		const run = await act(given({ 'request.stage': 'implementation' }), [{ op: 'rebrief', requestId: REQUEST }]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'request.stage': 'specification' });
	});
});

describe('Record that the request was cancelled (b56c8a7e)', () => {
	it('The request is cancelled [unspa:b8f8a781:b56c8a7e:3d21f1bb]', async () => {
		const run = await act(given(), [{ op: 'cancel_request', requestId: REQUEST, reason: 'The checkout team caps the cart instead.' }]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'request.status': 'cancelled' });
	});
});

describe('Record that the request was reopened (53b101ee)', () => {
	it('A cancelled request is reopened [unspa:b8f8a781:53b101ee:82f3de5c]', async () => {
		const run = await act(given({ 'request.status': 'cancelled' }), [{ op: 'reopen_request', requestId: REQUEST }]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'request.status': 'open', 'request.stage': 'specification' });
	});
});

describe('Record that the request was closed (a1f7eb44)', () => {
	it('The request is closed [unspa:b8f8a781:a1f7eb44:2b2a0ba0]', async () => {
		// Closing is the end of a delivered change (canCloseRequest), and the only act that closes one: the request of
		// the Given is taken to the end of its run, declared live. A request in Specify never closes (next test), and
		// the settle path of a request with nothing to arbitrate stops at Verify, its acceptance waiting on a built report.
		const state = given({ 'request.stage': 'delivered' });
		const delivered = { ...requestOf(state), deployment: { releaseId: null, note: '', declaredBy: leo.id, declaredAt: READ_AFTER } };
		const w = seed(worldOf(state, {}, { requests: [delivered] }));
		expect(readState(stored())).toMatchObject({ 'request.status': 'open' });
		const run = await send(w, [{ op: 'close_request', requestId: REQUEST }]);
		expect(run.status).toBe('success');
		expect(readState(stored())).toMatchObject({ 'request.status': 'closed' });
	});

	it('only a delivered request closes: one in Specify stays open', async () => {
		const run = await act(given(), [{ op: 'close_request', requestId: REQUEST }]);
		expect(run.refusal?.message).toBe('Only a delivered request can be closed.');
		expect(run.finalState).toMatchObject({ 'request.status': 'open' });
	});
});

describe('Record that the request was deleted (5e994ecb)', () => {
	it('The request is deleted [unspa:b8f8a781:5e994ecb:94646068]', async () => {
		const run = await act(given(), [{ op: 'delete_request', requestId: REQUEST }]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'request.status': 'deleted' });
	});
});

/* ───────────── The readings the platform takes on its own ───────────── */

/** An act on the request that changes nothing it proposes: renaming it. */
const rename = { op: 'update_request', requestId: REQUEST, title: 'Cap the cart' };

describe('Read the change again on its own (ebcc9933)', () => {
	it('The platform reads a change that entered the Impact analysis [unspa:b8f8a781:ebcc9933:c2ccf0c7]', async () => {
		const run = await act(given({ 'request.stage': 'coherence' }), [rename]);
		expect(run.status).toBe('success');
		// One walk per kind of draft the request carries (an amendment: a change), then the coherence check.
		expect(automatic(run)).toEqual(['run_impact', 'run_coherence']);
		expect(run.finalState).toMatchObject({ 'impact.upToDate': true, 'coherence.status': 'ready', 'impact.depth': 2, 'coherence.upToDate': true });
	});

	it('Nothing runs before the Impact analysis [unspa:b8f8a781:ebcc9933:e15fc693]', async () => {
		const run = await act(given(), [rename]);
		expect(automatic(run)).toEqual([]);
		expect(run.finalState).toMatchObject({ 'impact.status': 'not_run', 'coherence.status': 'not_run' });
	});

	it('Up-to-date readings are not run again [unspa:b8f8a781:ebcc9933:1829bd52]', async () => {
		const state = given({ 'request.stage': 'coherence', 'impact.status': 'ready', 'impact.upToDate': true, 'coherence.status': 'ready', 'coherence.upToDate': true });
		const run = await act(state, [rename]);
		expect(automatic(run)).toEqual([]);
		expect(stored().impactReport.ranAt).toBe(READ_AFTER);
		expect(stored().coherenceReport.ranAt).toBe(READ_AFTER);
	});

	it('nothing runs on a request that is not open, even at the Impact analysis (rule 959be892)', async () => {
		const run = await act(given({ 'request.stage': 'coherence' }), [{ op: 'cancel_request', requestId: REQUEST, reason: 'The checkout team caps the cart instead.' }]);
		expect(run.status).toBe('success');
		expect(automatic(run)).toEqual([]);
		expect(run.finalState).toMatchObject({ 'request.status': 'cancelled', 'impact.status': 'not_run', 'coherence.status': 'not_run' });
	});
});

/* ───────────── Read the impact of the change ───────────── */

const runImpact = (params: { readonly hypothesis?: string; readonly depth?: number } = {}) => ({ op: 'run_impact', requestId: REQUEST, hypothesis: params.hypothesis ?? 'change', depth: params.depth ?? 2 });

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

describe('Check the coherence of the change (9c253bed)', () => {
	it('The check finds nothing blocking [unspa:b8f8a781:9c253bed:11d3c9a2]', async () => {
		const run = await act(given(), [runCoherence]);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'ready', 'coherence.blockingUndecided': 0, 'coherence.upToDate': true });
	});

	it('The check finds two blocking findings [unspa:b8f8a781:9c253bed:addfbfad]', async () => {
		const run = await act(given(), [runCoherence], { clashing: 2 });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.blockingUndecided': 2 });
	});

	it('A late verification keeps the reading the request holds [unspa:b8f8a781:9c253bed:e5b8ec67]', async () => {
		const state = given({ 'coherence.status': 'ready', 'coherence.blockingUndecided': 1 });
		const run = await act(state, [runCoherence], { clashing: 0 }, { behaviourReadInTime: false });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.blockingUndecided': 1, 'coherence.upToDate': false });
		expect(run.results[0].summary).toContain('Coherence not read again');
	});

	it('A first reading is taken even when the verification is late [unspa:b8f8a781:9c253bed:c93b1fb9]', async () => {
		const run = await act(given(), [runCoherence], {}, { behaviourReadInTime: false });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'ready' });
		expect(run.results[0].summary).toContain('Partial:');
	});

	it('A deleted request is checked no more [unspa:b8f8a781:9c253bed:0bce033c]', async () => {
		const run = await act(given({ 'request.status': 'deleted' }), [runCoherence]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This request is deleted.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'not_run' });
	});

	it('Someone outside the workspace asks for no check [unspa:b8f8a781:9c253bed:048b1b54]', async () => {
		const run = await act(given({}, OUTSIDE), [runCoherence]);
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
		expect(run.finalState).toMatchObject({ 'coherence.status': 'not_run' });
	});

	it('A coherence report already marked running is refused without replacement [unspa:b8f8a781:9c253bed:4f0a0582]', async () => {
		const run = await act(given({ 'coherence.status': 'running', 'coherence.blockingUndecided': 3 }), [runCoherence]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('A check is already running on this request.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'running', 'coherence.blockingUndecided': 3, 'coherence.upToDate': false });
	});

	it('A first partial coherence reading keeps the actual blocking count [unspa:b8f8a781:9c253bed:fb211a4a]', async () => {
		const run = await act(given(), [runCoherence], { clashing: 3 }, { behaviourReadInTime: false });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'ready', 'coherence.blockingUndecided': 3, 'coherence.upToDate': true });
	});

	it('A later partial coherence reading preserves the old count and freshness [unspa:b8f8a781:9c253bed:3d5a10f6]', async () => {
		const state = given({ 'coherence.status': 'ready', 'coherence.blockingUndecided': 3, 'coherence.upToDate': false });
		const run = await act(state, [runCoherence], {}, { behaviourReadInTime: false });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'ready', 'coherence.blockingUndecided': 3, 'coherence.upToDate': false });
	});

	it('refuses a viewer: a reading is stored for the whole team (rule 6feeb1a4)', async () => {
		const run = await act(given({}, VIEWER), [runCoherence]);
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
	});
});

/* ───────────── Check the scope and source of a coherence reading ───────────── */

/**
 * The retained check has no control and no endpoint of its own: it is the guard
 * every coherence reading passes (runCoherenceAct supplies the whole project and
 * the engine), run here with the scope and the producer the scenario supplies.
 */
function retainedCheck(state: State, params: { readonly scope?: 'request_only' | 'whole_project'; readonly producer?: 'engine' | 'llm' } = {}) {
	const request = requestOf(state);
	const verdict = canRunCheck(request, params.scope ?? 'whole_project', params.producer ?? 'engine');
	return { status: verdict.ok ? 'success' : 'blocked', reason: verdict.ok ? null : verdict.reason, finalState: readState(request) };
}

describe('Check the scope and source of a coherence reading (cdaeeb9c)', () => {
	it('A whole-project engine check passes the retained contract [unspa:b8f8a781:cdaeeb9c:93d981e7]', () => {
		const run = retainedCheck(given());
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'not_run', 'coherence.blockingUndecided': 0 });
	});

	it('A retained coherence check can read an existing ready report [unspa:b8f8a781:cdaeeb9c:1a041240]', () => {
		const run = retainedCheck(given({ 'coherence.status': 'ready' }));
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'ready', 'coherence.blockingUndecided': 0 });
	});

	it('The retained check refuses the request-only scope [unspa:b8f8a781:cdaeeb9c:772b1b58]', () => {
		const run = retainedCheck(given(), { scope: 'request_only' });
		expect(run.status).toBe('blocked');
		expect(run.reason).toBe('A coherence check only means something over the whole project.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'not_run', 'coherence.blockingUndecided': 0 });
	});

	it('The retained check refuses the LLM as producer [unspa:b8f8a781:cdaeeb9c:4fbad4e9]', () => {
		const run = retainedCheck(given(), { producer: 'llm' });
		expect(run.status).toBe('blocked');
		expect(run.reason).toBe('The coherence report is produced by the engine, not by the LLM.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'not_run', 'coherence.blockingUndecided': 0 });
	});

	it('The retained check refuses a running report [unspa:b8f8a781:cdaeeb9c:ad324682]', () => {
		const run = retainedCheck(given({ 'coherence.status': 'running' }));
		expect(run.status).toBe('blocked');
		expect(run.reason).toBe('A check is already running on this request.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'running', 'coherence.blockingUndecided': 0 });
	});

	it('Scope precedes running status and producer in the retained check [unspa:b8f8a781:cdaeeb9c:0eabdacb]', () => {
		const run = retainedCheck(given({ 'coherence.status': 'running' }), { scope: 'request_only', producer: 'llm' });
		expect(run.status).toBe('blocked');
		expect(run.reason).toBe('A coherence check only means something over the whole project.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'running', 'coherence.blockingUndecided': 0 });
	});

	it('Running status precedes the LLM refusal in the retained check [unspa:b8f8a781:cdaeeb9c:914b699f]', () => {
		const run = retainedCheck(given({ 'coherence.status': 'running' }), { producer: 'llm' });
		expect(run.status).toBe('blocked');
		expect(run.reason).toBe('A check is already running on this request.');
		expect(run.finalState).toMatchObject({ 'coherence.status': 'running', 'coherence.blockingUndecided': 0 });
	});

	it('the public reading supplies the whole project and the engine: a running report refuses it through the door too', async () => {
		const run = await act(given({ 'coherence.status': 'running' }), [runCoherence]);
		expect(run.refusal?.message).toBe('A check is already running on this request.');
	});
});

