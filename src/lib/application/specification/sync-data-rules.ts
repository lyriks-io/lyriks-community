import { automaticLinks, generatedInvariants, parseExistence, type GeneratedDataRule, type ProjectDataDraft } from '$domain/data';
import type { SpecLanguage } from '$domain/language';
import { readDataBehaviour, type DataBehaviour } from './data-behaviour';
import { planLinks } from './data-links';
import type { ProjectBehavior } from '../ports';
import type { DataDraftRepositoryPort, UnspaghettitAdvisorPort } from '../ports';

export interface SyncDataRulesResult {
	/** False when the engine did not answer or refused the batch: nothing changed. */
	readonly ok: boolean;
	readonly added: number;
	readonly updated: number;
	readonly removed: number;
	/** Fields Lyriks linked by itself in this sync (one state only could hold each). */
	readonly linked?: number;
	readonly error?: string;
}

const NOTHING = { added: 0, updated: 0, removed: 0 } as const;

const sameInvariant = (
	held: Readonly<Record<string, unknown>> | undefined,
	wanted: { name: string; condition: unknown; message: string; description: string }
) =>
	!!held &&
	held.name === wanted.name &&
	held.message === wanted.message &&
	held.description === wanted.description &&
	JSON.stringify(held.condition) === JSON.stringify(wanted.condition);

/**
 * Give the solver the rules the data model states: every provable rule whose
 * field is tied to a state becomes a project invariant, rewritten when the
 * model changes and removed when it no longer applies, in one atomic project
 * batch. Only the invariants Lyriks generated are touched (the map it keeps);
 * a rule a person wrote is never changed. A rule whose state no feature
 * declares any more is left out rather than refusing the whole batch.
 *
 * First, Lyriks links by itself every field only one state can hold (see
 * automaticLinks), so the rules of a model captured with its behaviour are
 * checked without anyone linking them by hand.
 */
export class SyncDataRulesUseCase {
	/** One sync at a time per project: two at once would read the same map and add a rule twice. */
	readonly #running = new Map<string, Promise<unknown>>();

	constructor(
		private readonly drafts: DataDraftRepositoryPort,
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'readProjectBehavior' | 'applyProjectBatch'>,
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
	) {}

	execute(projectId: string): Promise<SyncDataRulesResult> {
		return this.withProjectMutation(projectId, () => this.#run(projectId));
	}

	/** Explicit field links and automatic links must plan from successive reads. */
	withProjectMutation<T>(projectId: string, run: () => Promise<T>): Promise<T> {
		const previous = this.#running.get(projectId) ?? Promise.resolve(null);
		const next = previous.catch(() => null).then(run);
		this.#running.set(projectId, next);
		const clear = () => {
			if (this.#running.get(projectId) === next) this.#running.delete(projectId);
		};
		// finally() would create a second rejected promise nobody observes.
		void next.then(clear, clear);
		return next;
	}

	async #run(projectId: string): Promise<SyncDataRulesResult> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return { ok: true, ...NOTHING };
		const read = await this.advisor.readProjectBehavior(projectId);
		if (!read) return { ok: false, ...NOTHING, error: 'The behavior engine did not answer.' };
		const lang = (await this.languageOf?.(projectId)) ?? 'en';
		const { behaviour, linked } = await this.#linkWhatIsCertain(projectId, draft, read, lang);
		const states = new Map(behaviour.states.map((state) => [state.path, state]));

		const desired = generatedInvariants(draft, behaviour.links, states, lang).filter((rule) => {
			const path = behaviour.links.get(rule.fieldId);
			const text = draft.rules?.existence[rule.entityId];
			const existence = text ? parseExistence(text) : null;
			return (
				!!path &&
				states.has(path) &&
				(rule.kind !== 'required' || (!!existence && (existence.operator === 'always' || states.has(existence.path))))
			);
		});

		const current = draft.rules?.generated ?? {};
		const idOfKey = new Map<string, string>(
			Object.entries(current).map(([id, origin]) => [`${origin.kind}:${origin.fieldId}`, id])
		);
		const kept: Record<string, GeneratedDataRule> = {};
		const ops: Record<string, unknown>[] = [];
		let updated = 0;
		for (const rule of desired) {
			const origin: GeneratedDataRule = { entityId: rule.entityId, fieldId: rule.fieldId, kind: rule.kind };
			const id = idOfKey.get(rule.key);
			if (id && behaviour.invariants.has(id)) {
				idOfKey.delete(rule.key);
				kept[id] = origin;
				if (!sameInvariant(behaviour.invariants.get(id), rule.invariant)) {
					ops.push({ kind: 'update_project_invariant', invariantId: id, ...rule.invariant });
					updated += 1;
				}
			} else {
				ops.push({ kind: 'add_project_invariant', ref: rule.key, invariant: rule.invariant });
			}
		}
		const stale = [...idOfKey.values()].filter((id) => behaviour.invariants.has(id));
		for (const id of stale) ops.push({ kind: 'remove_project_invariant', invariantId: id });
		const added = ops.filter((op) => op.kind === 'add_project_invariant').length;

		if (ops.length > 0) {
			const answer = await this.advisor.applyProjectBatch(projectId, ops, false);
			if (!answer) return { ok: false, ...NOTHING, error: 'The behavior engine did not answer.' };
			if (answer.kind === 'refused') return { ok: false, ...NOTHING, error: answer.error };
			const value = answer.value as { ok?: boolean; errors?: unknown; refs?: Record<string, string> };
			if (value.ok === false) {
				const errors = Array.isArray(value.errors) ? value.errors.map(String) : [];
				return { ok: false, ...NOTHING, error: errors.join('; ') || 'The engine refused the rules.' };
			}
			const refs = value.refs ?? {};
			for (const rule of desired) {
				const id = refs[rule.key];
				if (id) kept[id] = { entityId: rule.entityId, fieldId: rule.fieldId, kind: rule.kind };
			}
		}
		await this.drafts.saveGeneratedRules?.(projectId, kept);
		return { ok: true, added, updated, removed: stale.length, ...(linked > 0 ? { linked } : {}) };
	}

	/** Link every field only one state can hold; the reading of the behaviour after it. */
	async #linkWhatIsCertain(
		projectId: string,
		draft: ProjectDataDraft,
		read: ProjectBehavior,
		lang: SpecLanguage
	): Promise<{ behaviour: DataBehaviour; linked: number }> {
		const behaviour = readDataBehaviour(projectId, read);
		const certain = automaticLinks(draft, behaviour.states, behaviour.links, new Set(draft.rules?.declined ?? []));
		if (certain.length === 0) return { behaviour, linked: 0 };
		const plan = planLinks(projectId, draft, behaviour, certain, 'lyriks', lang);
		if (plan.ops.length === 0) return { behaviour, linked: 0 };
		const answer = await this.advisor.applyProjectBatch(projectId, plan.ops, false);
		const value = answer?.kind === 'refused' ? null : (answer?.value as { ok?: boolean } | undefined);
		// Linking is a help, never a condition: a refusal leaves the rules as they were.
		if (!value || value.ok === false) return { behaviour, linked: 0 };
		await this.drafts.saveLinkRecord?.(projectId, plan);
		const after = await this.advisor.readProjectBehavior(projectId);
		return {
			behaviour: after ? readDataBehaviour(projectId, after) : behaviour,
			linked: plan.outcomes.filter((o) => o.ok).length
		};
	}
}
