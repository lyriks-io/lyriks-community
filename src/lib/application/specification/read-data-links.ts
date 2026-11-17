import { linkCandidates, type LinkAuthor } from '$domain/data';
import { readDataBehaviour, type TieableState } from './data-behaviour';
import type { DataDraftRepositoryPort, FeaturesDraftRepositoryPort, UnspaghettitAdvisorPort } from '../ports';

/** One field as an AI client reads it to link it: what it is, what holds it, or what could. */
export interface DataLinkRow {
	readonly table: string;
	readonly field: string;
	readonly fieldId: string;
	readonly kind: string;
	readonly choices?: readonly string[];
	readonly required: boolean;
	/** The state that carries it, and who linked it; null when nothing does. */
	readonly linkedTo: string | null;
	readonly linkedBy?: LinkAuthor;
	/** Further states that carry the same value, never checked by the solver (criterion 3238573b). */
	readonly alsoCarriedBy?: readonly string[];
	/** A person unlinked it: only a person links it again, so it is never proposed. */
	readonly declinedByPerson?: true;
	/** When nothing carries it: the states that could, best first, with what the client weighs. */
	readonly candidates?: readonly {
		readonly path: string;
		readonly type: string;
		readonly description: string;
		readonly featureName?: string;
	}[];
}

export interface DataLinksReading {
	readonly engine: boolean;
	readonly total: number;
	readonly linked: number;
	/** Fields whose rules the solver could check and that no state carries yet. */
	readonly unlinkedCheckable: number;
	readonly offset: number;
	readonly limit: number;
	readonly nextOffset?: number;
	readonly rows: readonly DataLinkRow[];
	/** Per table: the yes-or-no state that says a record exists, or the ones that could. */
	readonly tables: readonly { readonly table: string; readonly existence: string | null }[];
}

export interface ReadDataLinksQuery {
	readonly table?: string;
	readonly unlinkedOnly?: boolean;
	readonly offset?: number;
	readonly limit?: number;
}

/** A field whose rules the solver checks once it is linked: a required value or a choice. */
const checkable = (field: { isList?: boolean; isId?: boolean; isRequired?: boolean; type: string }) =>
	!field.isList && !field.isId && ((field.isRequired === true && field.type !== 'boolean') || field.type === 'enum');

/**
 * The data model's fields with the states that carry them, for an AI client
 * linking the model to the behaviour from its evidence: table by table, paged,
 * each unlinked field with the states that could hold it. Nothing is written.
 */
export class ReadDataLinksUseCase {
	constructor(
		private readonly drafts: DataDraftRepositoryPort,
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'readProjectBehavior'>,
		private readonly features?: FeaturesDraftRepositoryPort
	) {}

	async read(projectId: string, query: ReadDataLinksQuery = {}): Promise<DataLinksReading | null> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return null;
		const project = await this.advisor.readProjectBehavior(projectId);
		const behaviour = readDataBehaviour(projectId, project);
		const featureNames = new Map(((await this.features?.load(projectId))?.features ?? []).map((f) => [f.id, f.name]));
		const further = draft.rules?.alsoCarriedBy ?? {};
		const carried = new Set([...behaviour.links.values(), ...Object.values(further).flat()]);
		const declined = new Set(draft.rules?.declined ?? []);
		const linkedBy = draft.rules?.linkedBy ?? {};
		const wanted = query.table?.trim().toLowerCase();

		const all = draft.entities.flatMap((entity) =>
			draft.fields
				.filter((field) => field.entityId === entity.id && !field.isId && field.name.trim())
				.map((field) => ({ entity, field }))
		);
		const scoped = all.filter(({ entity, field }) => {
			if (wanted && entity.name.trim().toLowerCase() !== wanted) return false;
			return !query.unlinkedOnly || !behaviour.links.has(field.id);
		});
		const offset = Math.max(0, query.offset ?? 0);
		const limit = Math.min(Math.max(1, query.limit ?? 60), 200);
		const page = scoped.slice(offset, offset + limit);

		const rows = page.map(({ entity, field }): DataLinkRow => {
			const linkedTo = behaviour.links.get(field.id) ?? null;
			const choices = field.type === 'enum' ? (field.enumValues ?? []).filter(Boolean) : [];
			const base = {
				table: entity.name,
				field: field.name,
				fieldId: field.id,
				kind: field.type,
				...(choices.length > 0 ? { choices } : {}),
				required: field.isRequired === true,
				linkedTo
			};
			if (linkedTo)
				return {
					...base,
					...(linkedBy[field.id] ? { linkedBy: linkedBy[field.id] } : {}),
					...(further[field.id]?.length ? { alsoCarriedBy: further[field.id] } : {})
				};
			if (declined.has(field.id)) return { ...base, declinedByPerson: true };
			const candidates = linkCandidates(field, entity, behaviour.states, carried) as TieableState[];
			return {
				...base,
				candidates: candidates.map((state) => {
					const featureName = state.owner ? featureNames.get(state.owner.featureId) : undefined;
					return {
						path: state.path,
						type: state.type,
						description: state.description,
						...(featureName ? { featureName } : {})
					};
				})
			};
		});

		return {
			engine: project !== null,
			total: all.length,
			linked: all.filter(({ field }) => behaviour.links.has(field.id)).length,
			unlinkedCheckable: all.filter(({ field }) => checkable(field) && !behaviour.links.has(field.id)).length,
			offset,
			limit,
			...(offset + limit < scoped.length ? { nextOffset: offset + limit } : {}),
			rows,
			tables: draft.entities.map((entity) => ({
				table: entity.name,
				existence: draft.rules?.existence[entity.id] ?? null
			}))
		};
	}

	/**
	 * Per table, the fields whose rules the solver could check and that no state
	 * carries; null when the engine did not answer or the project has no
	 * behaviour state yet (nothing could hold them, so nothing is missing).
	 */
	async unlinkedCheckable(projectId: string): Promise<{ table: string; count: number }[] | null> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return [];
		const project = await this.advisor.readProjectBehavior(projectId);
		if (!project) return null;
		const behaviour = readDataBehaviour(projectId, project);
		if (behaviour.states.length === 0) return null;
		return draft.entities
			.map((entity) => ({
				table: entity.name,
				count: draft.fields.filter(
					(field) => field.entityId === entity.id && checkable(field) && !behaviour.links.has(field.id)
				).length
			}))
			.filter((row) => row.count > 0)
			.sort((a, b) => b.count - a.count || a.table.localeCompare(b.table));
	}
}
