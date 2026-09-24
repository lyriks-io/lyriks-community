import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type Actor } from './draft';
import { decideProposalAct, flaggedWordsIn, proposeAct, withdrawProposalAct } from './acts';
import { emptyImpactReason } from './code-impact';
import { ALLOW } from './guard';

/**
 * Request d17092da, the draft of "Challenge and complete the spec with the LLM".
 * On 2026-09-22 a banned word BLOCKED the signature of a proposal quoting a state
 * the product itself displays ("in progress"), and nobody could take the value
 * back, so the field stayed held by something no one could sign.
 */
const client: Actor = { id: 'claude', kind: 'ai_client', role: 'member', channel: 'ai_client' };
const otherClient: Actor = { id: 'codex', kind: 'ai_client', role: 'member', channel: 'ai_client' };
const person: Actor = { id: 'ana', kind: 'person', role: 'owner', channel: 'page' };
let n = 0;
const ctx = (actor: Actor) => ({ actor, at: '2026-09-24T00:00:00.000Z', newId: () => `id-${++n}`, soloWorkspace: false });
const checks = {
	sourceExists: (id: string) => id === 'src-1',
	bannedWords: [{ avoid: 'progress', prefer: 'coverage' }]
};
const base = () => createEvolutionRequest({ id: 'r1', leafIds: ['feat-x'], stage: 'specification' });
const proposed = (value: string, by: Actor = client) => {
	const outcome = proposeAct(
		ctx(by),
		base(),
		{
			fieldPath: '01-origin.objective',
			leafId: 'feat-x',
			value,
			reasoning: '',
			whatWasRead: 'The brief.',
			whatWasInferred: 'The wording.',
			citedSourceIds: ['src-1']
		},
		checks
	);
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
};

describe('a banned word warns, never blocks', () => {
	it('names the agreed term the flagged word stands in for', () => {
		const proposal = proposed('Show the progress of each feature.').proposals[0];
		expect(proposal.bannedSynonymDetected).toBe(true);
		expect(proposal.flaggedWords).toEqual([{ word: 'progress', prefer: 'coverage' }]);
	});

	it('never flags a word quoted from what the product or a source says', () => {
		expect(flaggedWordsIn('A block reads "in progress" until it is complete.', checks.bannedWords)).toEqual([]);
		expect(flaggedWordsIn('Le bloc affiche «in progress».', checks.bannedWords)).toEqual([]);
		expect(proposed('A block reads “in progress”.').proposals[0].bannedSynonymDetected).toBe(false);
	});

	it('lets a person accept a flagged value, and records the sense they meant beside it', () => {
		const request = proposed('Show the progress of each step of the wizard.');
		const id = request.proposals[0].id;
		const outcome = decideProposalAct(
			ctx(person),
			request,
			id,
			{ decision: 'accept', sense: 'progress through the wizard steps, not spec coverage' },
			() => ALLOW
		);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		const accepted = outcome.request.proposals[0];
		expect(accepted.decision).toBe('accepted');
		expect(accepted.keptWordingSense).toBe('progress through the wizard steps, not spec coverage');
		expect(outcome.request.history.at(-1)?.summary).toContain('"progress" (the glossary says "coverage")');
		// The answer is the request's own from now on, not the feature's.
		expect(outcome.request.answeredKeys).toContain('01-origin.objective@feat-x');
	});
});

describe('the client that made a proposal can take it back while nobody decided it', () => {
	it('withdraws it, frees the field and says so on the timeline', () => {
		const request = proposed('Show the progress.');
		const outcome = withdrawProposalAct(ctx(client), request, request.proposals[0].id);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.request.proposals).toHaveLength(0);
		expect(outcome.request.history.at(-1)?.type).toBe('withdrawn_proposal');
	});

	it('refuses another caller: a person refuses instead, which stays a decision', () => {
		const request = proposed('Show the progress.');
		expect(withdrawProposalAct(ctx(otherClient), request, request.proposals[0].id).ok).toBe(false);
		expect(withdrawProposalAct(ctx(person), request, request.proposals[0].id).ok).toBe(false);
	});

	it('refuses once it has been decided', () => {
		const request = proposed('A plain value.');
		const decided = decideProposalAct(ctx(person), request, request.proposals[0].id, { decision: 'accept' }, () => ALLOW);
		if (!decided.ok) throw new Error(decided.reason);
		expect(withdrawProposalAct(ctx(client), decided.request, request.proposals[0].id).ok).toBe(false);
	});
});

describe('an empty impact report says why it is empty', () => {
	const draft = (kind: string, dependsOn: string[] = []) => ({
		kind,
		name: 'Export a dossier as a PDF',
		dependsOn,
		behaviour: [],
		acceptanceCriteria: []
	});

	it('says an addition that declares nothing had nowhere to go, which is not "nothing follows"', () => {
		const reason = emptyImpactReason({ leafIds: ['draft:1'], drafts: [draft('add')] });
		expect(reason).toContain('"Export a dossier as a PDF" declares nothing it depends on');
		expect(reason).toContain('not that nothing follows');
	});

	it('says a rewording moves nothing, and an isolated feature has nothing linked to it', () => {
		expect(emptyImpactReason({ leafIds: ['feat-a', 'draft:1'], drafts: [draft('amend')] })).toContain('only rewords');
		expect(emptyImpactReason({ leafIds: ['feat-a'], drafts: [] })).toContain('Nothing in the specification is linked');
	});
});
