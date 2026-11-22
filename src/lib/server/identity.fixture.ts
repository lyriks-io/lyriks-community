import { IdentityError, type IdentityAccount, type IdentityProviderPort, type IdentityResult, type RegisterInput } from '$application/ports';

/**
 * An identity source held in memory: accounts with their passwords and names,
 * the session tokens issued to them, and what a test reads back (who is
 * registered, which tokens still verify, what the first run was told).
 */

interface Account {
	id: string;
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	mustChangePassword: boolean;
}

export interface MemoryIdentity extends IdentityProviderPort {
	/** The registered addresses, in registration order. */
	emails(): string[];
	/** The account a token still opens, if any. */
	accountOf(token: string): Account | undefined;
	/** Issue a session for an existing account, as a sign-in would. */
	sessionFor(email: string): string;
	readonly firstRuns: Array<{ token: string; customer: string; edition?: string }>;
}

export function memoryIdentity(
	seed: Array<Partial<Account> & { email: string; password?: string }> = [],
	opts: { multiUser?: boolean; configured?: boolean } = {}
): MemoryIdentity {
	const accounts: Account[] = seed.map((a, i) => ({
		id: a.id ?? `u-${i + 1}`,
		email: a.email,
		password: a.password ?? 'correct horse battery',
		firstName: a.firstName ?? '',
		lastName: a.lastName ?? '',
		mustChangePassword: a.mustChangePassword ?? false
	}));
	const sessions = new Map<string, Account>();
	const firstRuns: MemoryIdentity['firstRuns'] = [];
	let issued = 0;
	const find = (email: string) => accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
	const issue = (account: Account): string => {
		const token = `token-${++issued}-${account.id}`;
		sessions.set(token, account);
		return token;
	};
	const view = (a: Account): IdentityAccount => ({ id: a.id, email: a.email, mustChangePassword: a.mustChangePassword });
	const caller = (token: string): Account => {
		const account = sessions.get(token);
		if (!account) throw new IdentityError(401, 'Your session has expired. Sign in again.');
		return account;
	};
	return {
		configured: opts.configured ?? true,
		multiUser: opts.multiUser ?? true,
		registrationOpen: async () => accounts.length === 0,
		installUnclaimed: async () => accounts.length === 0,
		login: async (email, password): Promise<IdentityResult> => {
			const account = find(email);
			return account && account.password === password ? { token: issue(account) } : { error: 'Invalid email or password.' };
		},
		register: async (input: RegisterInput): Promise<IdentityResult> => {
			if (find(input.email)) return { error: 'This email is already registered.' };
			const account: Account = {
				id: `u-${accounts.length + 1}`,
				email: input.email,
				password: input.password,
				firstName: input.firstName ?? '',
				lastName: input.lastName ?? '',
				mustChangePassword: input.mustChangePassword ?? false
			};
			accounts.push(account);
			return { token: issue(account) };
		},
		verify: async (token) => {
			const account = sessions.get(token);
			return account ? view(account) : null;
		},
		changePassword: async (token, current, next) => {
			const account = caller(token);
			if (account.password !== current) throw new IdentityError(401, 'Current password is incorrect.');
			if (next.length < 12) throw new IdentityError(422, 'Choose a password of at least 12 characters.');
			account.password = next;
			account.mustChangePassword = false;
			// Like the real sources: the change ends every session the old password opened.
			for (const [t, a] of sessions) if (a === account) sessions.delete(t);
		},
		revokeSessions: async (token) => {
			const account = sessions.get(token);
			if (!account) return;
			for (const [t, a] of sessions) if (a === account) sessions.delete(t);
		},
		profile: async (token) => {
			const account = sessions.get(token);
			return account ? { firstName: account.firstName, lastName: account.lastName } : null;
		},
		updateProfile: async (token, profile) => {
			const account = caller(token);
			account.firstName = profile.firstName;
			account.lastName = profile.lastName;
		},
		afterFirstRun: async (token, licence) => {
			firstRuns.push({ token, ...licence });
		},
		emails: () => accounts.map((a) => a.email),
		accountOf: (token) => sessions.get(token),
		sessionFor: (email) => {
			const account = find(email);
			if (!account) throw new Error(`no account for ${email}`);
			return issue(account);
		},
		firstRuns
	};
}
