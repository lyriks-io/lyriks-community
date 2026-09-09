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
	const max = Number.parseInt(env.LYRIKS_PG_POOL_MAX ?? '', 10);
	const statementTimeout = Number.parseInt(env.LYRIKS_PG_STATEMENT_TIMEOUT_MS ?? '', 10);
	pool = new pg.Pool({
		connectionString,
		connectionTimeoutMillis: 3000,
		max: Number.isFinite(max) && max > 0 ? max : 20,
		idleTimeoutMillis: 30000,
		statement_timeout: Number.isFinite(statementTimeout) && statementTimeout > 0 ? statementTimeout : 15000
	});
	return pool;
}

/** Run migrations once; every repository query awaits this before its statement. */
export function ready(): Promise<void> {
	if (!migrated) {
		const attempt = runMigrations(getPgPool());
		migrated = attempt.catch((error) => {
			// A transient boot failure must not poison this process forever. The next
			// readiness/query attempt may retry after the database recovers.
			migrated = null;
			throw error;
		});
	}
	return migrated;
}

/** Convenience: ensure-migrated + query. Params use $1, $2 … placeholders. */
export async function pgQuery<R extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	values: unknown[] = []
): Promise<pg.QueryResult<R>> {
	await ready();
	return getPgPool().query<R>(text, values);
}
