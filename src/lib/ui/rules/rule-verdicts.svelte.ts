import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { KernelRule } from '$application/specification/index-feature-rules';
import type { FeatureRuleVerdicts, RuleVerdict } from '$application/analysis/rule-verdicts';
import { projectRuleVerdict } from './project-rule-verdict';

/**
 * What the solver says about the rules the Rules tab lists, asked apart from
 * the list: the list and its sentences show at once, then each feature is
 * proved in the background, one after the other since the engine proves one
 * feature at a time. A feature's rules come first, from the rule checks alone
 * (seconds); its statements after every waiting feature's rules, from the
 * path search (up to a minute). The project's own statements get the
 * oracle's verdict, the quick one (induction alone) first. Every answer is
 * the server's.
 */

export type ProvingState = 'queued' | 'proving' | 'done' | 'failed';

/** A group of the tab to prove: a feature (null for the project-wide one), and whether it holds statements. */
export interface ProofRequest {
	readonly featureId: string | null;
	readonly hasStatements: boolean;
}

type Part = 'rules' | 'statements';

/** The key the project-wide group stands under: it has no feature id. */
const PROJECT = '__project';

export class RuleVerdictsStore {
	readonly features = new SvelteMap<string, FeatureRuleVerdicts>();
	/** The state of each group's rules (for the project, of its oracle answer). */
	readonly states = new SvelteMap<string, ProvingState>();
	/** The state of each feature's statements, once asked. */
	readonly statementStates = new SvelteMap<string, ProvingState>();
	/** The project statements' verdicts, by statement id. */
	readonly project = new SvelteMap<string, RuleVerdict>();
	/** Set while "prove every feature" runs; cleared when it ends or is stopped. */
	provingAll = $state(false);
	#queues: Record<Part, string[]> = { rules: [], statements: [] };
	#running = false;
	/** How each feature's rules read when it was last asked for. */
	#readings = new Map<string, string>();

	constructor(private readonly projectId: string) {}

	/** Prove these groups unless already asked: rules first, statements after. */
	request(groups: readonly ProofRequest[]): void {
		for (const { featureId, hasStatements } of groups) {
			if (featureId === null) {
				if (!this.states.has(PROJECT)) void this.#proveProject();
				continue;
			}
			if (!this.states.has(featureId)) {
				this.states.set(featureId, 'queued');
				this.#queues.rules.push(featureId);
			}
			if (hasStatements && !this.statementStates.has(featureId)) {
				this.statementStates.set(featureId, 'queued');
				this.#queues.statements.push(featureId);
			}
		}
		void this.#drain();
	}

	/** Prove every group not proved yet, one after the other, until done or stopped. */
	proveAll(groups: readonly ProofRequest[]): void {
		this.provingAll = true;
		this.request(groups);
	}

