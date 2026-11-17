import { describe, it, expect } from 'vitest';
import { detectIssues, earsOfDetectedEdge } from './detection';
import { readsAsEars } from './ears-keywords';
import type { ConsolidatedRule } from './draft';

let n = 0;
const rule = (label: string, statement: string, over: Partial<ConsolidatedRule> = {}): ConsolidatedRule => ({
	id: `r${n++}`,
	label,
	category: 'business',
	source: 'journey',
	sourceRefId: `src${n}`,
	statement,
	mandatory: true,
	...over
});

const contradictions = (rules: ConsolidatedRule[]) =>
	detectIssues(rules).filter((i) => i.kind === 'contradiction');

describe('H2 contradiction detection — evidence, not coincidence', () => {
	// The regression both retrospectives hit: mandatory, well-written journey
	// descriptions were paired on incidental English words and each pairing
	// became a CRITICAL blocker on the completion gate.
	it('does not pair two unrelated journeys that merely share generic prose', () => {
		const rules = [
			rule(
				'From install to a home that is actually shared',
				'The guardian completes the onboarding steps and invites the household members.'
			),
			rule(
				'The Sunday huddle',
				'The household reviews the shared rota; no steps are skipped when a member is away.'
			)
		];
		expect(contradictions(rules)).toHaveLength(0);
	});

	it('needs more than one shared salient token', () => {
		const rules = [
			rule('Invoices', 'Every invoice is archived.'),
			rule('Reminders', 'A reminder cannot be archived.')
		];
		// The rules overlap on "archived" only — one incidental token, below the
		// threshold, and they are about different subjects.
		expect(contradictions(rules)).toHaveLength(0);
	});

	it('does flag a genuine exception that shares two subject tokens', () => {
		const rules = [
			rule('Invoices', 'Every invoice is archived.'),
			rule('Drafts', 'A draft invoice cannot be archived.')
		];
		// "invoice" AND "archived" overlap, and one clause negates archiving —
		// a real exception the team should confirm.
		expect(contradictions(rules)).toHaveLength(1);
	});

	it('still finds a real disagreement about the same subject', () => {
		const rules = [
			rule('Member billing access', 'Any household member can edit billing details for the household.'),
			rule('Guardian-only billing', 'A household member cannot edit billing details; only the guardian can.')
		];
		const found = contradictions(rules);
		expect(found).toHaveLength(1);
		expect(found[0].title).toContain('Possible conflict');
	});

	// The gate fix: a lexical guess must never block.
	it('rates its findings major, never critical, so the completion gate stays open', () => {
		const rules = [
			rule('Member billing access', 'Any household member can edit billing details for the household.'),
			rule('Guardian-only billing', 'A household member cannot edit billing details; only the guardian can.')
		];
		expect(contradictions(rules)[0].severity).toBe('major');
		expect(contradictions(rules).some((i) => i.severity === 'critical')).toBe(false);
	});

	it('reads negation per clause, so a stray "never" elsewhere does not flip polarity', () => {
		const rules = [
			rule(
				'Invite flow',
				'A household member can invite guests to the household, but billing details are never edited here.'
			),
			rule('Guest invites', 'A household member can invite guests to the household at any time.')
		];
		// Both ALLOW inviting; the negation belongs to billing, not invitations.
		expect(contradictions(rules)).toHaveLength(0);
	});

	it('ignores two rules that restate the same source', () => {
		const rules = [
			rule('A', 'Any household member can edit billing details.', { sourceRefId: 'doc-1' }),
			rule('B', 'A household member cannot edit billing details.', { sourceRefId: 'doc-1' })
		];
		expect(contradictions(rules)).toHaveLength(0);
	});

	it('only pairs business rules', () => {
		const rules = [
			rule('A', 'Any household member can edit billing details.', { category: 'permissions' }),
			rule('B', 'A household member cannot edit billing details.', { category: 'permissions' })
		];
		expect(contradictions(rules)).toHaveLength(0);
	});

	it('reports each pair once', () => {
		const rules = [
			rule('Member billing access', 'Any household member can edit billing details for the household.'),
			rule('Guardian-only billing', 'A household member cannot edit billing details; only the guardian can.')
		];
		const found = contradictions([...rules, ...rules]);
		const keys = new Set(found.map((i) => i.key));
		expect(keys.size).toBe(found.length);
	});
});

