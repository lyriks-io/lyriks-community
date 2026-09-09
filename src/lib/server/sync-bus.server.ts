import { EventEmitter } from 'node:events';
import pg from 'pg';
import { env } from '$env/dynamic/private';
import type { SectionChangeEvent, SectionChangePublisher } from '$application/ports';
import { getPgPool } from '$infrastructure/persistence/postgres/pg-database.server';

/**
 * Pub/sub for "a project's wizard section changed". Every write — the UI's
 * `PUT /api/draft/*` autosave or the Lyriks MCP (same routes) — publishes here;
 * the `/api/sync/events` SSE endpoint fans changes out to every open browser so
 * it refreshes live, no F5.
 *
 * Two interchangeable backends behind the SAME two functions:
 *  - **memory** (default): a single-process EventEmitter — the appliance / one node.
 *  - **postgres** (`LYRIKS_BUS=postgres`): a
 *    Postgres `LISTEN/NOTIFY` channel, so N stateless platform nodes all see every
 *    change. Publish = `pg_notify`; a dedicated listener connection feeds remote
 *    (and own) events back into the local emitter that SSE connections subscribe to.
 */

/** The bus broadcasts the port's event type — one definition, no drift
 *  between what publishers serialize and what the LISTEN handler parses. */
export type SectionChange = SectionChangeEvent;

const EVENT = 'section-change';
const CHANNEL = 'lyriks_section_change';

// Local fan-out to THIS node's SSE connections. Always used; in postgres mode it
// is fed by the LISTEN connection rather than directly by publish.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let warnedBadBus = false;

/** The active bus backend — exposed on `/readyz` so an orchestrator can assert
 *  `LYRIKS_BUS=postgres` on every replica of a multi-node deployment. */
export function busBackend(): 'memory' | 'postgres' {
	const raw = (env.LYRIKS_BUS ?? '').trim();
	const b = raw.toLowerCase();
	if (b === 'postgres' || b === 'memory') return b;
	// An unrecognized value silently degrading to the single-process memory bus
	// is exactly the HA misconfiguration that breaks cross-replica refresh —
	// make it loud. (Empty stays the appliance default: memory, no warning.)
	if (raw && !warnedBadBus) {
		warnedBadBus = true;
		console.warn(
			`[sync-bus] Unknown LYRIKS_BUS value "${raw}" — falling back to the in-process memory bus. ` +
				'Multi-replica deployments MUST set LYRIKS_BUS=postgres or cross-node live refresh will not work.'
		);
	}
	return 'memory';
}

// ── Postgres LISTEN connection (dedicated, auto-reconnecting, started lazily) ──
let pgListener: pg.Client | null = null;
let starting = false;

function startPgListener(): void {
	if (pgListener || starting) return;
	const connectionString = env.LYRIKS_PG_URL;
	if (!connectionString) return; // misconfigured; the publish path will warn
	starting = true;
	const client = new pg.Client({ connectionString });
	client.on('notification', (msg) => {
		if (!msg.payload) return;
		try {
			emitter.emit(EVENT, JSON.parse(msg.payload) as SectionChange);
		} catch {
			/* ignore a malformed payload */
		}
	});
	const reconnect = () => {
		pgListener = null;
		starting = false;
		// Reconnect after a short delay so a transient DB blip self-heals.
		setTimeout(startPgListener, 2000);
	};
	client.on('error', reconnect);
	client.on('end', reconnect);
	client
		.connect()
		.then(() => client.query(`LISTEN ${CHANNEL}`))
		.then(() => {
			pgListener = client;
			starting = false;
		})
		.catch((e) => {
			console.warn(
				'[sync-bus] LISTEN connect failed, retrying:',
				e instanceof Error ? e.message : e
			);
			reconnect();
		});
}

export function publishSectionChange(change: SectionChange): void {
	if (busBackend() === 'postgres') {
		startPgListener();
		// Fire-and-forget NOTIFY; the LISTEN loopback delivers it to every node
		// (including this one), so we do NOT also emit locally.
		void getPgPool()
			.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(change)])
			.catch((e) =>
				console.warn('[sync-bus] pg_notify failed:', e instanceof Error ? e.message : e)
			);
		return;
	}
	emitter.emit(EVENT, change);
}

/**
 * The transactional flavour of `publishSectionChange`, for the consolidated
 * section-document store: on the Postgres bus the NOTIFY rides the caller's
 * save transaction (committed atomically with the document write); on the
 * memory bus the event is emitted right after the commit instead. Exactly one
 * of the two methods actually publishes for a given backend.
 */
export const txSectionChangePublisher: SectionChangePublisher = {
	async publishInTx(exec, change) {
		if (busBackend() !== 'postgres') return;
		startPgListener();
		await exec('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(change)]);
	},
	publishAfterCommit(change) {
		if (busBackend() === 'postgres') return; // delivered via the LISTEN loopback
		emitter.emit(EVENT, change);
	}
};

/** Subscribe to every section change. Returns an unsubscribe function. */
export function subscribeSectionChanges(listener: (change: SectionChange) => void): () => void {
	if (busBackend() === 'postgres') startPgListener();
	emitter.on(EVENT, listener);
	return () => emitter.off(EVENT, listener);
}
