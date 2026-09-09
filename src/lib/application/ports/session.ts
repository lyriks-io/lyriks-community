/**
 * Client-safe session shape. The bearer token is NEVER part of this — it lives
 * only in the httpOnly `lyriks_session` cookie, read server-side in hooks.
 */
export type Session = {
	isAuthenticated: boolean;
	/** Present only for a real authenticated user (absent for the dev session). */
	email?: string;
	/**
	 * The account still runs on a generated password its holder never chose (the
	 * installer's bootstrap credential). While true, hooks wall every page except
	 * Settings, where the change lives; the back clears it with the change.
	 */
	mustChangePassword?: boolean;
};

export interface SessionPort {
	current(): Session;
}
