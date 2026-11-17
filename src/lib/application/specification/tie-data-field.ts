import { existenceProblem, existenceText, parseExistence, type LinkAuthor } from '$domain/data';
import type { SpecLanguage } from '$domain/language';
import { readDataBehaviour } from './data-behaviour';
import { planLinks, type LinkOutcome, type LinkRequest } from './data-links';
import type { DataDraftRepositoryPort, UnspaghettitAdvisorPort } from '../ports';
import type { SyncDataRulesResult, SyncDataRulesUseCase } from './sync-data-rules';

export type TieDataFieldResult =
	| { readonly ok: true; readonly rules: SyncDataRulesResult }
	| { readonly ok: false; readonly status: 400 | 404 | 409 | 503; readonly error: string };

/** Many links at once: each one's outcome, and how the solver's rules moved. */
export type LinkDataFieldsResult =
	| { readonly ok: true; readonly outcomes: readonly LinkOutcome[]; readonly rules: SyncDataRulesResult }
	| { readonly ok: false; readonly status: 400 | 404 | 503; readonly error: string };

const refused = (status: 400 | 404 | 409 | 503, error: string): TieDataFieldResult => ({ ok: false, status, error });

/**
 * Link data fields to the behaviour states that carry their values, take links
 * back, or name the state that says a record of a table exists. The engine
 * holds the links (it reports when a field and its state drift apart); a state
 * a feature only declares is registered for the project first. A state that
 * already carries another field is refused rather than silently taken from it,
 * and a field a person unlinked is linked again only by a person. Many links
 * are one engine batch; every change resyncs the rules the solver is given.
 */
export class TieDataFieldUseCase {
	constructor(
		private readonly drafts: DataDraftRepositoryPort,
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'readProjectBehavior' | 'applyProjectBatch'>,
		private readonly sync: Pick<SyncDataRulesUseCase, 'execute'> & Partial<Pick<SyncDataRulesUseCase, 'withProjectMutation'>>,
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
	) {}

	/** A person links one field. */
	async tie(projectId: string, fieldId: string, statePath: string): Promise<TieDataFieldResult> {
		return this.#one(await this.link(projectId, [{ fieldId, statePath }], 'person'));
	}

	/** A person takes one link back: Lyriks will not make it again by itself. */
	async untie(projectId: string, fieldId: string): Promise<TieDataFieldResult> {
		return this.#one(await this.link(projectId, [{ fieldId, statePath: null }], 'person'));
	}

	async link(projectId: string, requests: readonly LinkRequest[], author: LinkAuthor): Promise<LinkDataFieldsResult> {
		const result = await this.#mutate(projectId, () => this.#writeLinks(projectId, requests, author));
		return result.ok ? { ...result, rules: await this.sync.execute(projectId) } : result;
	}

