import type { CoherenceFinding, EvolutionRequest } from './draft';
import { stableId } from './ids';
import { ELEMENT_PATH_PREFIX } from './spec-actions';
import { quoteName, type SpecLanguage } from '$domain/language';

/**
 * The rules the whole product keeps, changed from a request
 * (ac-evo-draft-rules): the invariants that hold across every feature, written
 * outside a request with apply_project_behavior_batch. A request carries the
 * same operations as a draft (add, change or retire one), laid over the spec
 * for the coherence check (the engine proves the product's rules with the
 * change), validated on the Specification like the rest and written into the
 * project's behaviour only when the change lands.
 */

export const RULE_DRAFT_PREFIX = 'rules:';
export const RULES_PAGE_NAME = 'Rules the whole product keeps';
export const RULE_DRAFT_OPS = ['add_project_invariant', 'update_project_invariant', 'remove_project_invariant'] as const;
export type RuleDraftOp = (typeof RULE_DRAFT_OPS)[number];

export interface RuleDraft {
	/** `rules:<something>`, kept until the change lands. */
	readonly id: string;
	/** What the change does to the rules, in the person's words. */
	summary: string;
	/** Operations in the vocabulary of apply_project_behavior_batch, its invariant operations only. */
	operations: Record<string, unknown>[];
	sourceIds: string[];
	/** Set by the landing. */
	materialisedAt: string | null;
}

const kindOf = (op: Readonly<Record<string, unknown>>): string => String(op.kind ?? op.op ?? '');

/** Whether the operations are invariant operations of the project batch: the sentence naming the first that is not, or null. */
export function ruleOperationsIssue(operations: readonly unknown[]): string | null {
	if (operations.length === 0) return 'A change to the rules needs at least one operation.';
	for (const [index, raw] of operations.entries()) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return `Operation ${index + 1} is not an object.`;
		const kind = kindOf(raw as Record<string, unknown>);
		if (!(RULE_DRAFT_OPS as readonly string[]).includes(kind))
			return `Operation ${index + 1} (${kind || 'no kind'}) is not a change to a rule the whole product keeps: the operations are ${RULE_DRAFT_OPS.join(', ')}. State variables and core features are written outside a request.`;
	}
	return null;
}

/** The operations, each named by its kind the way the engine reads them. */
export const engineOperations = (operations: readonly Readonly<Record<string, unknown>>[]): Record<string, unknown>[] =>
	operations.map((op) => (op.kind === undefined && op.op !== undefined ? { ...op, kind: op.op } : { ...op }));

/** The invariant an operation names: its id for a change or a retirement, null for an addition. */
export const invariantIdOf = (op: Readonly<Record<string, unknown>>): string | null =>
	typeof op.invariantId === 'string' ? op.invariantId : typeof op.invariantRef === 'string' ? op.invariantRef : null;

/** The invariant an addition writes. */
export const addedInvariantOf = (op: Readonly<Record<string, unknown>>): Record<string, unknown> =>
	(op.invariant && typeof op.invariant === 'object' ? op.invariant : op) as Record<string, unknown>;

/**
 * A change to the rules is validated on the Specification on a synthetic field
 * whose value is its fingerprint, like a path of the journey: an operation
 * changed after a person validated it reads stale.
 */
export const RULE_CHANGE_PATH_PREFIX = `${ELEMENT_PATH_PREFIX}rules.`;
export const ruleChangeKey = (draft: Pick<RuleDraft, 'id'>): string => `${RULE_CHANGE_PATH_PREFIX}${draft.id.slice(RULE_DRAFT_PREFIX.length)}`;
export const ruleChangeFingerprint = (draft: Pick<RuleDraft, 'summary' | 'operations'>): string => JSON.stringify({ summary: draft.summary, operations: draft.operations });
export const ruleDraftOfKey = (drafts: readonly RuleDraft[] | undefined, key: string): RuleDraft | undefined => (drafts ?? []).find((d) => ruleChangeKey(d) === key);

export const liveRuleDrafts = (drafts: readonly RuleDraft[] | undefined): RuleDraft[] => (drafts ?? []).filter((d) => d.materialisedAt === null);

/** Every operation of the request's changes to the rules, in order, as one batch. */
export const ruleLandingOperations = (drafts: readonly RuleDraft[] | undefined): Record<string, unknown>[] =>
	engineOperations(liveRuleDrafts(drafts).flatMap((d) => d.operations));

