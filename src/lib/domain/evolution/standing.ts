import type { EvolutionRequest } from './draft';

/**
 * Where a request stands on Changes (ac-evo-board-1): in progress while it is
 * open, whatever its stage (an approved change waiting to be declared live
 * included), completed once live, canceled otherwise. The board's filters and
 * the count beside Changes in the navigation (criterion b2f17eef) read it, so
 * both count the same requests. Pure.
 */
export type EvolutionStanding = 'open' | 'deployed' | 'canceled';

export function evolutionStanding(request: Pick<EvolutionRequest, 'status' | 'stage'>): EvolutionStanding {
	if (request.status === 'open') return 'open';
	// A cancelled request reads canceled at whatever stage it stopped (ac-evo-req-cancel).
	if (request.status === 'cancelled') return 'canceled';
	return request.stage === 'delivered' ? 'deployed' : 'canceled';
}
