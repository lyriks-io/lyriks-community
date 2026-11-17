/**
 * The words a reader knows the elements of a feature's behaviour by, keyed by
 * their id (ac-evo-draft-changes-named). An operation of a draft that carries
 * only ids (a rule reworded, an effect taken away) is read with the names the
 * feature it amends already gives them, and the action and the screen it sits in.
 */
export interface ElementName {
	readonly name: string;
	/** The action and the screen the element belongs to, as people read them. */
	readonly in?: string;
}

export type ElementNames = Readonly<Record<string, ElementName>>;

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const rows = (owner: Row, key: string): Row[] => (Array.isArray(owner[key]) ? (owner[key] as Row[]).filter((r) => r && typeof r === 'object') : []);

/** A rule reads by its own sentence, else by the sentence it refuses with. */
const ruleWords = (rule: Row): string => str(rule.description) || str((rule.effect as Row | undefined)?.reason) || str(rule.name);

/** Every named element of a feature snapshot, tolerant of the loose shape the engine returns. */
export function behaviourElementNames(feature: unknown): ElementNames {
	const f = (feature && typeof feature === 'object' ? feature : {}) as Row;
	const out: Record<string, ElementName> = {};
	const put = (id: unknown, name: string, where?: string) => {
		const key = str(id);
		if (key === '' || name === '' || key in out) return;
		out[key] = where ? { name, in: where } : { name };
	};
	for (const surface of rows(f, 'surfaces')) {
		const screen = str(surface.name);
		put(surface.id, screen);
		for (const rule of rows(surface, 'rules')) put(rule.id, ruleWords(rule), screen);
		for (const inv of rows(surface, 'invariants')) put(inv.id, str(inv.name) || str(inv.description), screen);
		for (const action of rows(surface, 'actions')) {
			const name = str(action.name);
			put(action.id, name, screen);
			const where = [name, screen].filter((w) => w !== '').join(' · ');
			for (const rule of rows(action, 'rules')) put(rule.id, ruleWords(rule), where);
			for (const scenario of rows(action, 'scenarios')) put(scenario.id, str(scenario.name) || str(scenario.description), where);
			for (const effect of rows(action, 'effects')) put(effect.id, str(effect.description) || str(effect.path), where);
			for (const parameter of rows(action, 'parameters')) put(parameter.id, str(parameter.name), where);
			for (const inv of rows(action, 'invariants')) put(inv.id, str(inv.name) || str(inv.description), where);
		}
	}
	for (const inv of rows(f, 'featureInvariants')) put(inv.id, str(inv.name) || str(inv.description));
	for (const transition of rows(f, 'transitions')) put(transition.id, str(transition.name) || str(transition.description));
	return out;
}
