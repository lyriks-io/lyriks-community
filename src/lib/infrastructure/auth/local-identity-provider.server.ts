import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { pgQuery } from '$infrastructure/persistence/postgres/pg-database.server';
import {
	IdentityError,
	type IdentityAccount,
	type IdentityProviderPort,
	type IdentityResult,
	type RegisterInput
} from '$application/ports';

/**
 * Identity held by the platform itself: the Community operator account, in the
 * platform's own PostgreSQL, with no Back anywhere.
 *
 * Deliberately interchangeable with the Back's account: the same bcrypt hash
 * format and the same HS256 session token (`sub` = account id, signed with the
 * shared JWT secret), so the MCP gateway verifies a session from either source
 * without knowing which issued it, and an account migrates in either direction
 * between editions by copying one row.
 *
 * One operator only: registration closes for good with the first account.
 */
export interface OperatorAccountRow {
	id: string;
	email: string;
	password_hash: string;
	must_change_password: boolean;
	session_version: number;
}

export type QueryFn = <R>(
	sql: string,
	params?: readonly unknown[]
) => Promise<{ rows: R[] }>;

const SESSION_TTL_SECONDS = 7 * 24 * 3600;
const TOKEN_ISSUER = 'lyriks-platform';
/** The bar for a password chosen at sign-up or first run (the Back's RegisterUser). */
const MIN_PASSWORD = 8;
/** The higher bar for a password chosen from inside the product (the Back's ChangePassword). */
const MIN_CHANGED_PASSWORD = 12;
const BCRYPT_ROUNDS = 12;

export class LocalIdentityProvider implements IdentityProviderPort {
	readonly multiUser = false;
	readonly #key: Uint8Array;
	readonly #query: QueryFn;

	constructor(secret: string, query: QueryFn = pgQuery as unknown as QueryFn) {
		this.#key = new TextEncoder().encode(secret);
		this.#query = query;
	}

	get configured(): boolean {
		return this.#key.length > 0;
	}

	async #count(): Promise<number> {
		const { rows } = await this.#query<{ n: string | number }>(
			'SELECT count(*)::int AS n FROM operator_accounts'
		);
		return Number(rows[0]?.n ?? 0);
	}

	/** Fail-open, like the Back: all this governs is a sign-up link. */
	async registrationOpen(): Promise<boolean> {
		try {
			return (await this.#count()) === 0;
		} catch {
			return true;
		}
	}

	/** Fail-closed, like the Back: this opens the claim window. */
	async installUnclaimed(): Promise<boolean> {
		try {
			return (await this.#count()) === 0;
		} catch {
			return false;
		}
	}

	async login(email: string, password: string): Promise<IdentityResult> {
		if (!this.configured) return { error: 'Authentication is not configured (LYRIKS_JWT_SECRET unset).' };
		const account = await this.#findByEmail(email);
		if (!account || !(await bcrypt.compare(password, account.password_hash))) {
			return { error: 'Invalid email or password.' };
		}
		return { token: await this.#sign(account.id, account.session_version) };
	}

	async register(input: RegisterInput): Promise<IdentityResult> {
		if (!this.configured) return { error: 'Authentication is not configured (LYRIKS_JWT_SECRET unset).' };
		const email = input.email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
		if (input.password.length < MIN_PASSWORD) {
			return { error: `Choose a password of at least ${MIN_PASSWORD} characters.` };
		}
		if ((await this.#count()) > 0) {
			return { error: 'registration is closed: this installation already has its operator account.' };
		}
		const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
		const { rows } = await this.#query<{ id: string }>(
			`INSERT INTO operator_accounts (email, password_hash, must_change_password)
			 VALUES ($1, $2, $3)
			 RETURNING id`,
			[email, hash, input.mustChangePassword === true]
		);
		return { token: await this.#sign(rows[0].id, 0) };
	}

	async verify(token: string): Promise<IdentityAccount | null | 'unreachable'> {
		let id: string;
		let version: number;
		try {
			const { payload } = await jwtVerify(token, this.#key, { issuer: TOKEN_ISSUER, algorithms: ['HS256'] });
			if (typeof payload.sub !== 'string') return null;
			id = payload.sub;
			version = typeof payload.session_version === 'number' ? payload.session_version : 0;
		} catch {
			return null;
		}
		try {
			const row = await this.#findById(id);
			return row && row.session_version === version ? view(row) : null;
		} catch {
			return 'unreachable';
		}
	}

	async changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
		const account = await this.verify(token);
		if (account === 'unreachable') throw new IdentityError(502, 'The account store is unavailable.');
		if (!account) throw new IdentityError(401, 'Sign in again to change your password.');
		const row = await this.#findById(account.id);
		if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
			throw new IdentityError(401, 'Current password is incorrect.');
		}
		if (newPassword.length < MIN_CHANGED_PASSWORD) {
			throw new IdentityError(422, `Choose a password of at least ${MIN_CHANGED_PASSWORD} characters.`);
		}
		const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
		await this.#query(
			`UPDATE operator_accounts
			 SET password_hash = $2, must_change_password = false, session_version = session_version + 1, updated_at = now()
			 WHERE id = $1`,
			[row.id, hash]
		);
	}

	/** Logout terminates every session of the single operator, including MCP grants. */
	async revokeSessions(token: string): Promise<void> {
		const account = await this.verify(token);
		if (account === 'unreachable') throw new IdentityError(503, 'The account store is unavailable.');
		if (!account) return;
		await this.#query('UPDATE operator_accounts SET session_version = session_version + 1 WHERE id = $1', [account.id]);
	}

	/** The operator's name lives in the operator profile, not on the account. */
	async profile(): Promise<null> {
		return null;
	}

	async updateProfile(): Promise<void> {
		throw new IdentityError(501, 'The operator name is edited in the operator profile.');
	}

	/** One operator, nothing to provision. */
	async afterFirstRun(): Promise<void> {}

	async #sign(id: string, version: number): Promise<string> {
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({ sub: id, session_version: version })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuer(TOKEN_ISSUER)
			.setIssuedAt(now)
			.setExpirationTime(now + SESSION_TTL_SECONDS)
			.sign(this.#key);
	}

	async #findByEmail(email: string): Promise<OperatorAccountRow | null> {
		const { rows } = await this.#query<OperatorAccountRow>(
			'SELECT id, email, password_hash, must_change_password, session_version FROM operator_accounts WHERE email = $1',
			[email.trim().toLowerCase()]
		);
		return rows[0] ?? null;
	}

	async #findById(id: string): Promise<OperatorAccountRow | null> {
		const { rows } = await this.#query<OperatorAccountRow>(
			'SELECT id, email, password_hash, must_change_password, session_version FROM operator_accounts WHERE id = $1',
			[id]
		);
		return rows[0] ?? null;
	}
}

function view(row: OperatorAccountRow): IdentityAccount {
	return { id: row.id, email: row.email, mustChangePassword: row.must_change_password === true };
}
