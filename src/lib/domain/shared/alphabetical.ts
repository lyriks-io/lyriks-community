// A fixed locale so the server render and the browser agree on the order.
const nameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Two names in the app's alphabetical order: case and accents ignored, numbers read as numbers. */
export const compareNames = (a: string, b: string): number => nameCollator.compare(a.trim(), b.trim());

/**
 * A list of names in the order the app reads it (criteria 7b327ca1, 4b3d2b4d):
 * A to Z by the name shown, case and accents ignored, numbers read as numbers
 * ("Feature 2" before "Feature 10"). Returns a sorted copy: what is stored
 * keeps its own order. Pure.
 */
export function sortByName<T extends { name: string }>(items: readonly T[], shownName?: (item: T) => string): T[];
export function sortByName<T>(items: readonly T[], shownName: (item: T) => string): T[];
export function sortByName<T>(items: readonly T[], shownName: (item: T) => string = (item) => (item as { name: string }).name): T[] {
	return [...items].sort((a, b) => compareNames(shownName(a), shownName(b)));
}
