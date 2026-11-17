import type { DraftProofImpact, ProofChanges, ProofScopeEntry } from '$lib/domain/evolution/proof-impact';
import type { UnspaghettitAdvisorPort, WhatIfResult } from '../ports';
import type { WalkTarget } from './simulate-behavior';

/** Proving both sides of a feature takes longer than a read: give it a batch's budget. */
const BUDGET = { timeoutMs: 60_000 };

export interface WhatIfInput {
	/** A feature as it is stored, or an Evolution draft as its model would leave it. */
	readonly target: WalkTarget;
	/** Changes on top: for a draft they come after its own model. */
	readonly operations?: readonly Record<string, unknown>[];
	readonly projectId: string;
	readonly maxSteps?: number;
}

/**
 * What a change would do to a feature's proofs and scenarios, nothing saved:
 * the engine proves both sides and answers the difference. For a draft the
 * change is its behaviour model replayed with the ids it was built with, on
 * the feature it changes, or on an empty one when it adds a feature.
 */
export class WhatIfUseCase {
	constructor(private readonly advisor: Pick<UnspaghettitAdvisorPort, 'whatIf'>) {}

	async execute(input: WhatIfInput): Promise<WhatIfResult | null> {
		if (!this.advisor.whatIf) return { kind: 'refused', error: 'this engine cannot compare proofs' };
		const extra = input.operations ?? [];
		const { target } = input;
		if (target.kind === 'feature') {
			if (extra.length === 0) return { kind: 'refused', error: 'send the operations of the change' };
			return this.advisor.whatIf(
				{ featureId: target.featureId, operations: extra, projectId: input.projectId, ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}) },
				BUDGET
			);
		}
		const operations = [...(target.model?.operations ?? []), ...extra];
		if (operations.length === 0) {
			return { kind: 'refused', error: `draft ${target.draftId} has no behaviour model to compare` };
		}
		return this.advisor.whatIf(
			{
				...(target.baseLeafId ? { featureId: target.baseLeafId } : { featureId: target.draftId, blank: true }),
				operations,
				...(target.model?.mintedIds?.length ? { mintedIds: target.model.mintedIds } : {}),
				projectId: input.projectId,
				...(input.maxSteps ? { maxSteps: input.maxSteps } : {})
			},
			BUDGET
		);
	}
}

const list = (v: unknown): Record<string, unknown>[] =>
	Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The engine's comparison as the dossier keeps it, or why there is none. */
export function toDraftProofImpact(
	draft: { readonly id: string; readonly name: string },
	result: WhatIfResult | null,
	at: string
): DraftProofImpact {
	const empty = {
		draftId: draft.id,
		draftName: draft.name,
		ranAt: at,
		proven: { before: false, after: false },
		statements: [],
		actions: [],
		goals: [],
		findingsAppeared: [],
		findingsResolved: [],
		scenarios: [],
		unchanged: false
	};
	if (!result) return { ...empty, unavailable: 'the behavior engine is unreachable' };
	if (result.kind === 'refused') return { ...empty, unavailable: result.error };
	const c = result.comparison;
	const scope = list(c.scope)
		.filter((row) => text(row.featureId) !== '')
		.map(
			(row): ProofScopeEntry => ({
				featureId: text(row.featureId),
				featureName: text(row.featureName),
				reason: row.reason === 'declares-a-written-state' ? 'declares-a-written-state' : 'changed',
				...(Array.isArray(row.states) ? { states: row.states.map(String) } : {})
			})
		);
	return {
		...empty,
		...changesOf(c),
		...(scope.length > 0 ? { scope } : {}),
		...(Array.isArray(c.dependents)
			? {
					dependents: list(c.dependents).map((d) => ({
						featureId: text(d.featureId),
						featureName: text(d.featureName),
						...changesOf(d)
					}))
				}
			: {})
	};
}

function changesOf(c: Readonly<Record<string, unknown>>): ProofChanges {
	const proven = (c.proven ?? {}) as Record<string, unknown>;
	const changes = (v: unknown) =>
		list(v).map((row) => ({
			id: text(row.id),
			name: text(row.name),
			...(text(row.before) ? { before: text(row.before) } : {}),
			...(text(row.after) ? { after: text(row.after) } : {})
		}));
	const findings = (v: unknown) =>
		list(v).map((f) => ({
			kind: text(f.kind),
			severity: text(f.severity),
			on: text(f.on),
			detail: text(f.detail),
			...(Array.isArray(f.path)
				? {
						path: list(f.path).map((step) => ({
							actionName: text(step.actionName),
							...(text(step.featureName) ? { featureName: text(step.featureName) } : {}),
							parameters: (step.parameters && typeof step.parameters === 'object' ? step.parameters : {}) as Record<string, unknown>
						}))
					}
				: {})
		}));
	const dead = c.deadlocks && typeof c.deadlocks === 'object' ? (c.deadlocks as Record<string, unknown>) : null;
	const passOrFail = (v: unknown): { value: 'pass' | 'fail' } | null =>
		v === 'pass' || v === 'fail' ? { value: v } : null;
	return {
		proven: {
			before: proven.before === true,
			after: proven.after === true,
			...(text(proven.reason) ? { reason: text(proven.reason) } : {})
		},
		statements: changes(c.statements),
		actions: changes(c.actions),
		goals: changes(c.goals),
		...(dead
			? {
					deadlocks: {
						...(text(dead.before) ? { before: text(dead.before) } : {}),
						...(text(dead.after) ? { after: text(dead.after) } : {}),
						...(Array.isArray(dead.path) ? { path: dead.path.map(String) } : {})
					}
				}
			: {}),
		findingsAppeared: findings(c.findingsAppeared),
		findingsResolved: findings(c.findingsResolved),
		scenarios: list(c.scenarios).map((s) => ({
			actionName: text(s.actionName),
			scenarioName: text(s.scenarioName),
			...(passOrFail(s.before) ? { before: passOrFail(s.before)!.value } : {}),
			...(passOrFail(s.after) ? { after: passOrFail(s.after)!.value } : {}),
			...(text(s.reason) ? { reason: text(s.reason) } : {})
		})),
		unchanged: c.unchanged === true
	};
}
