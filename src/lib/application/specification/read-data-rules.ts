import {
	dataRuleGroups,
	dataRulePagePath,
	dataRules,
	existenceReading,
	missingForProof,
	parseExistence,
	startsTheSame,
	suggestedExistenceStates,
	suggestedStates,
	type DataRuleCheck,
	type DataRuleShape,
	type LinkAuthor,
	type MissingForProof
} from '$domain/data';

/** A table's existence as the page says it, or null when none is named (or it no longer reads). */
const readExistence = (text: string | undefined): string | null => {
	const condition = text ? parseExistence(text) : null;
	return condition ? existenceReading(condition) : null;
};
import type { SpecLanguage } from '$domain/language';
import { readDataBehaviour, type TieableState } from './data-behaviour';
import type { DataDraftRepositoryPort, FeaturesDraftRepositoryPort, UnspaghettitAdvisorPort } from '../ports';

/** One rule of the data model as a person reads it: the sentence, how it is known, what it waits for. */
export interface DataRuleReading {
	readonly key: string;
	readonly shape: DataRuleShape;
	readonly entityId: string;
	readonly fieldId: string;
	/** The field's name as the model writes it, for the reader who links it. */
	readonly fieldName: string;
	readonly ears: string;
	readonly check: DataRuleCheck;
	readonly outOfReach?: string;
	/** The state the field is tied to, or null when nothing carries it. */
	readonly tiedTo: string | null;
	/** Who made that link: Lyriks by itself, an AI client, or a person. */
	readonly linkedBy?: LinkAuthor;
	/** What a person has to do before the solver can check it. */
	readonly missing: MissingForProof;
	/** The project invariant the solver is given for it, when there is one. */
	readonly invariantId: string | null;
	/** For a starting value: the behaviour's own, and whether they agree. */
	readonly startsAs?: { readonly behaviour: unknown; readonly same: boolean };
	readonly href: string;
}

export interface DataRulesReading {
	/** False when the engine did not answer: every rule then reads as checked by nothing. */
	readonly engine: boolean;
	readonly rules: readonly DataRuleReading[];
	/** Rules of one kind a table states for several fields, read as one sentence. */
	readonly groups: readonly { key: string; shape: DataRuleShape; entityId: string; ears: string; ruleKeys: readonly string[] }[];
	/** Per field that no state carries: the states that could, best first, with the feature that declares each. */
	readonly suggestions: Readonly<Record<string, readonly { path: string; type: string; featureName?: string }[]>>;
	/** Per table: when a record exists (a yes-or-no state or a status condition), and the yes-or-no states that could say it. */
	readonly tables: readonly {
		readonly entityId: string;
		readonly name: string;
		readonly existence: string | null;
		/** The existence as the page says it: `service.status is not "none"`. */
		readonly existenceReads: string | null;
		readonly candidates: readonly string[];
	}[];
	/** Every state a field could be tied to, for the picker. */
	readonly states: readonly { path: string; type: string; enumValues?: readonly string[]; featureName?: string }[];
}

/** The oracle's verdict on one generated rule, keyed by the rule's key. */
export interface DataRuleVerdict {
	readonly key: string;
	readonly verdict: string;
	readonly summary: string;
	readonly answer: Readonly<Record<string, unknown>>;
	readonly href: string;
}

/**
 * The data model's rules as the Rules reading shows them, and, apart, what the
 * solver says about the ones it is given: the reading is instant, the verdicts
 * take the proofs of every feature that writes what the rules read.
 */
export class ReadDataRulesUseCase {
	constructor(
		private readonly drafts: DataDraftRepositoryPort,
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'readProjectBehavior' | 'proveProjectRules'>,
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>,
		private readonly features?: FeaturesDraftRepositoryPort
	) {}

