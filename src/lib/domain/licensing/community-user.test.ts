import { describe, expect, it } from 'vitest';
import { communityRegistration, communitySignIn } from './community-user';

describe('communitySignIn', () => {
	const holders = ['owner@acme.test'];

	it('refuses a former member signing in after a move down, naming Team', () => {
		const check = communitySignIn('community', { email: 'member@acme.test', holders, severalAccounts: true });
		expect(check.ok).toBe(false);
		if (!check.ok) expect(check.reason).toContain('Team');
	});

	it('lets the holder in, whatever the case of the address', () => {
		expect(communitySignIn('community', { email: ' Owner@Acme.test', holders, severalAccounts: true }).ok).toBe(true);
	});

	it('leaves a single-account source and the paid editions alone', () => {
		expect(communitySignIn('community', { email: 'member@acme.test', holders, severalAccounts: false }).ok).toBe(true);
		expect(communitySignIn('community', { email: 'member@acme.test', holders: [], severalAccounts: true }).ok).toBe(true);
		expect(communitySignIn('enterprise', { email: 'member@acme.test', holders, severalAccounts: true }).ok).toBe(true);
	});
});

describe('communityRegistration', () => {
	it('refuses a second account and an invited one on Community', () => {
		expect(communityRegistration('community', { accountExists: true, viaInvitation: false }).ok).toBe(false);
		expect(communityRegistration('community', { accountExists: false, viaInvitation: true }).ok).toBe(false);
	});

	it('lets the first account be made, and every account on a paid edition', () => {
		expect(communityRegistration('community', { accountExists: false, viaInvitation: false }).ok).toBe(true);
		expect(communityRegistration('enterprise', { accountExists: true, viaInvitation: true }).ok).toBe(true);
	});
});
