import { compareNames } from '$domain/shared';
import type { EntityField, OnDelete, ProjectDataDraft } from '$domain/data';
import { text } from './labels';

/**
 * One table of the data map read in words, for its drawer: what each field
 * accepts (criterion a7ca2255), how the table relates to the others (criterion
 * 51dd6218) and what a deletion does along each relation (criterion 99e7cc77).
 * Every sentence comes from the data model alone; what it does not state is
 * said not stated, never guessed.
 */

/** What a field accepts: the values a choice allows, and its default when the spec states one. */
export interface FieldAccepts {
	/** "pending · complete · failure", "values not stated" for a choice that lists none, null for any other type. */
	readonly values: string | null;
	/** "Default: false", null when the spec states none. */
	readonly default: string | null;
}

export function fieldAccepts(field: Pick<EntityField, 'type' | 'enumValues' | 'defaultValue'>): FieldAccepts {
	const members = (field.enumValues ?? []).map(text).filter(Boolean);
	const values = field.type === 'enum' ? (members.length > 0 ? members.join(' · ') : 'values not stated') : null;
	const stated = text(field.defaultValue);
	return { values, default: stated ? `Default: ${stated}` : null };
}

/** A table named in a sentence, a link to it on the map. */
export interface NamedTable {
	readonly id: string;
	readonly name: string;
}

/** One relation said in a sentence: "Each <holder> <verb> <target> (<field>)", then what a deletion does. */
export interface RelationSentence {
	/** The field carrying the relation. */
	readonly id: string;
	/** Whether the table read holds the relation (its own), or another table points at it. */
	readonly own: boolean;
	readonly holder: NamedTable;
	/** "belongs to one", "may point at one", "points at zero or many", "points at one or many". */
	readonly verb: string;
	/** The table pointed at; null when it is not in the model, the relation then reads broken. */
	readonly target: NamedTable | null;
	readonly field: string;
	/** What deleting the target does, said from the side of the table read; null for a broken relation. */
	readonly deletion: string | null;
	/** Whether the relation records what a deletion does. */
	readonly deletionStated: boolean;
}

const NOT_STATED = 'What deleting it does is not stated.';

/**
 * "a User", "an Asset", "an Update", "a Euro": by the sound the name opens on,
 * a "u" read "you" (User, Unit) and "eu" taking "a".
 */
function aName(name: string): string {
	const w = name.trim().toLowerCase();
	const vowelSound = /^[aio]/.test(w) || (/^e/.test(w) && !/^eu/.test(w)) || /^u[^aeiou]{2}/.test(w);
	return `${vowelSound ? 'an' : 'a'} ${name}`;
}

function verbOf(field: Pick<EntityField, 'isList' | 'isRequired'>): string {
	if (field.isList) return field.isRequired ? 'points at one or many' : 'points at zero or many';
	return field.isRequired ? 'belongs to one' : 'may point at one';
}

/** What deleting the target does, read on the drawer of the table pointed at. */
function seenFromTarget(onDelete: OnDelete, target: string, holder: string): string {
	switch (onDelete) {
		case 'cascade':
			return `Deleting ${aName(target)} deletes each ${holder} that points at it.`;
		case 'set_null':
			return `Deleting ${aName(target)} leaves each ${holder} that points at it without one.`;
		case 'restrict':
			return `${aName(target).replace(/^a/, 'A')} is not deleted while ${aName(holder)} points at it.`;
	}
}

/** The same, read on the drawer of the table holding the relation. */
function seenFromHolder(onDelete: OnDelete, target: string): string {
	switch (onDelete) {
		case 'cascade':
			return `Deleted with its ${target}.`;
		case 'set_null':
			return `Left without its ${target} when that ${target} is deleted.`;
		case 'restrict':
			return `Keeps its ${target} from being deleted.`;
	}
}

const isRelation = (f: EntityField) => f.type === 'relation' && !!f.relationTargetEntityId;

/**
 * Every relation of a table in a sentence: its own first, in the order of its
 * fields, then those of the tables pointing at it, by table name. A table
 * pointing at itself is said once, as its own. Empty when it relates to none.
 * Pure.
 */
export function tableRelations(data: Pick<ProjectDataDraft, 'entities' | 'fields'>, tableId: string): RelationSentence[] {
	const named = (id: string): NamedTable | null => {
		const table = data.entities.find((e) => e.id === id);
		return table ? { id, name: text(table.name) || 'Untitled table' } : null;
	};
	const self = named(tableId);
	if (!self) return [];
	const sentence = (f: EntityField, own: boolean): RelationSentence => {
		const holder = own ? self : (named(f.entityId) ?? { id: f.entityId, name: 'Untitled table' });
		const target = named(f.relationTargetEntityId!);
		const deletion = !target ? null : !f.onDelete ? NOT_STATED : own ? seenFromHolder(f.onDelete, target.name) : seenFromTarget(f.onDelete, target.name, holder.name);
		return { id: f.id, own, holder, verb: verbOf(f), target, field: text(f.name) || 'relation', deletion, deletionStated: !!f.onDelete && !!target };
	};
	const own = data.fields.filter((f) => f.entityId === tableId && isRelation(f)).map((f) => sentence(f, true));
	const pointing = data.fields
		.filter((f) => f.entityId !== tableId && isRelation(f) && f.relationTargetEntityId === tableId)
		.map((f) => sentence(f, false))
		.sort((a, b) => compareNames(a.holder.name, b.holder.name) || compareNames(a.field, b.field));
	return [...own, ...pointing];
}
