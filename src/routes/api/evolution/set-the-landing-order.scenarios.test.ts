import { describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, landingOrderOf, undecidedConflicts, type DraftLeaf, type EvolutionRequest } from '$domain/evolution';
import { boardCard } from '$lib/server/evolution-view.server';
import { REQUEST, stateOf, world, type Scenario, type State } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Set which of two overlapping requests lands first"
 * (action b5a3aa1e of feat-31, as EVO-005 spec version 1 has them), run
 * against the real code: two requests under way are stored, set_landing_order
 * goes through POST /api/evolution and the real batch, and the order is read
 * back from both stored requests. Succeeds when the order is saved; is refused
 * for the scenario's own reason, nothing moved.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
const { POST } = await import('./+server');

const SURFACE = '13e955f6';
const ACTION = 'b5a3aa1e';
const OTHER = 'r-other';

/** A request under way at Build amending, removing or leaving `feature`. */
function underWay(id: string, title: string, kind: DraftLeaf['kind'], feature = 'feat-1'): EvolutionRequest {
	return createEvolutionRequest({
		id,
		title,
		stage: 'implementation',
		status: 'open',
		specVersion: 1,
		frozen: true,
		leafIds: [feature],
		drafts: [createDraftLeaf({ id: `draft:${id}`, kind, baseLeafId: feature, acceptanceCriteria: kind === 'amend' ? [{ id: `c-${id}`, text: 'It holds.' }] : [] })]
	});
}

/** This request (EVO-001) and the other one (EVO-002), as the state says they share the checkout. */
function pairOf(state: State): [EvolutionRequest, EvolutionRequest] {
	const here = underWay(REQUEST, 'Validate the elements of a specification again', 'amend');
	const there =
		state['concurrent.overlapping'] === false
			? underWay(OTHER, 'Shipping', 'amend', 'feat-ship')
			: state['concurrent.conflictUndecided'] === true
				? underWay(OTHER, 'Retire the checkout', 'remove')
				: underWay(OTHER, 'Validate the elements of a specification', 'amend');
	return [here, there];
}

const SCENARIOS: readonly (Scenario & { readonly persona?: State })[] = [
	{ id: '1cc63843', name: 'A person sets which overlapping request lands first', given: {}, params: { landsFirst: 'other' }, expected: 'success' },
	{ id: '1dc3f5bb', name: 'Setting the order decides a conflict', given: { 'concurrent.conflictUndecided': true }, params: { landsFirst: 'this' }, expected: 'success' },
	{ id: 'a4248c28', name: 'A viewer sets no order', given: {}, persona: { 'session.workspaceRole': 'viewer' }, params: { landsFirst: 'this' }, expected: 'blocked', holds: '403' },
	{
		id: '982b570d',
		name: 'Requests sharing nothing are not ordered',
		given: { 'concurrent.overlapping': false },
		params: { landsFirst: 'this' },
		expected: 'blocked',
		holds: 'These requests share no feature or table: they are not ordered.'
	}
];

const door = world(scene, { answers: true, applies: true });

describe('Set which of two overlapping requests lands first, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = { ...stateOf(scenario), ...(scenario.persona ?? {}) };
			const [here, there] = pairOf(state);
			door.seed(state, here, [there]);
			if (state['concurrent.conflictUndecided'] === true) expect(undecidedConflicts(here, [here, there]).map((r) => r.id)).toEqual([OTHER]);
			const posted = await door.post(POST, [{ op: 'set_landing_order', requestId: REQUEST, otherRequestId: OTHER, landsFirst: state['$landsFirst'] }]);
			const mine = door.stored();
			const theirs = door.storedOf(OTHER)!;
			const order = landingOrderOf(mine, theirs);
			expect(posted.ok && order !== null ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				// order.set: both rows read it, this one before or after the other as the person said.
				expect(order).toBe(state['$landsFirst'] === 'this' ? 'after' : 'before');
				// concurrent.conflictUndecided is false: the freeze no longer waits for it.
				expect(undecidedConflicts(mine, [mine, theirs])).toEqual([]);
				return;
			}
			expect(order).toBeNull();
			const said = posted.results.map((r) => r.summary).join(' | ') || String(posted.status);
			expect(said).toContain(scenario.holds);
		});
	}
});

