import type { AppServices } from '$composition/container.server';
import { indexFeatureRules } from '$application/specification/index-feature-rules';
import {
	addedInvariantOf,
	engineOperations,
	invariantIdOf,
	liveRuleDrafts,
	operationsProvableNow,
	refusalOverDrafts,
	ruleLandingOperations,
	ruleOperationsIssue,
	rulesProvedAtLanding,
	statePathsDeclaredByDrafts,
	type EvolutionRequest,
	type RuleMove
} from '$domain/evolution';
import type { SpecLanguage } from '$domain/language';

/**
 * The rules the whole product keeps, changed from a request (ac-evo-draft-rules):
 * checked by the engine as a dry run of apply_project_behavior_batch when
 * drafted, proved with the change for the coherence check, read as EARS
 * sentences before and after, and written into the project's behaviour at the
 * landing through the same use case as the batch.
 */

type Outcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };
type Said = { readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] };

/** What the engine says of these operations on the project as it stands, each refusal a sentence of its own. */
async function engineErrors(services: AppServices, projectId: string, operations: readonly Record<string, unknown>[], dryRun: boolean): Promise<Said> {
	const result = await services.authorProjectBehavior.execute({ projectId, operations: engineOperations(operations), dryRun });
	if (!result) return { ok: false, errors: ['The behaviour engine did not answer.'] };
	if (result.kind === 'refused') return { ok: false, errors: 'errors' in result ? result.errors : [result.error] };
	const value = result.value as { ok?: unknown; errors?: unknown };
	if (value.ok === false) {
		const errors = Array.isArray(value.errors) ? value.errors.map(String) : [];
		return { ok: false, errors: errors.length > 0 ? errors : ['The change does not validate.'] };
	}
	return { ok: true };
}

async function engineSays(services: AppServices, projectId: string, operations: readonly Record<string, unknown>[], dryRun: boolean): Promise<Outcome> {
	const said = await engineErrors(services, projectId, operations, dryRun);
	return said.ok ? said : { ok: false, reason: said.errors.join('; ') };
}

/**
 * What the engine refuses of these operations on the product as the request
 * would leave it (ac-evo-draft-rules): checked on the project as it stands, a
 * refusal about a state a feature draft of the same request declares is not
 * one. Null when nothing is left to refuse.
 */
