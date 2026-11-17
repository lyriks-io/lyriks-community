import type { EvolutionRequest } from './draft';

/**
 * Closing an evolution moves the Specification 360° one version: the platform
 * captures a baseline of the specification as the change left it, and the
 * request keeps which one, so its closing block reads the version it moved
 * the specification from and to.
 */

/** The requests that closed between two reads of the dossier and hold no closing baseline yet. */
export function requestsClosedBetween(before: readonly Pick<EvolutionRequest, 'id' | 'status'>[], after: readonly Pick<EvolutionRequest, 'id' | 'status' | 'closingBaselineId'>[]): string[] {
	const wasClosed = new Set(before.filter((r) => r.status === 'closed').map((r) => r.id));
	return after.filter((r) => r.status === 'closed' && !wasClosed.has(r.id) && !r.closingBaselineId).map((r) => r.id);
}

/** The requests with the baseline their close captured; one already holding its own keeps it. */
export function withClosingBaselines<R extends Pick<EvolutionRequest, 'id' | 'closingBaselineId'>>(requests: readonly R[], captured: Readonly<Record<string, string>>): R[] {
	return requests.map((r) => (captured[r.id] && !r.closingBaselineId ? { ...r, closingBaselineId: captured[r.id] } : r));
}