	#mutate<T>(projectId: string, run: () => Promise<T>): Promise<T> {
		return this.sync.withProjectMutation ? this.sync.withProjectMutation(projectId, run) : run();
	}

	async #writeLinks(projectId: string, requests: readonly LinkRequest[], author: LinkAuthor): Promise<
		| Omit<Extract<LinkDataFieldsResult, { ok: true }>, 'rules'>
		| Extract<LinkDataFieldsResult, { ok: false }>
	> {
		const lang = (await this.languageOf?.(projectId)) ?? 'en';
		const draft = await this.drafts.load(projectId);
		if (!draft) return { ok: false, status: 404, error: 'No data model yet.' };
		const project = await this.advisor.readProjectBehavior(projectId);
		if (!project) return { ok: false, status: 503, error: 'The behavior engine did not answer.' };
		const plan = planLinks(projectId, draft, readDataBehaviour(projectId, project), requests, author, lang);
		if (plan.ops.length > 0) {
			const answer = await this.advisor.applyProjectBatch(projectId, plan.ops, false);
			if (!answer) return { ok: false, status: 503, error: 'The behavior engine did not answer.' };
			if (answer.kind === 'refused') return { ok: false, status: 400, error: answer.error };
			const value = answer.value as { ok?: boolean; errors?: unknown };
			if (value.ok === false) {
				const errors = Array.isArray(value.errors) ? value.errors.map(String) : [];
				return { ok: false, status: 400, error: errors.join('; ') || 'The engine refused the links.' };
			}
		}
		if (plan.recordChanged) await this.drafts.saveLinkRecord?.(projectId, plan);
		return { ok: true, outcomes: plan.outcomes };
	}

	#one(result: LinkDataFieldsResult): TieDataFieldResult {
		if (!result.ok) return result;
		const [outcome] = result.outcomes;
		if (outcome && !outcome.ok) return refused(outcome.status ?? 400, outcome.error ?? 'The link was refused.');
		return { ok: true, rules: result.rules };
	}

	/**
	 * Link fields and name existence states by the names an AI client reads in
	 * the model (table and field, matched without regard to case). A name that
	 * matches nothing is refused on its own line; the rest still apply.
	 */
	async linkByNames(
		projectId: string,
		request: {
			readonly links?: readonly { table: string; field: string; statePath: string | null; also?: boolean }[];
			readonly existence?: readonly { table: string; statePath: string | null }[];
		},
		author: LinkAuthor
	): Promise<LinkDataFieldsResult & { existence?: readonly { table: string; ok: boolean; error?: string }[] }> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return { ok: false, status: 404, error: 'No data model yet.' };
		const key = (name: string) => name.trim().toLowerCase();
		const tableOf = (name: string) => draft.entities.find((e) => key(e.name) === key(name));

		const existence: { table: string; ok: boolean; error?: string }[] = [];
		const named: { entityId: string; statePath: string | null }[] = [];
		for (const entry of request.existence ?? []) {
			const table = tableOf(entry.table);
			if (table) named.push({ entityId: table.id, statePath: entry.statePath });
			else existence.push({ table: entry.table, ok: false, error: `No table "${entry.table}" in the data model.` });
		}
		if (named.length > 0) {
			const outcomes = await this.#setExistence(projectId, named);
			if (!outcomes.ok) return outcomes;
			outcomes.results.forEach((result, i) => {
				const table = draft.entities.find((e) => e.id === named[i]!.entityId)!.name;
				existence.push(result.error ? { table, ok: false, error: result.error } : { table, ok: true });
			});
		}

		const unknown: LinkOutcome[] = [];
		const requests: LinkRequest[] = [];
		for (const entry of request.links ?? []) {
			const table = tableOf(entry.table);
			const field = table && draft.fields.find((f) => f.entityId === table.id && key(f.name) === key(entry.field));
			if (field) requests.push({ fieldId: field.id, statePath: entry.statePath, ...(entry.also ? { also: true } : {}) });
			else
				unknown.push({
					fieldId: `${entry.table}.${entry.field}`,
					statePath: entry.statePath,
					ok: false,
					status: 404,
					error: table ? `No field "${entry.field}" in "${table.name}".` : `No table "${entry.table}" in the data model.`
				});
		}
		const linked = await this.link(projectId, requests, author);
		if (!linked.ok) return linked;
		return { ...linked, outcomes: [...linked.outcomes, ...unknown], ...(existence.length > 0 ? { existence } : {}) };
	}

	/** Name (or, with null, clear) when a record of the table exists: a yes-or-no state, or a condition on its status. */
	async nameExistence(projectId: string, entityId: string, statePath: string | null): Promise<TieDataFieldResult> {
		const set = await this.#setExistence(projectId, [{ entityId, statePath }]);
		if (!set.ok) return set;
		const [result] = set.results;
		if (result?.error) return refused(result.status ?? 400, result.error);
		return { ok: true, rules: await this.sync.execute(projectId) };
	}

	#setExistence(projectId: string, entries: readonly { entityId: string; statePath: string | null }[]) {
		return this.#mutate(projectId, () => this.#setExistenceNow(projectId, entries));
	}

	/** Every existence state at once, in one save of the model; each refused on its own line. */
	async #setExistenceNow(
		projectId: string,
		entries: readonly { entityId: string; statePath: string | null }[]
	): Promise<
		| { ok: true; results: { error?: string; status?: 400 | 404 }[] }
		| { ok: false; status: 404 | 503; error: string }
	> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return { ok: false, status: 404, error: 'No data model yet.' };
		const needsStates = entries.some((e) => e.statePath !== null);
		const project = needsStates ? await this.advisor.readProjectBehavior(projectId) : null;
		if (needsStates && !project) return { ok: false, status: 503, error: 'The behavior engine did not answer.' };
		const states = project ? readDataBehaviour(projectId, project).states : [];
		const existence = { ...(draft.rules?.existence ?? {}) };
		const results = entries.map(({ entityId, statePath }): { error?: string; status?: 400 | 404 } => {
			if (!draft.entities.some((e) => e.id === entityId)) return { status: 404, error: 'That table is not in the data model.' };
			if (statePath === null) {
				delete existence[entityId];
				return {};
			}
			const condition = parseExistence(statePath);
			if (!condition) {
				return {
					status: 400,
					error: `"${statePath}" says neither a state nor a condition: name a yes-or-no state, or a status condition such as service.status != none, or exchange.status in pending|signed.`
				};
			}
			if (condition.operator === 'always') {
				existence[entityId] = existenceText(condition);
				return {};
			}
			const state = states.find((s) => s.path === condition.path);
			if (!state) return { status: 404, error: `No feature declares the state "${condition.path}".` };
			const problem = existenceProblem(condition, state);
			if (problem) return { status: 400, error: problem };
			existence[entityId] = existenceText(condition);
			return {};
		});
		await this.drafts.save({ ...draft, rules: { existence, generated: draft.rules?.generated ?? {} } });
		return { ok: true, results };
	}
}
