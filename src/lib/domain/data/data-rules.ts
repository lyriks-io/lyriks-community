/**
 * The data model's rules, read as EARS requirements and, where the solver can
 * check them, given to it as project invariants.
 *
 * A rule is read from the model by a fixed template, never written by hand or
 * by an AI, so its sentence can never say more than what is checked. A field is
 * checked against the behaviour only through an explicit link to the state that
 * carries its value (never guessed from names), and a required field only for a
 * record that exists, through what its table names as existence: a yes-or-no
 * state, or a condition on its status.
 *
 * Each rule says how it is known:
 *  - `solver`: a project invariant the solver proves over every feature;
 *  - `compare`: read by comparing the model with the behaviour (a starting value);
 *  - `out-of-reach`: the solver follows one record at a time and does not read
 *    over the items of a list, so uniqueness and a list's minimum are said, not proven;
 *  - `none`: a permission (a record may have no suspect), nothing to check.
 *
 * Pure: the draft and the behaviour's states in, sentences and invariants out.
 */

import { NBSP, quoteName, type SpecLanguage } from '$domain/language';
import { rootFieldsOfEntity, type DataEntity, type EntityField, type ProjectDataDraft } from './draft';
import type { DataRuleKind } from './draft';

// ── the behaviour's states, as the data model sees them ───────────────────────

export type BehaviourStateType = 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array';

/** A state of the behaviour model a field can be tied to (a project state variable). */
export interface BehaviourState {
	readonly path: string;
	readonly type: BehaviourStateType;
	readonly enumValues?: readonly string[];
	readonly defaultValue: unknown;
	/** The feature that declares it first, for the reader. */
	readonly featureName?: string;
}

/** A field tied to the state that carries its value (held by the engine). */
export interface FieldLink {
	readonly fieldId: string;
	readonly statePath: string;
}

// ── words ─────────────────────────────────────────────────────────────────────

/** A dotted or camelCase name as lowercase words: `ownerId` reads "owner id". */
const words = (name: string): string =>
	name
		.split('.')
		.flatMap((segment) =>
			segment
				.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
				.replace(/[_-]+/g, ' ')
				.toLowerCase()
				.split(/\s+/)
		)
		.filter(Boolean)
		.join(' ');

/**
 * A field name read in a sentence, without what only the implementation needs:
 * the `Id` a foreign key carries (`owner_id` reads "owner") and, on a relation,
 * the target it repeats (`suspectPersonId` pointing at Person reads "suspect").
 */
export function fieldWords(name: string, target = ''): string {
	const bare = words(name.replace(/(?<=[a-z])(Id|_id|ID|Ids|_ids|IDs)$/, '')) || words(name);
	const repeated = words(target);
	if (repeated && bare !== repeated && bare.endsWith(` ${repeated}`)) return bare.slice(0, -repeated.length - 1);
	return bare;
}

/** "a" or "an", by how the word sounds: its first letter, a "u" said "you" and "eu"/"one" aside. */
const article = (next: string): string =>
	/^[aeiou]/i.test(next) && !/^(u[bcfhjklmnrst][aeiou]|eu|one)/i.test(next) ? 'an' : 'a';
const withArticle = (text: string): string => `${article(text)} ${text}`;
/** A field's words with their article, none for a plural ("coordinates", "opening hours" but "a status"). */
const fieldWithArticle = (text: string): string =>
	/[^su]s$/i.test(text) && !/(ss|us|is)$/i.test(text) ? text : withArticle(text);

/** The plural of the last word of a name: Order → Orders, Category → Categories, Box → Boxes. */
function pluralOf(name: string): string {
	const m = /^(.*?)(\S+)$/.exec(name.trim());
	if (!m) return name;
	const head = m[1] ?? '';
	const last = m[2] ?? '';
	if (/[^aeiou]y$/i.test(last)) return `${head}${last.slice(0, -1)}ies`;
	if (/(s|x|z|ch|sh)$/i.test(last)) return `${head}${last}es`;
	return `${head}${last}s`;
}

