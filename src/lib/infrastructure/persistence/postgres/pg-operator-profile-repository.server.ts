import type { OperatorProfileRepositoryPort } from '$application/ports';
import {
	defaultOperatorProfile,
	normalizeOperatorProfile,
	type OperatorProfile
} from '$domain/settings';
import { pgQuery } from './pg-database.server';

/** Single-row operator profile (app_settings id='profile'); domain-normalized. */
const PROFILE_ROW = 'profile';

export class PgOperatorProfileRepository implements OperatorProfileRepositoryPort {
	async load(): Promise<OperatorProfile> {
		const { rows } = await pgQuery<{ document: string }>(
			'SELECT document FROM app_settings WHERE id = $1',
			[PROFILE_ROW]
		);
		if (rows.length === 0) return defaultOperatorProfile();
		try {
			return normalizeOperatorProfile(JSON.parse(rows[0].document));
		} catch {
			return defaultOperatorProfile();
		}
	}

	async save(profile: OperatorProfile): Promise<void> {
		await pgQuery(
			`INSERT INTO app_settings (id, document) VALUES ($1, $2)
			 ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document`,
			[PROFILE_ROW, JSON.stringify(normalizeOperatorProfile(profile))]
		);
	}
}
