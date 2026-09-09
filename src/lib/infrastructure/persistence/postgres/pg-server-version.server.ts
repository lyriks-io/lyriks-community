import type { DatastoreVersionProbePort } from '$application/ports';
import { pgQuery } from './pg-database.server';

/** `PostgreSQL 16.4 (Debian …) on x86_64…` → `16.4`, the part an operator needs. */
function shortVersion(banner: string): string {
	return /PostgreSQL\s+([0-9]+(?:\.[0-9]+)*)/i.exec(banner)?.[1] ?? banner.trim();
}

/** The datastore's own version, for the components screen. */
export class PgServerVersion implements DatastoreVersionProbePort {
	async serverVersion(): Promise<string | null> {
		const res = await pgQuery<{ version: string }>('SELECT version()');
		const banner = res.rows[0]?.version;
		return banner ? shortVersion(banner) : null;
	}
}