/* ------------------------------------------- the product as the request leaves it */

/** The state paths a condition reads, on either side of every comparison. */
export function statePathsRead(condition: unknown): string[] {
	const paths = new Set<string>();
	const walk = (node: unknown) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach(walk);
		const n = node as Record<string, unknown>;
		if (typeof n.left === 'string') paths.add(n.left);
		if (n.kind === 'state' && typeof n.path === 'string') paths.add(n.path);
		for (const key of ['left', 'right', 'condition', 'conditions']) if (key in n && typeof n[key] === 'object') walk(n[key]);
	};
	walk(condition);
	return [...paths];
}

/** The condition an invariant operation writes: an addition's, or the one a change patches in. */
const conditionOf = (op: Readonly<Record<string, unknown>>): unknown =>
	op.kind === 'add_project_invariant' ? addedInvariantOf(op).condition : op.kind === 'update_project_invariant' ? (op.patch as Record<string, unknown> | undefined)?.condition ?? op.condition : undefined;

/**
 * The state paths the request's feature drafts declare (ac-evo-draft-rules):
 * what an addition or a rename of their behaviour model brings, which the
 * product as it stands may not hold yet. A draft that removes its feature
 * declares nothing.
 */
export function statePathsDeclaredByDrafts(
	drafts: readonly {
		readonly kind: string;
		readonly behaviourModel?: { readonly operations: readonly Readonly<Record<string, unknown>>[]; readonly landed?: { readonly operations: readonly Readonly<Record<string, unknown>>[] } };
	}[]
): Set<string> {
	const paths = new Set<string>();
	for (const draft of drafts) {
		if (draft.kind === 'remove') continue;
		// What landed in this same batch is not written yet when the rules are checked; what an earlier version wrote is declared anyway.
		for (const op of [...(draft.behaviourModel?.landed?.operations ?? []), ...(draft.behaviourModel?.operations ?? [])]) {
			const kind = String(op.kind ?? op.op ?? '');
			if (kind === 'add_state_definition' && typeof op.path === 'string') paths.add(op.path);
			if (kind === 'update_state_definition') {
				const renamed = (op.patch as Record<string, unknown> | undefined)?.path ?? op.path;
				if (typeof renamed === 'string') paths.add(renamed);
			}
		}
	}
	return paths;
}

/** The engine's sentence for a project invariant reading a state no feature declares. */
const UNDECLARED_STATE = /Project invariant [^;]*?: reads state "([^"]+)", which no feature of the project declares\./g;

/**
 * What the engine's refusal still holds once the request's own drafts are laid
 * over the product (ac-evo-draft-rules): its sentences about a state a feature
 * draft of the request declares drop out, every other one stays. The engine
 * validates the project as it stands; the request is checked as it would leave it.
 */
export function refusalOverDrafts(errors: readonly string[], declaredByDrafts: ReadonlySet<string>): { readonly kept: string[]; readonly deferredPaths: string[] } {
	const kept: string[] = [];
	const deferred = new Set<string>();
	for (const error of errors) {
		const rest = error
			.replace(UNDECLARED_STATE, (sentence, path: string) => {
				if (!declaredByDrafts.has(path)) return sentence;
				deferred.add(path);
				return '';
			})
			.replace(/^[\s;]+|[\s;]+$/g, '')
			.replace(/(;\s*){2,}/g, '; ');
		if (rest !== '') kept.push(rest);
	}
	return { kept, deferredPaths: [...deferred] };
}

/** The invariant operations that read none of these paths: the ones the product as it stands can prove now. */
export const operationsProvableNow = (operations: readonly Readonly<Record<string, unknown>>[], deferredPaths: readonly string[]): Record<string, unknown>[] =>
	engineOperations(operations).filter((op) => !statePathsRead(conditionOf(op)).some((p) => deferredPaths.includes(p)));

/** The names of the rules that read a state only the request's drafts declare: proved once they land. */
export const rulesProvedAtLanding = (operations: readonly Readonly<Record<string, unknown>>[], deferredPaths: readonly string[]): string[] =>
	engineOperations(operations)
		.filter((op) => statePathsRead(conditionOf(op)).some((p) => deferredPaths.includes(p)))
		.map((op) => String(addedInvariantOf(op).name ?? (op.patch as Record<string, unknown> | undefined)?.name ?? invariantIdOf(op) ?? ''));

