/**
 * What a request's drafts bring or change on a touched feature (criterion
 * 28d5a69c): the elements of the feature its draft would make that the feature
 * as it stands does not hold, or holds otherwise. A line of the report is the
 * request's only on those; anything else the feature holds, at the freeze or
 * written directly since, is the feature's own and reads inherited.
 *
 * Elements are keyed the way the engine keys the entities of a status row
 * (`action:<id>`, `rule:<id>`, `state:<id>`, `event:<name>`, `criterion:<id>`...),
 * each with what it holds without its children, which carry keys of their own.
 */
type Snapshot = Readonly<Record<string, unknown>> | null | undefined;

/** The id of a text criterion (a UUID), as a draft carries it; a behaviour criterion's id is 8 hex characters. */
const TEXT_CRITERION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rows = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object') : [];
const idOf = (row: Record<string, unknown>): string => (typeof row.id === 'string' ? row.id : '');
/** A value written the same whatever order its keys were read in: two readings of one element compare equal. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.keys(value)
			.sort()
			.filter((k) => (value as Record<string, unknown>)[k] !== undefined)
			.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
			.join(',')}}`;
	return JSON.stringify(value) ?? 'null';
}
const without = (row: Record<string, unknown>, keys: readonly string[]): string =>
	canonical(Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k))));

/** Every element of a feature snapshot by its key, with what it holds. */
export function elementContents(feature: Snapshot): Map<string, string> {
	const out = new Map<string, string>();
	const put = (key: string, content: string) => {
		if (!key.endsWith(':')) out.set(key, content);
	};
	for (const surface of rows(feature?.surfaces)) {
		put(`surface:${idOf(surface)}`, without(surface, ['actions', 'stateDefinitions', 'rules', 'invariants']));
		for (const state of rows(surface.stateDefinitions)) put(`state:${idOf(state)}`, canonical(state));
		for (const rule of rows(surface.rules)) put(`surface_rule:${idOf(rule)}`, canonical(rule));
		for (const inv of rows(surface.invariants)) put(`surface_invariant:${idOf(inv)}`, canonical(inv));
		for (const action of rows(surface.actions)) {
			put(`action:${idOf(action)}`, without(action, ['rules', 'invariants', 'transitions']));
			for (const rule of rows(action.rules)) put(`rule:${idOf(rule)}`, canonical(rule));
			for (const inv of rows(action.invariants)) put(`invariant:${idOf(inv)}`, canonical(inv));
			for (const t of rows(action.transitions)) put(`transition:${idOf(t)}`, canonical(t));
			for (const event of Array.isArray(action.emittedEvents) ? action.emittedEvents : [])
				if (typeof event === 'string' && event !== '') put(`event:${event}`, event);
		}
	}
	for (const criterion of rows(feature?.acceptanceCriteria)) put(`criterion:${idOf(criterion)}`, canonical(criterion));
	return out;
}

/**
 * The keys a draft brings or changes: what the feature it would make holds that
 * the feature as it stands does not, or holds otherwise, plus the text criteria
 * it adds or rewords. An addition brings everything it holds.
 */
export function broughtKeys(drafted: Snapshot, base: Snapshot, criterionIds: readonly string[] = []): Set<string> {
	const before = elementContents(base);
	const brought = new Set<string>();
	for (const [key, content] of elementContents(drafted)) if (before.get(key) !== content) brought.add(key);
	for (const id of criterionIds) {
		if (!id) continue;
		brought.add(`criterion:${id}`);
		// A text criterion a draft adds or rewords is carried under its bare id,
		// while its report line reads it as `ac-leaf-<id>` (held-implementation):
		// without this key the line read inherited and never held the gate.
		if (!id.startsWith('ac-leaf-') && TEXT_CRITERION_ID.test(id)) brought.add(`criterion:ac-leaf-${id}`);
	}
	return brought;
}
