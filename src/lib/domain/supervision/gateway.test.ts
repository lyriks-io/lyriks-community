import { describe, it, expect } from 'vitest';
import { createGatewayKey } from './draft';
import {
	deriveMemberGateway,
	evaluateGatewayPolicy,
	memberKeyValue,
	memberRef,
	rosterFrom,
	type MemberGatewayView,
	type RosterMember
} from './gateway';

describe('member identity', () => {
	it('prefers email, then id, then name as the stable ref', () => {
		expect(memberRef({ name: 'Ana Costa', email: 'ana@corp.com', id: 'u1' })).toBe('ana@corp.com');
		expect(memberRef({ name: 'Ana Costa', id: 'u1' })).toBe('u1');
		expect(memberRef({ name: 'Ana Costa' })).toBe('Ana Costa');
	});

	it('keys a member by their email slug, so the key follows the login', () => {
		expect(memberKeyValue('proj1', 'ana.costa@corp.com')).toBe(
			'sk-lyriks-proj1-member-ana-costa-corp-com'
		);
	});

	it('builds a roster from raw collaborators', () => {
		const roster = rosterFrom([
			{ id: 'u1', name: 'Ana Costa', email: 'ana@corp.com' },
			{ id: 'u2', name: 'Ben Toure', email: '' }
		]);
		expect(roster).toEqual([
			{ ref: 'ana@corp.com', name: 'Ana Costa', email: 'ana@corp.com' },
			{ ref: 'u2', name: 'Ben Toure', email: undefined }
		]);
	});
});

describe('deriveMemberGateway', () => {
	const roster: RosterMember[] = [
		{ ref: 'ana@corp.com', name: 'Ana Costa', email: 'ana@corp.com' },
		{ ref: 'ben@corp.com', name: 'Ben Toure', email: 'ben@corp.com' }
	];

	it('resolves display name from the roster and matches keys by ref', () => {
		const keys = [createGatewayKey({ member: 'ana@corp.com', monthlyBudgetUsd: 40, spentUsd: 10 })];
		const views = deriveMemberGateway('proj1', roster, keys, []);
		expect(views.map((v) => v.member)).toEqual(['ana@corp.com', 'ben@corp.com']);

		const ana = views[0];
		expect(ana.name).toBe('Ana Costa');
		expect(ana.email).toBe('ana@corp.com');
		expect(ana.keyValue).toBe('sk-lyriks-proj1-member-ana-corp-com');
		expect(ana.key?.monthlyBudgetUsd).toBe(40);
		expect(ana.budgetPct).toBe(25); // 10 / 40

		const ben = views[1];
		expect(ben.key).toBeNull();
		expect(ben.budgetPct).toBe(0);
	});

	it('still surfaces a keyed member who has left the team (no orphaned spend)', () => {
		const keys = [createGatewayKey({ member: 'gone@corp.com', monthlyBudgetUsd: 20, spentUsd: 5 })];
		const views = deriveMemberGateway('proj1', roster, keys, []);
		const gone = views.find((v) => v.member === 'gone@corp.com');
		expect(gone).toBeDefined();
		expect(gone?.name).toBe('gone@corp.com'); // falls back to the ref
		expect(gone?.spentUsd).toBe(5);
	});
});

describe('evaluateGatewayPolicy (live cost checks)', () => {
	const view = (over: Partial<MemberGatewayView>): MemberGatewayView => ({
		member: 'ana@corp.com',
		name: 'Ana Costa',
		key: createGatewayKey({ member: 'ana@corp.com', monthlyBudgetUsd: 40 }),
		keyValue: 'sk',
		spentUsd: 0,
		tokensUsed: 0,
		calls: 0,
		blocked: 0,
		flagged: 0,
		budgetPct: 0,
		quotaPct: 0,
		recent: [],
		...over
	});

	it('flags a member over their budget as a violation', () => {
		const checks = evaluateGatewayPolicy([view({ budgetPct: 120 })], 0.3);
		const m = checks.find((c) => c.id === 'member-budgets')!;
		expect(m.status).toBe('violation');
	});

	it('warns when project spend is hot and violates when blown', () => {
		expect(evaluateGatewayPolicy([], 0.95).find((c) => c.id === 'project-budget')!.status).toBe(
			'warn'
		);
		expect(evaluateGatewayPolicy([], 1.2).find((c) => c.id === 'project-budget')!.status).toBe(
			'violation'
		);
	});

	it('warns when no member keys are provisioned', () => {
		const m = evaluateGatewayPolicy([], 0.1).find((c) => c.id === 'member-budgets')!;
		expect(m.status).toBe('warn');
	});
});
