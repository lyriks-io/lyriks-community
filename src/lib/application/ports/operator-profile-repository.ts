import type { OperatorProfile } from '$domain/settings';

/**
 * Outbound port for the single operator's profile (Community / solo editions).
 * One concern: load/save the operator display name. Backed by Postgres today
 * (the shared app_settings row), swappable without touching callers.
 */
export interface OperatorProfileRepositoryPort {
	load(): Promise<OperatorProfile>;
	save(profile: OperatorProfile): Promise<void>;
}
