import { text } from './labels';
import type { FeatureActionView } from './features';

/**
 * What a feature page adds around its behaviour: who uses the feature (every
 * user an action of it is granted to). Pure.
 */

/** "Sales rep, Accountant and Administrator", '' when no action is granted to anyone. */
export function usedByOf(actions: readonly FeatureActionView[]): string {
	const names: string[] = [];
	for (const a of actions) for (const w of a.who) if (!names.includes(w.name)) names.push(w.name);
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
