import { mintUuid } from '../shared';
import type {
	DbEngine,
	EntityOrigin,
	FieldType,
	HostKind,
	OnDelete,
	Protocol
} from './enums';

/* ── Entities — mirror of Unspaghettit feature c5380392 ─────────────── */

export interface Host {
	readonly id: string;
	name: string;
	kind: HostKind;
	/** Cloud/hosting provider (free text, e.g. AWS / Azure / GCP). Ignored for on-prem. */
	provider: string;
	/** Region slug from HOST_REGIONS. Ignored for on-prem (customer site). */
	region: string;
	description: string;
}

export interface Database {
	readonly id: string;
	hostId: string;
	name: string;
	engine: DbEngine;
	description: string;
}

export interface DataEntity {
	readonly id: string;
	/** Exact kernel identity when an entity was authored outside Lyriks. */
	readonly kernelEntityId?: string;
	name: string;
	databaseId: string | null;
	description: string;
	derivedFrom: EntityOrigin;
	sourceRefId: string | null;
	/**
	 * Ids from the project Documents & Sources register the table rests on: the
	 * code that declares it first (its model, migration or schema), then every
	 * ticket, page or document that speaks of it (criterion 3918b2ea). Absent
	 * when it cites none.
	 */
	sourceIds?: string[];
	/**
	 * The table relates to no other on purpose (a lookup, a singleton setting, a
	 * table the product no longer uses); the reason is its description. Only a
	 * table marked so AND described escapes the orphan check.
	 */
	standalone?: true;
}

export interface EntityField {
	readonly id: string;
	/** Exact kernel identity when a field was authored outside Lyriks. */
	readonly kernelFieldId?: string;
	entityId: string;
	parentFieldId?: string | null;
	name: string;
	type: FieldType;
	isId: boolean;
	isUnique: boolean;
	isRequired: boolean;
	isList: boolean;
	defaultValue: string;
	relationTargetEntityId: string | null;
	/** Allowed members when `type === 'enum'` (e.g. plan: free|premium|family). */
	enumValues?: string[];
	/** For a relation, what deleting the record it points at does to this one; absent when not stated. */
	onDelete?: OnDelete;
}

export interface Interface {
	readonly id: string;
	protocol: Protocol;
	fromBrick: string;
	toBrick: string;
	operation: string;
	description: string;
}

/**
 * A table name referenced upstream (Step 05 Data Consumed) with the fields each
 * step touched. Read-only — the seed for "no forgotten table, no orphan field".
 */
export interface DerivedEntity {
	name: string;
	fields: string[];
}

/**
 * The persisted content of Step 07. `derivedEntities` is a read-only mirror of
 * the entities the journeys consume — refreshed on every load, never authored.
 */
export interface ProjectDataDraft {
	projectId: string;
	hosts: Host[];
	databases: Database[];
	entities: DataEntity[];
	fields: EntityField[];
	interfaces: Interface[];
	derivedEntities: DerivedEntity[];
	/**
	 * Lyriks-owned client-visibility OVERRIDE, keyed by entity id or field id →
	 * the user's explicit choice. Absent for a key ⇒ follow the experience
	 * (derived visibility). `'hidden'` is a deliberate opt-out; `'shown'` forces a
	 * data back on even if the experience dropped it. Optional for back-compat.
	 */
	visibility?: Record<string, DataVisibilityChoice>;
	/**
	 * What ties the model to the behaviour the solver proves, Lyriks-owned. The
	 * links field to state live in the engine (its state variables); what the
	 * engine cannot hold lives here. Optional for back-compat.
	 */
	rules?: DataRulesSetup;
	lastSavedAt: string | null;
}

/**
 * The part of the data model's rules the engine cannot hold: which behaviour
 * state says a record of a table exists, and which project invariants Lyriks
 * generated from the model (the engine mints their ids, so Lyriks keeps the map
 * to tell them from the rules a person wrote, and to regenerate only its own).
 */