describe('The order of the requests under way (EVO-005)', () => {
	it('a person swaps the order of two overlapping requests; a viewer does not [criterion:ac-leaf-b576400c-3b9f-4330-ad68-6237ba862c31]', async () => {
		const state = stateOf({ id: '', name: '', given: {}, expected: 'success' });
		const [here, there] = pairOf(state);
		door.seed(state, { ...here, landsAfter: [OTHER] }, [there]);
		const swapped = await door.post(POST, [{ op: 'set_landing_order', requestId: REQUEST, otherRequestId: OTHER, landsFirst: 'this' }]);
		expect(swapped.ok).toBe(true);
		expect(landingOrderOf(door.stored(), door.storedOf(OTHER)!)).toBe('after');
		expect(door.storedOf(OTHER)!.history.map((h) => h.summary)).toContain('Set to land after EVO-001');
		const viewer = { ...state, 'session.workspaceRole': 'viewer' };
		door.seed(viewer, { ...here, landsAfter: [OTHER] }, [there]);
		const refused = await door.post(POST, [{ op: 'set_landing_order', requestId: REQUEST, otherRequestId: OTHER, landsFirst: 'this' }]);
		expect(refused.ok).toBe(false);
		expect(landingOrderOf(door.stored(), door.storedOf(OTHER)!)).toBe('before');
	});

	it('a cancelled, deleted or closed request leaves every order it was in [criterion:ac-leaf-cca2fbb6-bad5-4e83-afbe-e55dd5b8fd05]', async () => {
		const state = stateOf({ id: '', name: '', given: {}, expected: 'success' });
		const [here, there] = pairOf(state);
		door.seed(state, { ...here, landsAfter: [OTHER] }, [{ ...there, pairDecisions: [{ requestId: REQUEST, kind: 'order', reason: '', by: 'ana@example.test', at: '2026-11-20T08:00:00.000Z' }] }]);
		const cancelled = await door.post(POST, [{ op: 'cancel_request', requestId: OTHER, reason: 'Postponed to next year.' }]);
		expect(cancelled.ok).toBe(true);
		expect(door.stored().landsAfter ?? []).toEqual([]);
		expect(door.storedOf(OTHER)!.pairDecisions ?? []).toEqual([]);
		// Once it left the run, nothing orders it again.
		const refused = await door.post(POST, [{ op: 'set_landing_order', requestId: REQUEST, otherRequestId: OTHER, landsFirst: 'this' }]);
		expect(refused.results[0].summary).toBe('Only a request under way is ordered.');
	});

	it('a card reads after EVO-xxx while the request it is set after has not landed [criterion:ac-leaf-f2108b7e-6d38-4999-a018-4f3d4057afdf]', () => {
		const [here, there] = pairOf(stateOf({ id: '', name: '', given: {}, expected: 'success' }));
		const ordered = { ...here, landsAfter: [OTHER] };
		const view = { draft: { projectId: 'shop', requests: [ordered, there] } } as never;
		expect(boardCard(view, ordered, 0).order.after).toEqual(['EVO-002']);
		const landed = { ...there, status: 'closed' as const };
		expect(boardCard({ draft: { projectId: 'shop', requests: [ordered, landed] } } as never, ordered, 0).order.after).toEqual([]);
	});

	it('a card in Conflict with a request under way reads it on the board [criterion:ac-leaf-44f6ec8a-f78f-4488-8a66-0603a4cb4249]', () => {
		const [here, there] = pairOf(stateOf({ id: '', name: '', given: { 'concurrent.conflictUndecided': true }, expected: 'success' }));
		const view = { draft: { projectId: 'shop', requests: [here, there] } } as never;
		expect(boardCard(view, here, 0).order.conflicts).toEqual(['EVO-002']);
		expect(boardCard(view, there, 0).order.conflicts).toEqual(['EVO-001']);
	});
});
