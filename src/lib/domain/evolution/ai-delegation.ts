import type { Actor } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';
import { personKey } from './named-validators';

/**
 * A person delegating validation to their own AI (ac-evo-llm-delegation): on
 * one evolution, or, for a project admin, on every evolution of the project.
 * Under it the person's AI validates in their name and accepts its own
 * suggestions; it never crosses a gate (ac-evo-llm-delegation-powers).
 */
export interface AiDelegation {
	readonly personId: string;
	readonly at: string;
}

export type DelegationScope = 'request' | 'project';

const holds = (list: readonly AiDelegation[] | undefined, personId: string) => (list ?? []).some((d) => personKey(d.personId) === personKey(personId));

/** Whether the person's AI validates on this request: delegated on it, or on every evolution of the project. */
export function delegatedTo(
	personId: string,
	request: { readonly aiDelegations?: readonly AiDelegation[] },
	project: { readonly aiDelegations?: readonly AiDelegation[] }
): boolean {
	return holds(request.aiDelegations, personId) || holds(project.aiDelegations, personId);
}

/** The delegations with the person's given or taken back. */
export function withDelegation(list: readonly AiDelegation[] | undefined, personId: string, on: boolean, at: string): AiDelegation[] {
	const others = (list ?? []).filter((d) => personKey(d.personId) !== personKey(personId));
	return on ? [...others, { personId, at }] : others;
}

/**
 * The delegation is the person's decision, given on the page: an AI never
 * delegates to itself, even relaying the person; only a project admin
 * delegates on every evolution.
 */
export function canDelegateToAi(actor: Actor, scope: DelegationScope): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client' || actor.channel === 'ai_client',
			'An AI never delegates to itself: the person delegates on the page.',
			'Handing validation to an AI is a decision only the person takes, where they read it.'
		),
		guard(actor.role === 'viewer', 'A viewer reads and comments, but does not validate, and so delegates nothing.', 'Only who validates can hand validation to their AI.'),
		guard(
			scope === 'project' && actor.role !== 'admin' && actor.role !== 'owner',
			'Only a project admin delegates on every evolution.',
			'A member delegates one evolution at a time, from its settings.'
		)
	);
}
