import type { GlanceOutcome } from '$application/spec360/glance';

/**
 * The results the target card reads (criterion 416e4885): the names it shows,
 * a saved edit's at once, each with the values the specification gives that
 * result (its value today and the one aimed at), or none for a result named
 * without a value. Pure.
 */
export function resultsOf(names: readonly string[], outcomes: readonly GlanceOutcome[]): GlanceOutcome[] {
	const byLabel = new Map(outcomes.map((o) => [o.label.trim(), o]));
	return names
		.map((n) => n.trim())
		.filter(Boolean)
		.map((label) => byLabel.get(label) ?? { label, from: '', to: '' });
}