async function refusalWithDrafts(
	services: AppServices,
	projectId: string,
	operations: readonly Record<string, unknown>[],
	request: Partial<Pick<EvolutionRequest, 'drafts'>> | null
): Promise<string | null> {
	const said = await engineErrors(services, projectId, operations, true);
	if (said.ok) return null;
	const { kept } = refusalOverDrafts(said.errors, statePathsDeclaredByDrafts(request?.drafts ?? []));
	return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Whether the engine accepts the operations on the product as the request would
 * leave it: its other changes to the rules laid first (all but `replacing`, the
 * change being rewritten), the states its feature drafts declare counted as
 * declared. The sentence that refuses them, or null.
 */
export async function checkRuleOperations(
	services: AppServices,
	projectId: string,
	operations: readonly unknown[],
	request: Partial<Pick<EvolutionRequest, 'drafts' | 'ruleDrafts'>> | null = null,
	replacing: string | null = null
): Promise<string | null> {
	if (ruleOperationsIssue(operations) !== null) return null; // the act names the malformed operation itself
	const earlier = ruleLandingOperations((request?.ruleDrafts ?? []).filter((d) => d.id !== replacing));
	const refusal = await refusalWithDrafts(services, projectId, [...earlier, ...engineOperations(operations as Record<string, unknown>[])], request);
	return refusal === null ? null : `The rules the whole product keeps would refuse this change: ${refusal}`;
}

/**
 * The engine's proof of the product with the request's changes to its rules:
 * the rules whose verdict moves, the refusal, or null where no proof runs
 * (the Community edition, or a request that changes no rule).
 */
export async function proveRuleDrafts(
	services: AppServices,
	projectId: string,
	request: Pick<EvolutionRequest, 'ruleDrafts'> & Partial<Pick<EvolutionRequest, 'drafts'>>
): Promise<{ readonly moves: readonly RuleMove[]; readonly provedAtLanding?: readonly string[] } | { readonly refused: string } | null> {
	const all = ruleLandingOperations(request.ruleDrafts);
	if (all.length === 0 || !services.proofs) return null;
	let operations = all;
	let provedAtLanding: string[] = [];
	let answer = await services.projectRulesOracle.whatIf(projectId, operations).catch(() => null);
	if (answer?.kind === 'refused') {
		// The engine proves the product as it stands: a rule reading a state only the
		// request's drafts declare is proved once they land, the others now (ac-evo-draft-rules).
		const { kept, deferredPaths } = refusalOverDrafts([answer.error], statePathsDeclaredByDrafts(request.drafts ?? []));
		if (kept.length > 0) return { refused: kept.join('; ') };
		provedAtLanding = rulesProvedAtLanding(all, deferredPaths);
		operations = operationsProvableNow(all, deferredPaths);
		if (operations.length === 0) return { moves: [], provedAtLanding };
		answer = await services.projectRulesOracle.whatIf(projectId, operations).catch(() => null);
	}
	if (!answer) return null;
	if (answer.kind === 'refused') return { refused: answer.error };
	const rules = Array.isArray(answer.value.rules) ? (answer.value.rules as Record<string, unknown>[]) : [];
	return {
		...(provedAtLanding.length > 0 ? { provedAtLanding } : {}),
		moves: rules.map((r) => ({
			invariantId: String(r.invariantId),
			...(typeof r.invariantName === 'string' ? { invariantName: r.invariantName } : {}),
			change: String(r.change ?? ''),
			before: typeof r.before === 'string' ? r.before : null,
			after: typeof r.after === 'string' ? r.after : null,
			...(typeof r.summary === 'string' ? { summary: r.summary } : {})
		}))
	};
}

/** One rule a change moves, as the Specification reads it. */
export interface RuleChangeValue {
	readonly label: string;
	/** The rule as it holds today, one EARS sentence; empty for an addition. */
	readonly before: string;
	/** The rule as the change would leave it; empty for a retirement. */
	readonly after: string;
}

export interface RuleDraftReading {
	readonly id: string;
	readonly summary: string;
	readonly sourceIds: readonly string[];
	readonly operationCount: number;
	readonly changes: readonly RuleChangeValue[];
	readonly landedAt: string | null;
}

/** An invariant as one EARS sentence, the way the rules read model derives it. */
function earsOf(invariant: Readonly<Record<string, unknown>>, lang: SpecLanguage): { name: string; sentence: string } {
	const model = indexFeatureRules({ project: { featureIds: [], projectInvariants: [invariant] } } as unknown as Parameters<typeof indexFeatureRules>[0], [], lang);
	const rule = model.groups.find((g) => g.featureId === null)?.rules[0];
	return { name: rule?.title ?? String(invariant.name ?? ''), sentence: rule?.statement ?? '' };
}

/** Each change to the rules, each rule it moves before and after, against the rules as they hold now. */
export async function readRuleDrafts(services: AppServices, projectId: string, request: Pick<EvolutionRequest, 'ruleDrafts'>, lang: SpecLanguage): Promise<RuleDraftReading[]> {
	const drafts = request.ruleDrafts ?? [];
	if (drafts.length === 0) return [];
	const behavior = await services.readProjectBehavior.execute(projectId).catch(() => null);
	const current = new Map((behavior?.projectInvariants ?? []).map((iv) => [String(iv.id), iv]));
	return drafts.map((draft) => ({
		id: draft.id,
		summary: draft.summary,
		sourceIds: draft.sourceIds,
		operationCount: draft.operations.length,
		landedAt: draft.materialisedAt,
		changes: engineOperations(draft.operations).map((op) => {
			const id = invariantIdOf(op);
			const was = id ? current.get(id) : undefined;
			const before = was ? earsOf(was, lang) : null;
			if (op.kind === 'add_project_invariant') {
				const after = earsOf(addedInvariantOf(op), lang);
				return { label: `New rule · ${after.name}`, before: '', after: after.sentence };
			}
			if (op.kind === 'remove_project_invariant') return { label: `Retired rule · ${before?.name ?? id ?? ''}`, before: before?.sentence ?? '', after: '' };
			const patched = { ...(was ?? {}), ...Object.fromEntries(['name', 'condition', 'message', 'description'].filter((k) => op[k] !== undefined).map((k) => [k, op[k]])) };
			const after = earsOf(patched, lang);
			return { label: `Changed rule · ${after.name || before?.name || id || ''}`, before: before?.sentence ?? '', after: after.sentence };
		})
	}));
}

/**
 * Whether the request's changes to the rules still validate on the rules as
 * they stand, all of them in one batch, the behaviour of its drafts landing in
 * the same batch before them (ac-evo-draft-rules).
 */
export async function checkRuleLanding(
	services: AppServices,
	projectId: string,
	request: Pick<EvolutionRequest, 'ruleDrafts'> & Partial<Pick<EvolutionRequest, 'drafts'>>
): Promise<string | null> {
	const operations = ruleLandingOperations(request.ruleDrafts);
	if (operations.length === 0) return null;
	const refusal = await refusalWithDrafts(services, projectId, operations, request);
	return refusal === null ? null : `The changes to the rules the whole product keeps no longer apply: ${refusal}`;
}

/** Write the request's changes to the rules into the project's behaviour, as one batch. */
export async function landRuleDrafts(services: AppServices, projectId: string, operations: readonly Record<string, unknown>[]): Promise<Outcome> {
	if (operations.length === 0) return { ok: true };
	const said = await engineSays(services, projectId, operations, false);
	if (said.ok) {
		services.implementationCoverage.invalidate(projectId);
		void services.scheduleBackSync(projectId).catch(() => {});
	}
	return said;
}

export { liveRuleDrafts };
