import pg from 'pg';
import { env } from '$env/dynamic/private';
import { runMigrations } from './pg-migrations.server';

/**
 * PostgreSQL connection pool for platform persistence in every deployment profile.
 * Opened lazily and reused process-wide. Connection string from LYRIKS_PG_URL
 * (e.g. postgres://user:pass@host:5432/lyriks_platform).
 *
 * Schema migrations (see pg-migrations.server.ts) run once per process, guarded
 * by a shared promise (the composition root is synchronous, so every query
 * awaits `ready()` first) and an advisory lock across replicas.
 */
let pool: pg.Pool | null = null;
let migrated: Promise<void> | null = null;

/** Provisional constant pgPoolMin: connections kept open while idle, so the first pages after a start find them. */
const DEFAULT_POOL_MIN = 4;

/** pg-pool's message when no connection could be had in `connectionTimeoutMillis`. */
const CONNECT_TIMEOUT = 'timeout exceeded when trying to connect';

function positiveInt(raw: string | undefined): number | null {
	const value = Number.parseInt(raw ?? '', 10);
	return Number.isFinite(value) && value > 0 ? value : null;
}

/** How many connections the pool keeps open (LYRIKS_PG_POOL_MIN, 0 for none), never more than its maximum. */
export function poolMin(raw: string | undefined, max: number): number {
	const value = Number.parseInt(raw ?? '', 10);
	const min = Number.isFinite(value) && value >= 0 ? value : DEFAULT_POOL_MIN;
	return Math.min(min, max);
}

export function getPgPool(): pg.Pool {
	if (pool) return pool;
	const connectionString = env.LYRIKS_PG_URL;
	if (!connectionString) {
		throw new Error('LYRIKS_PG_URL is required');
	}
	// Bound connection acquisition so a dead DB fails fast (readiness probes,
	// best-effort mirror) instead of hanging on a frozen socket. `max` is sized per
	// node (override via LYRIKS_PG_POOL_MAX) — keep node_count × max under the
	// server's max_connections, or front the pool with PgBouncer. `statement_timeout`
	// keeps one slow query from pinning a connection indefinitely under load.
	const max = positiveInt(env.LYRIKS_PG_POOL_MAX) ?? 20;
	const statementTimeout = positiveInt(env.LYRIKS_PG_STATEMENT_TIMEOUT_MS) ?? 15000;
	pool = new pg.Pool({
		connectionString,
		connectionTimeoutMillis: 3000,
		max,
		// A few connections stay open while idle: after a start, the first pages
		// opened dozens at once, each on a thread busy computing, and some gave
		// up on the connect timeout.
		min: poolMin(env.LYRIKS_PG_POOL_MIN, max),
		idleTimeoutMillis: 30000,
		statement_timeout: statementTimeout
	});
	return pool;
}

/** Opens the connections the pool keeps, once the schema is ready. A failure is left to the next query. */
async function openKeptConnections(target: pg.Pool): Promise<void> {
	const min = target.options.min ?? 0;
	const clients = await Promise.all(
		Array.from({ length: min }, () => target.connect().catch(() => null))
	);
	for (const client of clients) client?.release();
}

/** Run migrations once; every repository query awaits this before its statement. */
export function ready(): Promise<void> {
	if (!migrated) {
		const target = getPgPool();
		const attempt = runMigrations(target).then(() => {
			void openKeptConnections(target);
		});
		migrated = attempt.catch((error) => {
			// A transient boot failure must not poison this process forever. The next
			// readiness/query attempt may retry after the database recovers.
			migrated = null;
			throw error;
		});
	}
	return migrated;
}

/** True when the statement never reached the database: no connection could be had in time. */
export function isConnectTimeout(error: unknown): boolean {
	return error instanceof Error && error.message === CONNECT_TIMEOUT;
}

/**
 * Convenience: ensure-migrated + query. Params use $1, $2 … placeholders.
 *
 * A statement that found no connection in time is tried once more: it never
 * reached the database, so running it again cannot apply it twice, and the
 * wait it met is usually a moment of contention (a burst of first pages after
 * a start) rather than a database that is down.
 */
export async function pgQuery<R extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	values: unknown[] = []
): Promise<pg.QueryResult<R>> {
	await ready();
	try {
		return await getPgPool().query<R>(text, values);
	} catch (error) {
		if (!isConnectTimeout(error)) throw error;
		return getPgPool().query<R>(text, values);
	}
}