const list = (items: readonly string[], or: string): string =>
	items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${or} ${items.at(-1)}`;

// ── the rules of one field ──────────────────────────────────────────────────

export type DataRuleCheck = 'solver' | 'compare' | 'out-of-reach' | 'none';

/** Every kind of rule a field states; the first two are the ones the solver proves. */
export type DataRuleShape =
	| DataRuleKind
	| 'starts-as'
	| 'may-have'
	| 'any-number'
	| 'at-least-one'
	| 'unique';

export interface DataRule {
	/** Stable within the project: `<shape>:<field id>`. */
	readonly key: string;
	readonly shape: DataRuleShape;
	readonly entityId: string;
	readonly fieldId: string;
	/** The EARS requirement, in the spec's language. */
	readonly ears: string;
	readonly check: DataRuleCheck;
	/** For `out-of-reach`: why the solver does not answer it. */
	readonly outOfReach?: string;
}

const choicesOf = (field: EntityField): string[] =>
	(field.enumValues ?? []).map((value) => value.trim()).filter(Boolean);

/**
 * Every rule the model states, table by table in model order, each with its
 * EARS sentence and how it is known.
 */
export function dataRules(draft: ProjectDataDraft, lang: SpecLanguage = 'en'): DataRule[] {
	const fr = lang === 'fr';
	const q = (name: string) => quoteName('fr', name);
	const out: DataRule[] = [];
	for (const entity of draft.entities) {
		const table = entity.name.trim();
		if (!table) continue;
		const a = withArticle(table);
		const add = (shape: DataRuleShape, field: EntityField, ears: string, check: DataRuleCheck, outOfReach?: string) =>
			out.push({
				key: `${shape}:${field.id}`,
				shape,
				entityId: entity.id,
				fieldId: field.id,
				ears,
				check,
				...(outOfReach ? { outOfReach } : {})
			});
		for (const field of rootFieldsOfEntity(draft, entity.id)) {
			if (!field.name.trim() || field.isId) continue;
			const target =
				field.type === 'relation'
					? draft.entities.find((e) => e.id === field.relationTargetEntityId)?.name.trim()
					: undefined;
			if (field.type === 'relation' && !target) continue;
			const fw = fieldWords(field.name, target);
			const role = fr ? q(fw) : fw;

			if (field.isList) {
				const many = target ?? fw;
				if (field.isRequired) {
					add(
						'at-least-one',
						field,
						fr
							? `Le système doit garantir qu'un enregistrement ${q(table)} a au moins un élément de ${q(many)}.`
							: `The system shall ensure that ${a} has at least one ${many}.`,
						'out-of-reach',
						fr ? 'une règle sur les éléments d’une liste' : 'a rule over the items of a list'
					);
				} else {
					add(
						'any-number',
						field,
						fr
							? `Le système doit permettre qu'un enregistrement ${q(table)} ait un nombre quelconque de ${q(many)}.`
							: `The system shall allow ${a} to have any number of ${pluralOf(many)}.`,
						'none'
					);
				}
				continue;
			}

			const choices = field.type === 'enum' ? choicesOf(field) : [];
			if (field.isRequired && field.type !== 'boolean') {
				add(
					'required',
					field,
					fr
						? `Tant qu'un enregistrement ${q(table)} existe, le système doit garantir que son ${role} est renseigné.`
						: `While ${a} exists, the system shall ensure that it has ${fieldWithArticle(fw)}.`,
					'solver'
				);
			} else if (field.type === 'relation') {
				add(
					'may-have',
					field,
					fr
						? `Le système doit permettre qu'un enregistrement ${q(table)} n'ait pas de ${role}.`
						: `The system shall allow ${a} to have no ${fw}.`,
					'none'
				);
			}
			if (choices.length > 0) {
				add(
					'choice',
					field,
					fr
						? `Le système doit limiter ${role} d'un enregistrement ${q(table)} à ${list(choices.map(q), 'ou')}.`
						: `The system shall restrict the ${fw} of ${a} to ${list(choices, 'or')}.`,
					'solver'
				);
			}
			const initial = field.defaultValue.trim();
			if (initial) {
				add(
					'starts-as',
					field,
					fr
						? `Lorsqu'un enregistrement ${q(table)} est créé, le système doit mettre son ${role} à ${q(initial)}.`
						: `When ${a} is created, the system shall set its ${fw} to ${initial}.`,
					'compare'
				);
			}
			if (field.isUnique) {
				add(
					'unique',
					field,
					fr
						? `Le système doit empêcher deux enregistrements ${q(table)} d'avoir la même valeur de ${role}.`
						: `The system shall prevent two ${pluralOf(table)} from sharing the same ${fw}.`,
					'out-of-reach',
					fr
						? 'elle compare deux enregistrements, et le solveur suit un enregistrement à la fois'
						: 'it compares two records, and the solver follows one record at a time'
				);
			}
		}
	}
	return out;
}

