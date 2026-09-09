import { describe, it, expect } from 'vitest';
import { detectIssues } from './detection';
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