export interface DataRulesSetup {
	/** Table (entity id) to the yes-or-no behaviour state that is true while one of its records exists. */
	existence: Record<string, string>;
	/** Generated project invariant id to where it comes from. */
	generated: Record<string, GeneratedDataRule>;
	/**
	 * Who made each link from a field to the state that carries it (field id to
	 * author). The engine holds the links; this says whose they are, so a
	 * person reads which ones Lyriks made by itself.
	 */
	linkedBy?: Record<string, LinkAuthor>;
	/** Fields a person unlinked: neither Lyriks nor an AI client links them again. */
	declined?: string[];
	/**
	 * Field id to the further states that carry the same value as another
	 * feature sees it (an administrator's view of a user): read wherever data
	 * is read, never checked by the solver, which checks the first state only
	 * (criterion 3238573b).
	 */
	alsoCarriedBy?: Record<string, string[]>;
}

/** Who linked a field to its state: Lyriks by itself, an AI client from its evidence, or a person. */
export type LinkAuthor = 'lyriks' | 'ai-client' | 'person';

/** The kinds of rule the model states that the solver can check. */
export type DataRuleKind = 'required' | 'choice';

export interface GeneratedDataRule {
	readonly entityId: string;
	readonly fieldId: string;
	readonly kind: DataRuleKind;
}

export const emptyDataRules = (): DataRulesSetup => ({ existence: {}, generated: {} });

/** A user's explicit client-visibility choice for one entity or field. */
export type DataVisibilityChoice = 'shown' | 'hidden';

export function createEmptyDataDraft(projectId: string): ProjectDataDraft {
	return {
		projectId,
		hosts: [],
		databases: [],
		entities: [],
		fields: [],
		interfaces: [],
		derivedEntities: [],
		visibility: {},
		lastSavedAt: null
	};
}

function newId(): string {
	return mintUuid();
}

export function createHost(overrides: Partial<Host> = {}): Host {
	return {
		id: newId(),
		name: '',
		kind: 'cloud',
		provider: 'AWS',
		region: 'eu-west-3',
		description: '',
		...overrides
	};
}

export function createDatabase(hostId: string, overrides: Partial<Database> = {}): Database {
	return { id: newId(), hostId, name: '', engine: 'postgres', description: '', ...overrides };
}

export function createEntity(overrides: Partial<DataEntity> = {}): DataEntity {
	return {
		id: newId(),
		name: '',
		databaseId: null,
		description: '',
		derivedFrom: 'manual',
		sourceRefId: null,
		...overrides
	};
}

export function createField(entityId: string, overrides: Partial<EntityField> = {}): EntityField {
	return {
		id: newId(),
		entityId,
		parentFieldId: null,
		name: '',
		type: 'string',
		isId: false,
		isUnique: false,
		isRequired: false,
		isList: false,
		defaultValue: '',
		relationTargetEntityId: null,
		...overrides
	};
}

export function createInterface(overrides: Partial<Interface> = {}): Interface {
	return {
		id: newId(),
		protocol: 'rest',
		fromBrick: '',
		toBrick: '',
		operation: '',
		description: '',
		...overrides
	};
}

/* ── Pure selectors ───────────────────────────────────────────────────── */

export function fieldsOfEntity(draft: ProjectDataDraft, entityId: string): EntityField[] {
	return draft.fields.filter((f) => f.entityId === entityId);
}

export function rootFieldsOfEntity(draft: ProjectDataDraft, entityId: string): EntityField[] {
	return fieldsOfEntity(draft, entityId).filter((f) => !f.parentFieldId);
}

export function childFieldsOfField(draft: ProjectDataDraft, fieldId: string): EntityField[] {
	return draft.fields.filter((f) => f.parentFieldId === fieldId);
}

export function descendantFieldIds(draft: ProjectDataDraft, fieldId: string): string[] {
	const out: string[] = [];
	const walk = (id: string) => {
		for (const child of childFieldsOfField(draft, id)) {
			out.push(child.id);
			walk(child.id);
		}
	};
	walk(fieldId);
	return out;
}

export function databasesOfHost(draft: ProjectDataDraft, hostId: string): Database[] {
	return draft.databases.filter((d) => d.hostId === hostId);
}

export function entitiesOfDatabase(draft: ProjectDataDraft, databaseId: string): DataEntity[] {
	return draft.entities.filter((e) => e.databaseId === databaseId);
}
