import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type Actor } from './draft';
import { proposeAct } from './acts';
import { canAcceptProposal } from './proposals';

/**
 * The separation of what was read from what was inferred is STRUCTURAL.
 *
 * It used to be guessed by searching the free text for the English words "read"
 * and "infer". On the studio, on 2026-09-23, a reasoning written in French that
 * said exactly what had been read and what had been inferred came back as
 * unacceptable, with a message asserting the opposite of what the text said, and
 * no rewording could fix it.
 */
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const ctx = () => ({
	actor: client,
	at: '2026-09-23T00:00:00.000Z',
	newId: () => 'p1'
});
const checks = { sourceExists: (id: string) => id === 'src-1', bannedWords: [] as string[] };
const request = () =>
	createEvolutionRequest({ id: 'r1', leafIds: ['feat-x'], stage: 'specification' });

const propose = (input: Record<string, unknown>) =>
	proposeAct(
		ctx(),
		request(),
		{
			fieldPath: '01-origin.objective',
			leafId: 'feat-x',
			value: 'Une valeur.',
			reasoning: '',
			citedSourceIds: ['src-1'],
			...input
		} as Parameters<typeof proposeAct>[2],
		checks
	);

const proposalOf = (outcome: ReturnType<typeof propose>) => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request.proposals[0];
};

describe('a reasoning is judged on its two fields, in any language', () => {
	it('accepts the separation when both fields are filled in French', () => {
		const proposal = proposalOf(
			propose({
				whatWasRead: 'Le brief dit qu’un cours plein refuse des membres.',
				whatWasInferred: 'La veille au soir est le dernier moment utile.'
			})
		);
		expect(proposal.reasoningSeparatesReadFromInferred).toBe(true);
		expect(canAcceptProposal(person, proposal).ok).toBe(true);
	});

	it('does not reward English words typed into a single free text', () => {
		const outcome = propose({ reasoning: 'I read the brief and I infer the rest from it.' });
		expect(outcome.ok).toBe(false);
	});

	it('refuses a lone free text when it is proposed, by naming the two fields to fill', () => {
		const outcome = propose({ reasoning: 'Lu dans le brief, puis deduit.' });
		expect(outcome.ok).toBe(false);
		expect(!outcome.ok && outcome.reason).toContain('whatWasRead');
		expect(!outcome.ok && outcome.reason).toContain('whatWasInferred');
	});

	it('refuses one half alone', () => {
		expect(propose({ whatWasRead: 'Le brief.' }).ok).toBe(false);
		expect(propose({ whatWasInferred: 'La conclusion.' }).ok).toBe(false);
	});

	it('a proposal stored before this rule, with one free text, still cannot be accepted', () => {
		const proposal = {
			...proposalOf(propose({ whatWasRead: 'a', whatWasInferred: 'b' })),
			reasoningSeparatesReadFromInferred: false
		};
		const verdict = canAcceptProposal(person, proposal);
		expect(verdict.ok).toBe(false);
		expect(verdict.ok === false && verdict.reason).toContain('whatWasRead');
	});

	it('still honours the explicit flag, so nothing in flight is invalidated', () => {
		const proposal = proposalOf(
			propose({ reasoning: 'Lu dans le brief, puis deduit.', readVsInferred: true })
		);
		expect(proposal.reasoningSeparatesReadFromInferred).toBe(true);
	});

	it('composes the free text from the two halves when only they were given', () => {
		const proposal = proposalOf(
			propose({ whatWasRead: 'Ce que dit le brief.', whatWasInferred: 'Ce qu’on en deduit.' })
		);
		expect(proposal.reasoning).toBe('Ce que dit le brief.\n\nCe qu’on en deduit.');
		expect(proposal.whatWasRead).toBe('Ce que dit le brief.');
		expect(proposal.whatWasInferred).toBe('Ce qu’on en deduit.');
	});
});
