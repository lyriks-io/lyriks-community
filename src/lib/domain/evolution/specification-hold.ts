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

/** How many items the Specification asks a person to validate, and how many a person stands behind. */
export interface SpecificationHold {
	readonly total: number;
	readonly validated: number;
}

/**
 * A person stands behind the item as it reads now: an AI client's own
 * validation does not count, and a refused answer or an action marked not
 * wanted holds the Specification like one nobody read (ac-evo-form-step-lock).
 */
const heldByPerson = (item: SpecificationItem): boolean => item.validation !== 'refused' && !!item.humanValidated;

export function specificationHold(items: readonly SpecificationItem[]): SpecificationHold {
	return { total: items.length, validated: items.filter(heldByPerson).length };
}

export const specificationLeft = (hold: SpecificationHold): number => hold.total - hold.validated;

/**
 * The freeze waits for the Specification a person stood behind, on the page and
 * through the MCP alike; a person may still cross it with a named waiver, as at
 * every gate (ac-evo-form-step-lock). A Specification with nothing to validate
 * holds nothing back.
 */
export function specificationGate(hold: SpecificationHold | undefined): Guarded {
	const left = hold ? specificationLeft(hold) : 0;
	return guard(
		left > 0,
		`A person validates the Specification first: ${left} of ${hold?.total ?? 0} left.`,
		"Each feature's answers, each action, each path of the journey and each change to the data an AI wrote are read and validated by a person before the version is frozen: validate them on the Specification, or waive the gate with a stated reason."
	);
}
