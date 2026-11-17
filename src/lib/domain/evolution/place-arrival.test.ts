import { describe, expect, it } from 'vitest';
import { proposalArrival, proposalFates, type ProposalFate } from './place-arrival';
import type { EvolutionRequest, Proposal } from './draft';

const proposal = (id: string, over: Partial<Proposal> = {}): Proposal =>
	({
		id,
		targetField: '00-need.objectives',
		canonicalSection: 'request',
		canonicalPath: 'request.need.objectives',
		value: 'v',
		reasoning: '',
		whatWasRead: '',
		whatWasInferred: '',
		reasoningSeparatesReadFromInferred: true,
		citedSourceIds: ['s'],
		bannedSynonymDetected: false,
		flaggedWords: [],
		keptWordingSense: '',
		proposedBy: 'ai',
		decision: 'pending',
		comment: '',
		acceptedBy: null,
		acceptedAt: null,
		reviewerIds: [],
		verdicts: [],
		...over
	}) as Proposal;

const request = (proposals: Proposal[], withdrawn: string[] = []) =>
	({
		proposals,
		history: withdrawn.map((id) => ({ id: `h-${id}`, type: 'withdrawn_proposal', proposalId: id }))
	}) as unknown as Pick<EvolutionRequest, 'proposals' | 'history'>;

describe('what an address to a suggestion finds once it no longer waits', () => {
	it('lands on the suggestion itself while it waits', () => {
		const r = request([proposal('p1')]);
		expect(proposalArrival('p1', (id) => id === 'p1', proposalFates(r))).toEqual({ kind: 'waiting', id: 'p1' });
	});

	it('opens the field a decided suggestion was on, naming who accepted it', () => {
		const fates = proposalFates(request([proposal('p1', { decision: 'accepted', acceptedBy: 'alexis' })]));
		expect(proposalArrival('p1', () => false, fates)).toEqual({
			kind: 'decided',
			decision: 'accepted',
			targetField: '00-need.objectives',
			leafId: null,
			by: 'alexis'
		});
	});

	it('names nobody for a refusal, which keeps no author', () => {
		const fates = proposalFates(request([proposal('p1', { decision: 'refused', acceptedBy: 'x' })]));
		expect(proposalArrival('p1', () => false, fates)).toMatchObject({ kind: 'decided', decision: 'refused', by: null });
	});

	it('follows a chain of rewrites to the suggestion that waits now', () => {
		const r = request([proposal('p3', { replaces: ['p1', 'p2'] })]);
		expect(proposalArrival('p1', (id) => id === 'p3', proposalFates(r))).toEqual({ kind: 'waiting', id: 'p3' });
	});

	it('follows a rewrite to the decision taken on the new suggestion', () => {
		const r = request([proposal('p2', { replaces: ['p1'], decision: 'accepted', acceptedBy: 'alexis' })]);
		expect(proposalArrival('p1', () => false, proposalFates(r))).toMatchObject({ kind: 'decided', by: 'alexis' });
	});

	it('says a suggestion was taken back, and knows nothing of an id it never held', () => {
		const fates = proposalFates(request([], ['p1']));
		expect(proposalArrival('p1', () => false, fates)).toEqual({ kind: 'withdrawn' });
		expect(proposalArrival('zz', () => false, fates)).toEqual({ kind: 'unknown' });
	});

	it('stops on a loop instead of spinning', () => {
		const fates: Record<string, ProposalFate> = { a: { kind: 'replaced', by: 'b' }, b: { kind: 'replaced', by: 'a' } };
		expect(proposalArrival('a', () => false, fates)).toEqual({ kind: 'unknown' });
	});
});
