import type { EvolutionRequest } from './draft';
import { guard, type Guarded } from './guard';

/**
 * An item the Specification asks a person to validate, as its trail reads now:
 * a written answer of a touched feature, an action it offers (3.2), a path of
 * its journey (3.3) or a change to the data (3.4).
 */
export interface SpecificationItem {
	readonly validation?: string;
	readonly humanValidated?: boolean;
}

/** Why the actions of the Specification cannot be read now (criterion c623df9c). */
export const ACTIONS_UNREAD = 'The engine did not answer, so the actions of the Specification cannot be read now.';

/**
 * The actions of the Specification as the engine read them from the request's
 * drafts, or why they could not be read. Never a fallback that reads as if the
 * drafts were not there: a reader has to say what it does with `unread`.
 */
export type SpecificationActions =
	| { readonly status: 'read'; readonly items: readonly SpecificationItem[] }
	| { readonly status: 'unread'; readonly reason: string };

/** No action is counted: a request away from the Impact analysis, where the freeze does not read them. */
export const NO_ACTIONS_COUNTED: SpecificationActions = { status: 'read', items: [] };

/** How many items the Specification asks to be validated, and how many stand validated. */
export interface SpecificationHold {
	readonly total: number;
	readonly validated: number;
	/** Why its actions could not be read, when they could not: then nothing it counts is the whole Specification. */
	readonly unread?: string;
}

/**
 * Someone stands behind the item as it reads now: a person, or their AI
 * validating in their name (an AI never validates on its own account in a team:
 * the act refuses it upstream). A refused answer or an action marked not wanted
 * holds the Specification like one nobody read (ac-evo-form-step-lock).
 */
const held = (item: SpecificationItem): boolean => item.validation === 'validated';

export function specificationHold(items: readonly SpecificationItem[], unread?: string): SpecificationHold {
	return { total: items.length, validated: items.filter(held).length, ...(unread ? { unread } : {}) };
}

export const specificationLeft = (hold: SpecificationHold): number => hold.total - hold.validated;

/**
 * The stages the Specification is written and read in before the freeze: its
 * actions, read with the engine's graph, are counted in both, so the next step
 * never offers the freeze while an action waits (criterion c0a6eef3).
 */
export const countsSpecificationActions = (stage: string): boolean => stage === 'specification' || stage === 'coherence';

/** What an item of the Specification is, as get_evolution part "specification" names it (criterion 2df61e72). */
export type SpecificationItemKind = 'answer' | 'description' | 'action' | 'path' | 'data_change' | 'section_change' | 'rule_change' | 'finding';

/** Where an item stands: validated, waiting for a first validation, refused, or validated before a later write. */
export type SpecificationStanding = 'validated' | 'waiting' | 'refused' | 'outdated';

/** The standing of an item, read the way the gate counts it: only `validated` holds. */
export function specificationStanding(item: SpecificationItem): SpecificationStanding {
	if (held(item)) return 'validated';
	if (item.validation === 'refused') return 'refused';
	// A validation of an earlier version, or a value written again outside the dossier since.
	if (item.validation === 'outdated' || item.validation === 'changed_outside') return 'outdated';
	return 'waiting';
}

/**
 * The freeze waits for the Specification only, validated by a person or by their
 * AI in their name, on the page and through the MCP alike; the Need, the Solution
 * and the specs hold nothing. A person may still cross it with a named waiver, as
 * at every gate (ac-evo-form-step-lock). A Specification with nothing to validate
 * holds nothing back.
 */
export function specificationGate(hold: SpecificationHold | undefined): Guarded {
	if (hold?.unread) return actionsUnreadGate(hold);
	const left = hold ? specificationLeft(hold) : 0;
	return guard(
		left > 0,
		`The Specification is validated first: ${left} of ${hold?.total ?? 0} left.`,
		"Each feature's answers, each action, each path of the journey and each change to the data are validated before the version is frozen, by a person or by their AI in their name: validate them on the Specification (get_evolution part \"specification\" lists each with the key validate_field takes), or waive the gate with a stated reason."
	);
}

/**
 * The freeze counts the actions of the Specification: counted without them it
 * would let through what nobody validated, so it waits for the engine, and no
 * waiver stands behind what nobody could read (rule 9d290950).
 */
export function actionsUnreadGate(hold: SpecificationHold | undefined): Guarded {
	return guard(!!hold?.unread, hold?.unread ?? '', 'Nothing was frozen. Try again in a moment: the engine may be busy with other readings.');
}