	/** Stop proving what is still waiting; a proof already under way finishes. */
	stop(): void {
		for (const key of this.#queues.rules) this.states.delete(key);
		for (const key of this.#queues.statements) this.statementStates.delete(key);
		this.#queues = { rules: [], statements: [] };
		this.provingAll = false;
	}

	/**
	 * Prove one feature as its page reads it (criterion be4c97ee). Rules that read otherwise since the
	 * last proof are proved again: a verdict never outlives the rules it was given on.
	 */
	proveFeature(featureId: string, actions: readonly { readonly rules: readonly { readonly id: string; readonly text: string; readonly kind: string }[] }[]): void {
		const rules = actions.flatMap((a) => a.rules);
		const reading = rules.map((r) => `${r.id}:${r.text}`).join('\n');
		if (this.#readings.get(featureId) !== reading) {
			this.#readings.set(featureId, reading);
			this.features.delete(featureId);
			this.states.delete(featureId);
			this.statementStates.delete(featureId);
		}
		this.request([{ featureId, hasStatements: rules.some((r) => r.kind === 'invariant') }]);
	}

	/** What the solver says about one rule of a feature, by the rule's id. */
	ruleVerdict(featureId: string, ruleId: string): RuleVerdict | undefined {
		return this.features.get(featureId)?.rules[ruleId];
	}

	/** Why a feature carries no verdict, once the solver said it could not prove it. */
	unproven(featureId: string): string | null {
		const read = this.features.get(featureId);
		return read?.solver === 'unavailable' ? (read.scope?.text ?? null) : null;
	}

	/** Proofs still waiting or under way, rules and statements counted apart. */
	get remaining(): number {
		let n = 0;
		for (const map of [this.states, this.statementStates]) {
			for (const state of map.values()) if (state === 'queued' || state === 'proving') n += 1;
		}
		return n;
	}

	stateOf(featureId: string | null): ProvingState | undefined {
		return this.states.get(featureId ?? PROJECT);
	}

	statementStateOf(featureId: string | null): ProvingState | undefined {
		return featureId ? this.statementStates.get(featureId) : undefined;
	}

	verdictOf(rule: KernelRule): RuleVerdict | undefined {
		if (rule.origin.kind === 'project') return this.project.get(rule.nodeId);
		return this.features.get(rule.origin.featureId ?? '')?.rules[rule.nodeId];
	}

	actionVerdict(featureId: string | null, actionId: string): RuleVerdict | undefined {
		return featureId ? this.features.get(featureId)?.actions[actionId] : undefined;
	}

	/** The flaws found in these groups so far, null while none of them is proved. */
	flawsOf(featureIds: readonly (string | null)[]): number | null {
		let proved = false;
		let flaws = 0;
		for (const id of featureIds) {
			if (id === null) {
				if (this.states.get(PROJECT) !== 'done') continue;
				proved = true;
				for (const v of this.project.values()) if (v.flaw) flaws += 1;
				continue;
			}
			const read = this.features.get(id);
			if (!read) continue;
			proved = true;
			flaws += read.flaws;
		}
		return proved ? flaws : null;
	}

	async #drain(): Promise<void> {
		if (this.#running) return;
		this.#running = true;
		try {
			for (;;) {
				const part: Part | null =
					this.#queues.rules.length > 0 ? 'rules' : this.#queues.statements.length > 0 ? 'statements' : null;
				if (!part) break;
				const featureId = this.#queues[part].shift()!;
				const states = part === 'rules' ? this.states : this.statementStates;
				states.set(featureId, 'proving');
				const read = await this.#fetchFeature(featureId, part);
				if (read) {
					this.#merge(read);
					states.set(featureId, 'done');
				} else states.set(featureId, 'failed');
			}
		} finally {
			this.#running = false;
			this.provingAll = false;
		}
	}

	/** One part's verdicts laid over what the other part already said. */
	#merge(read: FeatureRuleVerdicts): void {
		const known = this.features.get(read.featureId);
		if (!known) {
			this.features.set(read.featureId, read);
			return;
		}
		const rules = { ...known.rules, ...read.rules };
		const actions = { ...known.actions, ...read.actions };
		const flaws = [...Object.values(rules), ...Object.values(actions)].filter((v) => v.flaw).length;
		this.features.set(read.featureId, {
			...read,
			solver: known.solver === 'ran' || read.solver === 'ran' ? 'ran' : 'unavailable',
			scope: read.scope?.open ? read.scope : (known.scope ?? read.scope),
			rules,
			actions,
			flaws
		});
	}

	async #fetchFeature(featureId: string, part: Part): Promise<FeatureRuleVerdicts | null> {
		const query = new URLSearchParams({ projectId: this.projectId, featureId, part });
		try {
			const response = await fetch(`/api/behavior/rules/verdicts?${query}`);
			return response.ok ? ((await response.json()) as FeatureRuleVerdicts) : null;
		} catch {
			return null;
		}
	}

	async #proveProject(): Promise<void> {
		this.states.set(PROJECT, 'proving');
		const quick = await this.#fetchProject(true);
		if (quick) this.#placeProject(quick);
		const full = await this.#fetchProject(false);
		if (full) this.#placeProject(full);
		this.states.set(PROJECT, full || quick ? 'done' : 'failed');
	}

	#placeProject(rows: readonly Record<string, unknown>[]): void {
		for (const row of rows) {
			const id = String(row.invariantId ?? '');
			if (id) this.project.set(id, projectRuleVerdict(row));
		}
	}

	async #fetchProject(quick: boolean): Promise<readonly Record<string, unknown>[] | null> {
		const query = new URLSearchParams({ projectId: this.projectId, ...(quick ? { quick: '1' } : {}) });
		try {
			const response = await fetch(`/api/behavior/project/rules?${query}`);
			if (!response.ok) return null;
			const body = (await response.json()) as { ok?: boolean; rules?: Record<string, unknown>[] };
			return body.ok && Array.isArray(body.rules) ? body.rules : null;
		} catch {
			return null;
		}
	}
}

const CONTEXT = Symbol('rule-verdicts');

/** Shares one store with every list of rules the page draws: proving is slow, never asked twice. */
export function setRuleVerdicts(store: RuleVerdictsStore): void {
	setContext(CONTEXT, store);
}

/** The page's store, or null where no page set one: the rules then read without verdict. */
export function getRuleVerdicts(): RuleVerdictsStore | null {
	return getContext<RuleVerdictsStore | undefined>(CONTEXT) ?? null;
}