/**
 * Where the impact walk starts for the request's changes to the rules
 * (ac-evo-draft-section-impact): the states their rules read and the rules
 * they change or retire, as knowledge graph ids. The walk keeps those the
 * graph holds.
 */
export function ruleDraftStartNodeIds(drafts: readonly RuleDraft[] | undefined): { readonly nodeId: string; readonly changeId: string }[] {
	const starts: { nodeId: string; changeId: string }[] = [];
	for (const draft of liveRuleDrafts(drafts)) {
		for (const op of engineOperations(draft.operations)) {
			for (const path of statePathsRead(conditionOf(op))) starts.push({ nodeId: `state:${path}`, changeId: draft.id });
			const id = invariantIdOf(op);
			if (id) starts.push({ nodeId: `rule:${id}`, changeId: draft.id });
		}
	}
	return starts;
}

/* --------------------------------------------------------------- coherence */

/** What the engine says a rule becomes with the change, as its project what-if answers it. */
export interface RuleMove {
	readonly invariantId: string;
	readonly invariantName?: string;
	readonly change: string;
	readonly before: string | null;
	readonly after: string | null;
	readonly summary?: string;
}

const RULE_TITLES = {
	en: {
		broken: (name: string, why: string) => `With this change, the rule ${name} would be broken${why ? `: ${why}` : ''}`,
		refused: (why: string) => `The changes to the rules the whole product keeps do not validate: ${why}`,
		atLanding: (name: string) => `The rule ${name} reads a state only this request's changes declare: it is proved once they land`
	},
	fr: {
		broken: (name: string, why: string) => `Avec ce changement, la règle ${name} serait enfreinte${why ? ` : ${why}` : ''}`,
		refused: (why: string) => `Les changements des règles que tout le produit respecte ne se valident pas : ${why}`,
		atLanding: (name: string) => `La règle ${name} lit un état que seuls les changements de cette demande déclarent : elle est prouvée une fois qu'ils sont posés`
	}
} as const;

/**
 * What the request's changes to the rules would contradict, read off the
 * engine's proof of the product with them (ac-evo-draft-rules): a rule the
 * change leaves broken where it held, and a change the engine refuses.
 */
export function ruleDraftCoherence(input: {
	readonly request: Pick<EvolutionRequest, 'id' | 'ruleDrafts'>;
	/**
	 * The engine's answer: the rules that move (and those that read a state only
	 * the request's drafts declare, proved once they land), or the sentence that
	 * refuses the change; null when no proof ran.
	 */
	readonly proof: { readonly moves: readonly RuleMove[]; readonly provedAtLanding?: readonly string[] } | { readonly refused: string } | null;
	readonly lang?: SpecLanguage;
}): CoherenceFinding[] {
	const live = liveRuleDrafts(input.request.ruleDrafts);
	if (live.length === 0 || !input.proof) return [];
	const titles = RULE_TITLES[input.lang ?? 'en'];
	const node = `rules:${live[0].id}`;
	if ('refused' in input.proof)
		return [
			{
				id: stableId('coh-rules-refused', input.request.id),
				axis: 'structural',
				severity: 'blocking',
				title: titles.refused(input.proof.refused),
				requestNodeId: node,
				existingNodeId: 'project:rules',
				fixNowTarget: `evolution.${input.request.id}.ruleDrafts`,
				published: true
			}
		];
	const lang = input.lang ?? 'en';
	const atLanding: CoherenceFinding[] = (input.proof.provedAtLanding ?? []).map((name) => ({
		id: stableId('coh-rules-at-landing', input.request.id, name),
		axis: 'functional' as const,
		severity: 'minor' as const,
		title: titles.atLanding(quoteName(lang, name)),
		requestNodeId: node,
		existingNodeId: 'project:rules',
		fixNowTarget: `evolution.${input.request.id}.ruleDrafts`,
		published: true,
		note: true
	}));
	const broken = input.proof.moves
		.filter((m) => m.after === 'violated' && m.before !== 'violated')
		.map((m) => ({
			id: stableId('coh-rules-broken', input.request.id, m.invariantId),
			axis: 'functional' as const,
			severity: 'blocking' as const,
			title: titles.broken(quoteName(lang, m.invariantName || m.invariantId), m.summary ?? ''),
			requestNodeId: node,
			existingNodeId: `invariant:${m.invariantId}`,
			fixNowTarget: `evolution.${input.request.id}.ruleDrafts`,
			published: true
		}));
	return [...broken, ...atLanding];
}
