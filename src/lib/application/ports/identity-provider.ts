/**
 * Where accounts live and who says a session is real.
 *
 * Two sources exist. Enterprise delegates identity to lyriks-back (many
 * accounts, workspaces, invitations). Community holds ONE operator account in
 * the platform's own datastore and runs without the Back at all. Every surface
 * that signs someone in, verifies a session or changes a password speaks to
 * this port, so neither the login page nor the request hook knows which one
 * answers.
 */
export interface IdentityAccount {
	readonly id: string;
	readonly email: string;
	/** Still on a password its holder never chose (an installer's bootstrap credential). */
	readonly mustChangePassword: boolean;
}

/** A credential exchange: the session token, or the refusal in the user's words. */
export type IdentityResult = { readonly token: string } | { readonly error: string };

export interface RegisterInput {
	readonly email: string;
	readonly password: string;
	readonly firstName?: string;
	readonly lastName?: string;
	readonly mustChangePassword?: boolean;
}

/** A refusal with the HTTP status a route should answer with. */
export class IdentityError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'IdentityError';
	}
}

export interface IdentityProviderPort {
	/** An identity source is configured at all (else sign-in cannot work). */
	readonly configured: boolean;
	/**
	 * Accounts beyond the operator can exist: workspaces, roles, invitations.
	 * False is the single-operator install, where every authenticated request is
	 * the operator's and nothing is scoped by team.
	 */
	readonly multiUser: boolean;
	/** Self-registration is open (only until the first account). Fail-open. */
	registrationOpen(): Promise<boolean>;
	/** No account exists yet: the first-run claim window. Fail-closed. */
	installUnclaimed(): Promise<boolean>;
	login(email: string, password: string): Promise<IdentityResult>;
	register(input: RegisterInput): Promise<IdentityResult>;
	/** The account behind a session token; null when invalid, 'unreachable' when the source cannot answer. */
	verify(token: string): Promise<IdentityAccount | null | 'unreachable'>;
	/** Replace the caller's password after checking the current one. Throws IdentityError. */
	changePassword(token: string, currentPassword: string, newPassword: string): Promise<void>;
	/** Invalidate sessions where this identity source supports operator session revocation. */
	revokeSessions?(token: string): Promise<void>;
	/** The caller's own name parts, when the source keeps them; null otherwise. */
	profile(token: string): Promise<{ firstName: string; lastName: string } | null>;
	/** Update the caller's own name parts. Throws IdentityError when the source cannot. */
	updateProfile(token: string, profile: { firstName: string; lastName: string }): Promise<void>;
	/**
	 * What the source does once the first account has claimed the install (an
	 * Enterprise source gives it a workspace named after the licence customer).
	 * Never fatal.
	 */
	afterFirstRun(token: string, licence: { customer: string; edition?: string }): Promise<void>;
}