// ── when a record exists ────────────────────────────────────────────────────

/**
 * When one record of a table exists, as a table names it: a yes-or-no state
 * that is true while it exists (`integrity.receiptExists`), or a condition on
 * its status (`service.status != none`, `exchange.status in pending|signed`,
 * `offer.status = open`, `tap.status not in none|cut`). Stored as that text.
 */
export interface ExistenceCondition {
	/** Empty for `always`: no state is read. */
	readonly path: string;
	/** `always`: the behaviour models one record always in play (the world, a catalog entry). */
	readonly operator: 'is_true' | 'in' | 'not_in' | 'always';
	readonly values: readonly string[];
}

const STATE_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/;

/** The condition an existence text names, or null when it is not one. */
export function parseExistence(text: string): ExistenceCondition | null {
	const trimmed = text.trim();
	if (trimmed.toLowerCase() === 'always') return { path: '', operator: 'always', values: [] };
	if (STATE_PATH.test(trimmed)) return { path: trimmed, operator: 'is_true', values: [] };
	const match = /^(\S+)\s*(!=|=|\bnot\s+in\b|\bin\b)\s*(.+)$/i.exec(trimmed);
	if (!match || !STATE_PATH.test(match[1]!)) return null;
	// A quoted value is kept as written, the empty text included (`speech.text != ""`).
	const values = match[3]!
		.split(/[|,]/)
		.map((v) => v.trim())
		.flatMap((v) => {
			const quoted = /^["'«]\s*(.*?)\s*["'»]$/.exec(v);
			if (quoted) return [quoted[1]!];
			return v ? [v] : [];
		});
	if (values.length === 0) return null;
	const op = match[2]!.toLowerCase().replace(/\s+/g, ' ');
	const operator = op === '=' || op === 'in' ? 'in' : 'not_in';
	if ((op === '=' || op === '!=') && values.length > 1) return null;
	return { path: match[1]!, operator, values: [...new Set(values)] };
}

/** The existence text a condition is stored as. */
export function existenceText(condition: ExistenceCondition): string {
	if (condition.operator === 'always') return 'always';
	if (condition.operator === 'is_true') return condition.path;
	// Quoted when a value is empty or would be read as a separator.
	const shown = condition.values.map((v) => (v === '' || /[|,\s"]/.test(v) ? `"${v}"` : v));
	if (shown.length === 1) return `${condition.path} ${condition.operator === 'in' ? '=' : '!='} ${shown[0]}`;
	return `${condition.path} ${condition.operator === 'in' ? 'in' : 'not in'} ${shown.join('|')}`;
}

/** Why a state cannot say when a record exists under this condition, or null when it can. */
export function existenceProblem(condition: ExistenceCondition, state: BehaviourState): string | null {
	if (condition.operator === 'always') return null;
	if (condition.operator === 'is_true') {
		return state.type === 'boolean'
			? null
			: `"${state.path}" is not a yes-or-no state: say when a record exists with a condition on it (for example ${state.path} != none).`;
	}
	if (state.type === 'boolean') return `"${state.path}" is a yes-or-no state: name it alone, a record exists while it is true.`;
	if (state.type !== 'enum' && state.type !== 'string') {
		return 'Only a yes-or-no state, or a condition on a choice or text state, can say whether a record exists.';
	}
	if (state.type === 'enum') {
		const allowed = new Set(state.enumValues ?? []);
		const unknown = condition.values.filter((v) => !allowed.has(v));
		if (unknown.length > 0) {
			return `"${state.path}" does not allow ${unknown.map((v) => `"${v}"`).join(', ')}: it allows ${[...allowed].map((v) => `"${v}"`).join(', ')}.`;
		}
	}
	return null;
}

/** The engine condition true exactly while a record exists. */
export function existenceHolds(condition: ExistenceCondition): Record<string, unknown> {
	if (condition.operator === 'is_true') return { left: condition.path, operator: 'is_true' };
	const each = condition.values.map((value) => ({
		left: condition.path,
		operator: condition.operator === 'in' ? 'equals' : 'not_equals',
		right: value
	}));
	if (each.length === 1) return each[0]!;
	return { kind: condition.operator === 'in' ? 'any' : 'all', conditions: each };
}

/** How a table's existence reads on the page: "integrity.receiptExists is true", "service.status is not "none"". */
export function existenceReading(condition: ExistenceCondition): string {
	if (condition.operator === 'always') return 'always';
	const quoted = condition.values.map((v) => `"${v}"`);
	if (condition.operator === 'is_true') return `${condition.path} is true`;
	if (quoted.length === 1) return `${condition.path} is ${condition.operator === 'in' ? '' : 'not '}${quoted[0]}`;
	return `${condition.path} is ${condition.operator === 'in' ? 'one of' : 'none of'} ${quoted.join(', ')}`;
}

// ── what the solver is given ────────────────────────────────────────────────

/** A project invariant generated from one rule of the model. */
export interface GeneratedInvariant {
	/** `<shape>:<field id>`, the key of the rule it proves. */
	readonly key: string;
	readonly entityId: string;
	readonly fieldId: string;
	readonly kind: DataRuleKind;
	readonly invariant: {
		readonly name: string;
		readonly condition: Record<string, unknown>;
		readonly message: string;
		readonly description: string;
	};
}

/** Why a rule the solver could prove is not given to it yet: what a person has to do first. */
export type MissingForProof = 'link' | 'existence' | 'nothing';

/** What a solver rule still needs before it can be generated. */
export function missingForProof(
	rule: DataRule,
	draft: ProjectDataDraft,
	links: ReadonlyMap<string, string>
): MissingForProof {
	if (rule.check !== 'solver') return 'nothing';
	if (!links.has(rule.fieldId)) return 'link';
	if (rule.shape === 'required' && !draft.rules?.existence[rule.entityId]) return 'existence';
	return 'nothing';
}

const presence = (path: string, type: BehaviourStateType | undefined): Record<string, unknown> =>
	type === 'string'
		? {
				kind: 'all',
				conditions: [
					{ left: path, operator: 'exists' },
					{ left: path, operator: 'not_equals', right: '' }
				]
			}
		: { left: path, operator: 'exists' };

/**
 * The project invariants the model's provable rules become, for every rule
 * whose field is tied to a state (and, for a required field, whose table names
 * its existence state). The sentence of each is its name, so the solver's
 * answers read in the same words as the page.
 */
export function generatedInvariants(
	draft: ProjectDataDraft,
	links: ReadonlyMap<string, string>,
	states: ReadonlyMap<string, BehaviourState>,
	lang: SpecLanguage = 'en'
): GeneratedInvariant[] {
	const fr = lang === 'fr';
	const out: GeneratedInvariant[] = [];
	for (const rule of dataRules(draft, lang)) {
		if (rule.check !== 'solver' || missingForProof(rule, draft, links) !== 'nothing') continue;
		const path = links.get(rule.fieldId)!;
		const entity = draft.entities.find((e) => e.id === rule.entityId)!;
		const field = draft.fields.find((f) => f.id === rule.fieldId)!;
		const origin = fr
			? `Règle générée par Lyriks depuis le data model${NBSP}: le champ ${quoteName('fr', field.name)} de la table ${quoteName('fr', entity.name)}. Elle est réécrite à chaque sauvegarde du data model.`
			: `Generated by Lyriks from the data model: field "${field.name}" of table "${entity.name}". Rewritten on every save of the data model.`;
		const table = entity.name.trim();
		const fw = fieldWords(field.name, field.type === 'relation' ? draft.entities.find((e) => e.id === field.relationTargetEntityId)?.name : undefined);
		if (rule.shape === 'required') {
			const existence = parseExistence(draft.rules!.existence[rule.entityId]!);
			if (!existence) continue;
			out.push({
				key: rule.key,
				entityId: rule.entityId,
				fieldId: rule.fieldId,
				kind: 'required',
				invariant: {
					name: rule.ears,
					// A record always in play: it has the value, full stop.
					condition:
						existence.operator === 'always'
							? presence(path, states.get(path)?.type)
							: {
									kind: 'any',
									conditions: [
										{ kind: 'not', condition: existenceHolds(existence) },
										presence(path, states.get(path)?.type)
									]
								},
					// What a broken run shows: the violation itself, not the rule again.
					message: fr
						? `Un enregistrement ${quoteName('fr', table)} existe sans ${quoteName('fr', fw)}.`
						: `${withArticle(table).replace(/^a/, 'A')} exists without ${withArticle(fw)}.`,
					description: origin
				}
			});
		} else if (rule.shape === 'choice') {
			const choices = choicesOf(field);
			out.push({
				key: rule.key,
				entityId: rule.entityId,
				fieldId: rule.fieldId,
				kind: 'choice',
				invariant: {
					name: rule.ears,
					condition: {
						kind: 'any',
						conditions: [
							...(field.isRequired ? [] : [{ left: path, operator: 'does_not_exist' }]),
							// Checked against the values as the state spells them (USER in the table, user in the behaviour).
							...choices.map((value) => ({ left: path, operator: 'equals', right: spelledAs(value, states.get(path)?.enumValues) }))
						]
					},
					message: fr
						? `Un enregistrement ${quoteName('fr', table)} a une valeur de ${quoteName('fr', fw)} hors de ${list(choices.map((v) => quoteName('fr', v)), 'et')}.`
						: `${withArticle(table).replace(/^a/, 'A')} has a ${fw} other than ${list(choices, 'or')}.`,
					description: origin
				}
			});
		}
	}
	return out;
}

// ── tying a field to a state ────────────────────────────────────────────────

/** A choice of the field as the state spells it, the same value whatever its case. */
const spelledAs = (value: string, theirs: readonly string[] | undefined): string =>
	theirs?.find((v) => v.toLowerCase() === value.toLowerCase()) ?? value;

/** Why a state cannot carry a field, or null when it can. */
export function incompatibility(
	field: EntityField,
	state: BehaviourState,
	lang: SpecLanguage = 'en'
): string | null {
	const fr = lang === 'fr';
	const kind = (expected: BehaviourStateType) =>
		state.type === expected
			? null
			: fr
				? `Cet état contient une valeur de type ${quoteName('fr', state.type)}, le champ attend ${quoteName('fr', expected)}.`
				: `That state holds ${withArticle(state.type)}, the field ${withArticle(expected)}.`;
	if (field.isList) return kind('array');
	// A yes-or-no state may stand for an optional field as whether it is filled (criterion c8ff60f9).
	if (state.type === 'boolean' && field.type !== 'boolean' && field.type !== 'enum') {
		if (!field.isRequired) return null;
		return fr
			? `Un champ obligatoire ne se lie pas à un état oui ou non qui dit seulement s'il est rempli.`
			: 'A required field never links to a yes-or-no state that only says whether it is filled.';
	}
	switch (field.type) {
		case 'int':
		case 'decimal':
			return kind('number');
		case 'boolean':
			return kind('boolean');
		// A date kept as a time on the behaviour's clock (criterion c8ff60f9).
		case 'datetime':
			return state.type === 'number' ? null : kind('string');
		case 'object':
		case 'json':
			return kind('object');
		case 'enum': {
			const wrong = kind('enum');
			if (wrong) return wrong;
			const mine = choicesOf(field);
			const theirs = state.enumValues ?? [];
			// The same values, whatever their case (criterion c8ff60f9).
			const lower = new Set(theirs.map((v) => v.toLowerCase()));
			const same = mine.length === theirs.length && mine.every((value) => lower.has(value.toLowerCase()));
			if (mine.length === 0 || same) return null;
			return fr
				? `Cet état autorise ${list(theirs.map((v) => quoteName('fr', v)), 'ou')}, le champ ${list(mine.map((v) => quoteName('fr', v)), 'ou')}.`
				: `That state allows ${list(theirs, 'or')}, the field ${list(mine, 'or')}.`;
		}
		default:
			return kind('string');
	}
}

const tokens = (text: string): Set<string> =>
	new Set(
		words(text)
			.split(' ')
			.filter((token) => token.length > 1 && token !== 'id')
	);

/**
 * The states that could carry a field, best first: of a kind that fits it,
 * whose last segment names every word of the field's name that tells it apart
 * (`unitMass` is not `unitPrice`), and whose path names the field's table:
 * `accident.status` says nothing about the status of a World, and on a real
 * model a same-named state of another concern (`exchange.quantity` for a lot's
 * quantity) is almost never the one. A field with no such state gets no
 * suggestion, only the search. Never applied on its own: a person confirms it.
 */
export function suggestedStates(
	field: EntityField,
	entity: DataEntity,
	states: readonly BehaviourState[],
	limit = 3
): BehaviourState[] {
	const own = tokens(field.name);
	const table = tokens(entity.name);
	const scored = states
		.filter((state) => incompatibility(field, state) === null)
		.map((state) => {
			const segments = state.path.split('.');
			const last = tokens(segments.at(-1) ?? '');
			const rest = tokens(segments.slice(0, -1).join('.'));
			const named = [...own].filter((t) => last.has(t)).length;
			const placed = [...table].filter((t) => rest.has(t)).length;
			const whole = [...own].every((t) => last.has(t) || rest.has(t));
			// words the state's name has that the field's does not: `service.kind` before `service.employerKind`
			const extra = last.size - named;
			return { state, named, placed, whole, extra };
		})
		.filter(({ named, placed, whole }) => named > 0 && whole && placed > 0)
		.sort(
			(a, b) =>
				b.named - a.named || b.placed - a.placed || a.extra - b.extra || a.state.path.localeCompare(b.state.path)
		);
	return scored.slice(0, limit).map(({ state }) => state);
}

// ── links Lyriks makes by itself, and the evidence an AI client reads ────────

/** A field to link to the state that carries it. */
export interface ProposedLink {
	readonly fieldId: string;
	readonly statePath: string;
}

/**
 * The links Lyriks makes without asking anyone: a field no state carries and
 * no person unlinked, with exactly one state of a fitting kind whose path names
 * the field's whole table and whose own name is the field's name, a state that
 * carries no other field. A field with two such states, or two fields that
 * would take the same state, are left to an AI client or a person.
 */
export function automaticLinks(
	draft: ProjectDataDraft,
	states: readonly BehaviourState[],
	links: ReadonlyMap<string, string>,
	declined: ReadonlySet<string> = new Set()
): ProposedLink[] {
	const carried = new Set(links.values());
	const found: ProposedLink[] = [];
	for (const entity of draft.entities) {
		const table = tokens(entity.name);
		if (table.size === 0) continue;
		for (const field of rootFieldsOfEntity(draft, entity.id)) {
			if (field.isId || links.has(field.id) || declined.has(field.id)) continue;
			const own = tokens(field.name);
			if (own.size === 0) continue;
			const fits = states.filter((state) => {
				if (carried.has(state.path) || incompatibility(field, state) !== null) return false;
				const segments = state.path.split('.');
				const last = tokens(segments.at(-1) ?? '');
				const rest = tokens(segments.slice(0, -1).join('.'));
				return sameSet(last, own) && [...table].every((t) => rest.has(t));
			});
			if (fits.length === 1) found.push({ fieldId: field.id, statePath: fits[0]!.path });
		}
	}
	const taken = new Map<string, number>();
	for (const link of found) taken.set(link.statePath, (taken.get(link.statePath) ?? 0) + 1);
	return found.filter((link) => taken.get(link.statePath) === 1);
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((t) => b.has(t));

/**
 * The states an AI client weighs to link a field, best first: of a fitting kind
 * and sharing a word with the field's name, those whose path also names the
 * table ahead. Wider than a suggestion to a person: the client decides from its
 * own evidence (the code it read, the state's description).
 */
export function linkCandidates(
	field: EntityField,
	entity: DataEntity,
	states: readonly BehaviourState[],
	carried: ReadonlySet<string> = new Set(),
	limit = 8
): BehaviourState[] {
	const own = tokens(field.name);
	const table = tokens(entity.name);
	return states
		.filter((state) => !carried.has(state.path) && incompatibility(field, state) === null)
		.map((state) => {
			const segments = state.path.split('.');
			const last = tokens(segments.at(-1) ?? '');
			const rest = tokens(segments.slice(0, -1).join('.'));
			const named = [...own].filter((t) => last.has(t)).length;
			const placed = [...table].filter((t) => rest.has(t)).length;
			return { state, named, placed, extra: last.size - named };
		})
		.filter(({ named }) => named > 0)
		.sort(
			(a, b) =>
				b.placed - a.placed || b.named - a.named || a.extra - b.extra || a.state.path.localeCompare(b.state.path)
		)
		.slice(0, limit)
		.map(({ state }) => state);
}

// ── rules of one kind read once per table ───────────────────────────────────

/** Several rules of one kind on one table, read as one requirement naming their fields. */
export interface DataRuleGroup {
	/** `<shape>:<entity id>`. */
	readonly key: string;
	readonly shape: DataRuleShape;
	readonly entityId: string;
	readonly ears: string;
	/** The rules it gathers, in model order: each keeps its own verdict and link. */
	readonly ruleKeys: readonly string[];
}

/** The shapes whose rules on one table differ only by the field they name. */
const GROUPABLE: readonly DataRuleShape[] = ['required', 'may-have'];

/**
 * The rules of one kind a table states for two fields or more, read as one
 * sentence ("While a World exists, the system shall ensure that it has a name,
 * a clock and a status."). The solver still checks each field on its own.
 */
export function dataRuleGroups(
	draft: ProjectDataDraft,
	rules: readonly DataRule[],
	lang: SpecLanguage = 'en'
): DataRuleGroup[] {
	const fr = lang === 'fr';
	const q = (name: string) => quoteName('fr', name);
	const out: DataRuleGroup[] = [];
	for (const entity of draft.entities) {
		const table = entity.name.trim();
		for (const shape of GROUPABLE) {
			const mine = rules.filter((r) => r.entityId === entity.id && r.shape === shape);
			if (mine.length < 2) continue;
			const names = mine.map((rule) => {
				const field = draft.fields.find((f) => f.id === rule.fieldId);
				const target =
					field?.type === 'relation'
						? draft.entities.find((e) => e.id === field.relationTargetEntityId)?.name.trim()
						: undefined;
				return fieldWords(field?.name ?? '', target);
			});
			const ears =
				shape === 'required'
					? fr
						? `Tant qu'un enregistrement ${q(table)} existe, le système doit garantir que ${list(names.map((n) => `son ${q(n)}`), 'et')} sont renseignés.`
						: `While ${withArticle(table)} exists, the system shall ensure that it has ${list(names.map(fieldWithArticle), 'and')}.`
					: fr
						? `Le système doit permettre qu'un enregistrement ${q(table)} n'ait pas de ${list(names.map(q), 'ni de')}.`
						: `The system shall allow ${withArticle(table)} to have no ${list(names, 'or')}.`;
			out.push({ key: `${shape}:${entity.id}`, shape, entityId: entity.id, ears, ruleKeys: mine.map((r) => r.key) });
		}
	}
	return out;
}

// ── what a starting value compares to ───────────────────────────────────────

/** Whether the behaviour's state starts from the field's starting value. */
export function startsTheSame(field: EntityField, state: BehaviourState): boolean {
	const initial = field.defaultValue.trim();
	const value = state.defaultValue;
	if (typeof value === 'number') return Number(initial) === value;
	if (typeof value === 'boolean') return /^(true|1|yes)$/i.test(initial) === value;
	return String(value ?? '') === initial;
}

/**
 * The yes-or-no states that could say a record of a table exists, best first:
 * those whose path shares words with the table's name. Never applied on its own.
 */
export function suggestedExistenceStates(
	entity: DataEntity,
	states: readonly BehaviourState[],
	limit = 3
): BehaviourState[] {
	const table = tokens(entity.name);
	return states
		.filter((state) => state.type === 'boolean')
		.map((state) => ({ state, score: [...table].filter((t) => tokens(state.path).has(t)).length }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || a.state.path.localeCompare(b.state.path))
		.slice(0, limit)
		.map(({ state }) => state);
}

/**
 * The page a person opens on one rule of the data model: the Data model tab,
 * read as rules, unfolded on that rule. Relative to the installation; the
 * server that knows the installation makes it whole.
 */
export function dataRulePagePath(projectId: string, ruleKey: string): string {
	const query = new URLSearchParams({ tab: 'model', view: 'rules', rule: ruleKey });
	return `/projects/${encodeURIComponent(projectId)}/infrastructure?${query.toString()}`;
}
