/**
 * What an address to a suggestion finds once that suggestion no longer waits
 * (ac-leaf-6709493f, ac-evo-link-arrival-only).
 *
 * An AI hands out a link to the suggestion it just made; by the time the
 * person opens it, the suggestion may have been decided, rewritten in place
 * under a new id, or taken back. The page then opens on what took its place
 * and says what became of it there, instead of a notice that names nothing.
 */
import { leafOf } from './acts';
import type { EvolutionRequest } from './draft';

/** What became of one suggestion that no longer waits, as the request remembers it. */
export type ProposalFate =
	| { readonly kind: 'replaced'; readonly by: string }
	| {
			readonly kind: 'decided';
			readonly decision: 'accepted' | 'refused' | 'commented';
			readonly targetField: string;
			readonly leafId: string | null;
			/** Who accepted it; the request keeps no author for a refusal. */
			readonly by: string | null;
	  }
	| { readonly kind: 'withdrawn' };

/** Where an address to a suggestion lands. */
export type ProposalArrival =
	| { readonly kind: 'waiting'; readonly id: string }
	| Extract<ProposalFate, { kind: 'decided' }>
	| { readonly kind: 'withdrawn' }
	| { readonly kind: 'unknown' };

/**
 * Every suggestion of the request that no longer waits, keyed by its id: the
 * decided ones with their field, the rewritten ones with the id that replaced
 * them, the ones taken back. The page reads it to resolve an old link.
 */
export function proposalFates(request: Pick<EvolutionRequest, 'proposals' | 'history'>): Record<string, ProposalFate> {
	const fates: Record<string, ProposalFate> = {};
	for (const entry of request.history) {
		if (entry.type === 'withdrawn_proposal' && entry.proposalId) fates[entry.proposalId] = { kind: 'withdrawn' };
	}
	for (const p of request.proposals) {
		for (const old of p.replaces ?? []) fates[old] = { kind: 'replaced', by: p.id };
		if (p.decision === 'accepted' || p.decision === 'refused' || p.decision === 'commented') {
			fates[p.id] = {
				kind: 'decided',
				decision: p.decision,
				targetField: p.targetField,
				leafId: leafOf(p),
				by: p.decision === 'accepted' ? p.acceptedBy : null
			};
		}
	}
	return fates;
}

/**
 * Where an address to suggestion `id` lands: the suggestion itself while it
 * waits, the one that rewrote it (followed down a chain of rewrites), the
 * field a decision settled, or nothing left to open.
 */
export function proposalArrival(
	id: string,
	waits: (id: string) => boolean,
	fates: Readonly<Record<string, ProposalFate>>
): ProposalArrival {
	const seen = new Set<string>();
	let current = id;
	while (!seen.has(current)) {
		seen.add(current);
		if (waits(current)) return { kind: 'waiting', id: current };
		const fate = fates[current];
		if (!fate) return { kind: 'unknown' };
		if (fate.kind !== 'replaced') return fate;
		current = fate.by;
	}
	return { kind: 'unknown' };
}
