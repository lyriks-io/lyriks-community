import type { BehaviourState, BehaviourStateType } from '$domain/data';
import type { ProjectBehavior } from '../ports';
import { dataModelFeatureId } from '../projection/aux-feature-ids';

/**
 * The behaviour a project's data model is tied to, read from what the engine
 * holds for the project: every state a feature declares (with whether the
 * project registered it and where it lives) and the links from a data field to
 * the state that carries its value. The engine is the one source of the links:
 * it also reports when a field and its state drift apart.
 *
 * Pure: the engine's project reading in, the data model's view out.
 */

/** A state of the behaviour as the data model can tie a field to it. */
export interface TieableState extends BehaviourState {
	/** The engine's id of the state variable (a projection's is its declaration's id). */
	readonly stateId: string;
	/** Whether the project registered it; an unregistered one is registered before a link. */
	readonly registered: boolean;
	/** The surface that declares it, the owner a registration names. */
	readonly owner: { readonly featureId: string; readonly surfaceId: string } | null;
	readonly description: string;
}

export interface DataBehaviour {
	readonly states: readonly TieableState[];
	/** Data field id to the path of the state that carries it. */
	readonly links: ReadonlyMap<string, string>;
	/** The project invariants the engine holds, by id: what the rules sync compares with. */
	readonly invariants: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

const TYPES: readonly BehaviourStateType[] = ['string', 'number', 'boolean', 'enum', 'object', 'array'];
const ENT = 'ent-';
const FLD = 'fld-';

type Row = Readonly<Record<string, unknown>>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function readDataBehaviour(projectId: string, behavior: ProjectBehavior | null): DataBehaviour {
	if (!behavior) return { states: [], links: new Map(), invariants: new Map() };
	const registered = new Set(behavior.registeredStateIds ?? []);
	const dataModel = dataModelFeatureId(projectId);
	const states: TieableState[] = [];
	const links = new Map<string, string>();
	for (const row of rows((behavior.stateVariables as { stateVariables?: unknown }).stateVariables)) {
		const path = str(row.path);
		const type = str(row.type) as BehaviourStateType;
		if (!path || !TYPES.includes(type)) continue;
		const owner = row.owner as { featureId?: unknown; surfaceId?: unknown } | undefined;
		const enumValues = Array.isArray(row.enumValues) ? row.enumValues.map(String) : undefined;
		states.push({
			path,
			type,
			...(enumValues ? { enumValues } : {}),
			defaultValue: row.defaultValue,
			stateId: str(row.id),
			registered: registered.has(str(row.id)),
			owner:
				owner && str(owner.featureId) && str(owner.surfaceId)
					? { featureId: str(owner.featureId), surfaceId: str(owner.surfaceId) }
					: null,
			description: str(row.description)
		});
		const field = (row.links as { dataField?: Row } | undefined)?.dataField;
		if (field && str(field.featureId) === dataModel && str(field.fieldId).startsWith(FLD)) {
			links.set(str(field.fieldId).slice(FLD.length), path);
		}
	}
	const invariants = new Map(behavior.projectInvariants.map((invariant) => [str(invariant.id), invariant]));
	return { states, links, invariants };
}

/** The engine's address of a data field, as a link names it. */
export const dataFieldAddress = (projectId: string, entityId: string, fieldId: string) => ({
	featureId: dataModelFeatureId(projectId),
	entityId: `${ENT}${entityId}`,
	fieldId: `${FLD}${fieldId}`
});