	async read(projectId: string): Promise<DataRulesReading | null> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return null;
		const lang = (await this.languageOf?.(projectId)) ?? 'en';
		const project = await this.advisor.readProjectBehavior(projectId);
		const behaviour = readDataBehaviour(projectId, project);
		const featureNames = new Map(
			((await this.features?.load(projectId))?.features ?? []).map((f) => [f.id, f.name])
		);
		const named = (state: TieableState) => {
			const featureName = state.owner ? featureNames.get(state.owner.featureId) : undefined;
			return featureName ? { featureName } : {};
		};
		const states = new Map<string, TieableState>(behaviour.states.map((s) => [s.path, s]));
		const generatedByKey = new Map(
			Object.entries(draft.rules?.generated ?? {}).map(([id, origin]) => [`${origin.kind}:${origin.fieldId}`, id])
		);

		const model = dataRules(draft, lang);
		const rules = model.map((rule): DataRuleReading => {
			const tiedTo = behaviour.links.get(rule.fieldId) ?? null;
			const field = draft.fields.find((f) => f.id === rule.fieldId)!;
			const state = tiedTo ? states.get(tiedTo) : undefined;
			return {
				key: rule.key,
				shape: rule.shape,
				entityId: rule.entityId,
				fieldId: rule.fieldId,
				fieldName: field.name,
				ears: rule.ears,
				check: rule.check,
				...(rule.outOfReach ? { outOfReach: rule.outOfReach } : {}),
				tiedTo,
				...(tiedTo && draft.rules?.linkedBy?.[rule.fieldId] ? { linkedBy: draft.rules.linkedBy[rule.fieldId] } : {}),
				missing: missingForProof(rule, draft, behaviour.links),
				invariantId: generatedByKey.get(rule.key) ?? null,
				...(rule.shape === 'starts-as' && state
					? { startsAs: { behaviour: state.defaultValue, same: startsTheSame(field, state) } }
					: {}),
				href: dataRulePagePath(projectId, rule.key)
			};
		});

		const suggestions: Record<string, { path: string; type: string; featureName?: string }[]> = {};
		for (const field of draft.fields) {
			if (behaviour.links.has(field.id)) continue;
			const entity = draft.entities.find((e) => e.id === field.entityId);
			if (!entity) continue;
			const found = suggestedStates(field, entity, behaviour.states) as TieableState[];
			if (found.length > 0) suggestions[field.id] = found.map((s) => ({ path: s.path, type: s.type, ...named(s) }));
		}
		const tables = draft.entities.map((entity) => ({
			entityId: entity.id,
			name: entity.name,
			existence: draft.rules?.existence[entity.id] ?? null,
			existenceReads: readExistence(draft.rules?.existence[entity.id]),
			candidates: suggestedExistenceStates(entity, behaviour.states).map((s) => s.path)
		}));
		return {
			engine: project !== null,
			rules,
			groups: dataRuleGroups(draft, model, lang),
			suggestions,
			tables,
			states: behaviour.states.map((s) => ({
				path: s.path,
				type: s.type,
				...(s.enumValues ? { enumValues: s.enumValues } : {}),
				...named(s)
			}))
		};
	}

	/** The solver's verdict on every rule it is given; null when the engine did not answer. */
	/**
	 * `quick`: only the verdicts the induction settles, at once; the page shows
	 * them while it asks again, without it, for the rest.
	 */
	async verdicts(projectId: string, maxSteps?: number, quick = false): Promise<readonly DataRuleVerdict[] | null> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return [];
		const generated = draft.rules?.generated ?? {};
		const ids = Object.keys(generated);
		if (ids.length === 0) return [];
		if (!this.advisor.proveProjectRules) return null;
		const lang = (await this.languageOf?.(projectId)) ?? 'en';
		const answer = await this.advisor.proveProjectRules({
			projectId,
			invariantIds: ids,
			...(maxSteps ? { maxSteps } : {}),
			language: lang,
			...(quick ? { quick: true } : {})
		});
		if (!answer || answer.kind === 'refused') return null;
		const rows = Array.isArray(answer.value.rules) ? (answer.value.rules as Record<string, unknown>[]) : [];
		return rows.flatMap((row) => {
			const origin = generated[String(row.invariantId)];
			if (!origin) return [];
			const key = `${origin.kind}:${origin.fieldId}`;
			return [
				{
					key,
					verdict: String(row.verdict),
					summary: String(row.summary ?? ''),
					answer: row,
					href: dataRulePagePath(projectId, key)
				}
			];
		});
	}
}
