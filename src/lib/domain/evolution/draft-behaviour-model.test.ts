import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$application/evolution/parse-evolution-draft';
import {
	addDraftLeafAct,
	openRequestAct,
	setDraftBehaviourModelAct,
	updateDraftLeafAct,
	type ActContext,
	type ActOutcome
} from './acts';
import type { Actor, EvolutionRequest } from './draft';
import { withSolutionValidated } from './solution-validated.fixture';

/**
 * A draft carries its behaviour as a model the engine runs: the operations of
 * the change and the ids they were minted with. These pin that the model is
 * kept, cleared, refused on a frozen request, never moved under a different
 * base, and never lost by a save that parses the section back.
 */

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let counter = 0;
const ctx = (): ActContext => ({
	actor: person,
	at: '2026-09-25T12:00:00.000Z',
	newId: () => `id-${++counter}`
});
const known = new Set(['feat-a']);
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const withDraft = (): { request: EvolutionRequest; draftId: string } => {
	const opened = ok(
		openRequestAct(ctx(), {
			title: 'Let members cancel late',
			origin: 'customer_feedback',
			requester: 'ana',
			leafIds: [],
			knownLeafIds: known
		})
	);
	const request = ok(addDraftLeafAct(ctx(), withSolutionValidated(opened), { name: 'Cancel a booking' }, known));
	return { request, draftId: request.drafts[0].id };
};

const model = {
	operations: [
		{ kind: 'add_surface', ref: 'b', name: 'Bookings', type: 'screen', description: 'x' }
	],
	mintedIds: ['a1b2c3d4']
};

describe('a draft keeps a runnable behaviour model', () => {
	it('keeps the operations and their ids, and says so on the timeline', () => {
		const { request, draftId } = withDraft();
		const next = ok(setDraftBehaviourModelAct(ctx(), request, draftId, model));
		expect(next.drafts[0].behaviourModel).toEqual({
			...model,
			updatedAt: '2026-09-25T12:00:00.000Z'
		});
		expect(next.history.at(-1)?.summary).toContain('1 operations');
	});

	it('clears the model with an empty list or null, leaving the prose alone', () => {
		const { request, draftId } = withDraft();
		const kept = ok(setDraftBehaviourModelAct(ctx(), request, draftId, model));
		const cleared = ok(
			setDraftBehaviourModelAct(ctx(), kept, draftId, { operations: [], mintedIds: [] })
		);
		expect(cleared.drafts[0].behaviourModel).toBeUndefined();
		expect('behaviourModel' in cleared.drafts[0]).toBe(false);
	});

	it('refuses on a frozen request and on a draft it does not carry', () => {
		const { request, draftId } = withDraft();
		expect(
			reasonOf(setDraftBehaviourModelAct(ctx(), { ...request, frozen: true }, draftId, model))
		).toContain('frozen');
		expect(reasonOf(setDraftBehaviourModelAct(ctx(), request, 'draft:nope', model))).toContain(
			'no draft'
		);
	});

	it('refuses to move a draft with a model under another base', () => {
		const { request, draftId } = withDraft();
		const kept = ok(setDraftBehaviourModelAct(ctx(), request, draftId, model));
		const moved = updateDraftLeafAct(
			ctx(),
			kept,
			draftId,
			{ kind: 'amend', baseLeafId: 'feat-a' },
			known
		);
		expect(reasonOf(moved)).toContain('cannot change under it');
		// Renaming it is fine: the model does not depend on the name.
		expect(
			ok(updateDraftLeafAct(ctx(), kept, draftId, { name: 'Cancel late' }, known)).drafts[0]
				.behaviourModel
		).toBeDefined();
	});

	it('survives a save that parses the section back', () => {
		const { request, draftId } = withDraft();
		const kept = ok(setDraftBehaviourModelAct(ctx(), request, draftId, model));
		const parsed = parseEvolutionDraft(
			JSON.parse(JSON.stringify({ projectId: 'p', requests: [kept], lastSavedAt: null })),
			'p'
		);
		expect(parsed.requests[0].drafts[0].behaviourModel).toEqual({
			...model,
			updatedAt: '2026-09-25T12:00:00.000Z'
		});
	});
});