describe('the other heuristics still fire', () => {
	it('H1 flags a vague term', () => {
		const found = detectIssues([rule('Response time', 'We reply asap.')]);
		expect(found.some((i) => i.kind === 'ambiguity')).toBe(true);
	});

	it('H3 flags an external touchpoint with no failure path', () => {
		const found = detectIssues([rule('Checkout', 'The member pays by card.')]);
		expect(found.some((i) => i.kind === 'unhandled_edge')).toBe(true);
	});
});

describe('detection in a French spec', () => {
	const NB = ' ';

	it('finds French vague terms as whole words, and titles them in French', () => {
		const issues = detectIssues(
			[rule('Remboursement', 'Le remboursement est traité rapidement, il évite les litiges.', { source: 'sla' })],
			'fr'
		).filter((i) => i.kind === 'ambiguity');
		expect(issues.map((i) => i.key)).toEqual([expect.stringMatching(/::rapidement$/)]);
		expect(issues[0].title).toBe(`Définir «${NB}rapidement${NB}» dans «${NB}Remboursement${NB}»`);
		expect(issues[0].detail).toContain(`apparaît dans${NB}: «${NB}Le remboursement`);
	});

	it('does not read English vague terms into French prose', () => {
		const issues = detectIssues([rule('Export', 'Exporter les commandes du mois.', { source: 'sla' })], 'fr');
		expect(issues.filter((i) => i.kind === 'ambiguity')).toEqual([]);
	});

	it('asks what happens when a French external touchpoint fails', () => {
		const [edge] = detectIssues([rule('Commande', 'Le client valide le paiement.')], 'fr').filter(
			(i) => i.kind === 'unhandled_edge'
		);
		expect(edge.title).toBe(`Et si «${NB}paiement${NB}» échoue dans «${NB}Commande${NB}»${NB}?`);
		expect(edge.detail).toContain("en cas d'échec, de refus ou de délai dépassé");
	});

	it('titles a possible conflict in French, keyed by the rule ids only', () => {
		const a = rule('Remise', 'Les clients fidèles reçoivent une remise mensuelle sur leur abonnement.');
		const b = rule('Tarif', 'Les clients fidèles ne reçoivent jamais de remise mensuelle.');
		const [fr] = detectIssues([a, b], 'fr').filter((i) => i.kind === 'contradiction');
		expect(fr.title).toBe(`Conflit possible${NB}: «${NB}Remise${NB}» contre «${NB}Tarif${NB}»`);
		expect(fr.key).toBe(`contradiction::${[a.id, b.id].sort().join('::')}`);
		expect(fr.detail).toContain('Simple correspondance lexicale');
	});

	it('keeps the English templates by default', () => {
		const [edge] = detectIssues([rule('Checkout', 'The user confirms the payment.')]).filter(
			(i) => i.kind === 'unhandled_edge'
		);
		expect(edge.title).toBe('What if “payment” fails in Checkout?');
	});
});

describe('a missing failure path reads as the requirement it leaves open [criterion:ad34b2f4]', () => {
	const NB = '\u00a0';
	const edgeOf = (r: ReturnType<typeof rule>, lang?: 'fr') => detectIssues([r], lang).find((i) => i.kind === 'unhandled_edge')!;

	it('writes the English title as an unwanted-behaviour EARS statement, the response left open', () => {
		const ears = earsOfDetectedEdge(edgeOf(rule('Checkout', 'The user confirms the payment.')).title);
		expect(ears).toBe('If “payment” fails in Checkout, then the system shall …');
		expect(readsAsEars(ears)).toBe(true);
	});

	it('writes the French title in French EARS', () => {
		const ears = earsOfDetectedEdge(edgeOf(rule('Commande', 'Le client valide le paiement.'), 'fr').title);
		expect(ears).toBe(`Si «${NB}paiement${NB}» échoue dans «${NB}Commande${NB}», alors le système doit …`);
		expect(readsAsEars(ears)).toBe(true);
	});

	it('leaves any other title alone, whatever wrote it', () => {
		expect(earsOfDetectedEdge('Possible conflict: Sign in vs Invite')).toBeNull();
		expect(earsOfDetectedEdge('Removed domain keeps serving its short links')).toBeNull();
	});
});
