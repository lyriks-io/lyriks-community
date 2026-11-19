import type {
	SimulateStepsArgs,
	SimulateStepsResult,
	UnspaghettitAdvisorPort
} from '$application/ports';
import {
	behaviourBaseOf,
	isDraftLeafId,
	type DraftBehaviourModel,
	type DraftLeaf,
	type ProjectEvolutionDraft
} from '$domain/evolution';

/**
 * What a simulation runs on. A stored feature is simulated as it is; a draft
 * carried by an Evolution request is simulated as the change would leave it:
 * its behaviour model (see DraftBehaviourModel) replayed over the feature it
 * stands for, or over an empty feature for an addition. Nothing is saved.
 */
export type WalkTarget =
	| { readonly kind: 'feature'; readonly featureId: string }
	| {
			readonly kind: 'draft';
			readonly draftId: string;
			readonly draftKind: DraftLeaf['kind'];
			/** What the draft is called, so a computed feature reads under its name. */
			readonly name: string;
			readonly requestId: string;
			/** The stored feature the model replays over; null for an addition. */
			readonly baseLeafId: string | null;
			/** The draft's runnable behaviour, when one was authored. */
			readonly model?: DraftBehaviourModel;
			/** Whether the request is frozen: its drafts can then be read, not written. */
			readonly frozen: boolean;
	  };

export type ResolveWalkTarget =
	| { readonly ok: true; readonly target: WalkTarget }
	| { readonly ok: false; readonly status: 400 | 404; readonly message: string };

/**
 * Where a simulation of `featureId` starts, reading the project's Evolution
 * requests for a draft id. An added draft with neither a model nor operations
 * sent has nothing to run, and is refused with that sentence rather than with
 * "action not found".
 */
export function resolveWalkTarget(
	featureId: string,
	evolution: Pick<ProjectEvolutionDraft, 'requests'>,
	hasOperations: boolean
): ResolveWalkTarget {
	if (!isDraftLeafId(featureId)) return { ok: true, target: { kind: 'feature', featureId } };
	// A draft is named in full or by a unique prefix, like everything a request holds.
	const all = evolution.requests.flatMap((request) => (request.drafts ?? []).map((draft) => ({ request, draft })));
	const exact = all.filter((x) => x.draft.id === featureId);
	const byPrefix = featureId.length >= 'draft:'.length + 4 ? all.filter((x) => x.draft.id.startsWith(featureId)) : [];
	const hits = exact.length > 0 ? exact : byPrefix;
	if (hits.length > 1)
		return { ok: false, status: 400, message: `"${featureId}" starts ${hits.length} drafts: ${hits.map((x) => x.draft.id).join(', ')}. Give more of the id.` };
	for (const { request, draft } of hits) {
		if (draft.kind === 'add' && !draft.materialisedAs && !draft.behaviourModel && !hasOperations) {
			return {
				ok: false,
				status: 400,
				message:
					`Draft ${featureId} adds a feature that has no behaviour model yet. ` +
					'Author one with apply_behavior_batch on this draft id (it is kept on the draft, nothing official is created), ' +
					'or send `operations` with the simulation.'
			};
		}
		return {
			ok: true,
			target: {
				kind: 'draft',
				draftId: draft.id,
				draftKind: draft.kind,
				name: draft.name,
				requestId: request.id,
				baseLeafId: behaviourBaseOf(draft),
				...(draft.behaviourModel ? { model: draft.behaviourModel } : {}),
				frozen: request.frozen === true
			}
		};
	}
	return {
		ok: false,
		status: 404,
		message: `Draft ${featureId} is not carried by any request of this project.`
	};
}

export interface SimulateBehaviorInput {
	readonly target: WalkTarget;
	readonly args: Omit<SimulateStepsArgs, 'featureId' | 'blank' | 'mintedIds' | 'newOperationsFrom'>;
	/**
	 * How the operations of the call relate to a draft's model: `after` (the
	 * default) replays the model then the call's operations, which are reported
	 * as the new ones; `instead` replays the call's operations alone, as the
	 * model that would replace the stored one, keeping its ids slot for slot.
	 */
	readonly operationsMode?: 'after' | 'instead';
	/** Ids to replay in place of the stored ones: the ones a dry run just answered. */
	readonly mintedIds?: readonly string[];
}

/**
 * A simulation can replay a long flow or explore a large state space: give it
 * the budget a batch gets rather than the short one of a read.
 */
const BUDGET = { timeoutMs: 60_000 };

/** How many computed drafts are kept: a few projects' worth of open requests. */
const DRAFT_WALKS_KEPT = 128;

export interface DraftWalkMemoOptions {
	/**
	 * The signature of a project's behaviour kernel (its folder on disk). The
	 * feature a draft makes depends on its model and on the kernel it replays
	 * over, so a computed draft is reused only while both are unchanged. Without
	 * it, or when it answers null, nothing is kept and every call reaches the
	 * engine.
	 */
	readonly signature?: (projectId: string) => string | null;
	readonly kept?: number;
}

type DraftTarget = Extract<WalkTarget, { kind: 'draft' }>;

/** Simulate a feature, or a draft as the change would leave it, without saving anything. */
export class SimulateBehaviorUseCase {
	/**
	 * Computed drafts, newest last. A pending computation is kept too, so the
	 * readers that ask for the same draft at once share one engine call.
	 */
	readonly #draftWalks = new Map<string, Promise<SimulateStepsResult | null>>();

	constructor(
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'simulateSteps'>,
		private readonly memo: DraftWalkMemoOptions = {}
	) {}

	/**
	 * The feature a draft's behaviour model makes: the walk with the computed
	 * feature and nothing else. The engine serves one call at a time and a
	 * draft costs about a second, so the readers that list every draft (the
	 * Changes board, a request's graph, its index) reuse the answer while the
	 * model and the kernel it replays over are unchanged. Each caller gets its
	 * own copy: nothing a reader changes reaches the next one.
	 */
	async draftFeatureWalk(projectId: string, target: DraftTarget): Promise<SimulateStepsResult | null> {
		const compute = () => this.execute({ target, args: { includeFeature: true } });
		const signature = this.#signature(projectId);
		if (signature === null) return compute();
		const key = JSON.stringify([
			projectId,
			signature,
			target.draftId,
			target.draftKind,
			target.baseLeafId,
			target.model?.operations ?? [],
			target.model?.mintedIds ?? []
		]);
		let pending = this.#draftWalks.get(key);
		if (pending) {
			// Most recently used last, so the oldest is the one let go.
			this.#draftWalks.delete(key);
			this.#draftWalks.set(key, pending);
		} else {
			pending = compute();
			this.#draftWalks.set(key, pending);
			this.#trim();
			// Only a walk is kept: an engine that did not answer or refused is asked again.
			pending.then(
				(answer) => {
					if (answer?.kind !== 'walk') this.#forget(key, pending!);
				},
				() => this.#forget(key, pending!)
			);
		}
		const answer = await pending;
		return answer === null ? null : structuredClone(answer);
	}

	#signature(projectId: string): string | null {
		if (!this.memo.signature) return null;
		try {
			return this.memo.signature(projectId);
		} catch {
			return null;
		}
	}

	#forget(key: string, pending: Promise<SimulateStepsResult | null>): void {
		if (this.#draftWalks.get(key) === pending) this.#draftWalks.delete(key);
	}

	#trim(): void {
		const kept = this.memo.kept ?? DRAFT_WALKS_KEPT;
		for (const oldest of this.#draftWalks.keys()) {
			if (this.#draftWalks.size <= kept) break;
			this.#draftWalks.delete(oldest);
		}
	}

	execute(input: SimulateBehaviorInput): Promise<SimulateStepsResult | null> {
		const { target, args } = input;
		const extra = args.operations ?? [];
		if (target.kind === 'feature') {
			return this.advisor.simulateSteps(
				{
					...args,
					featureId: target.featureId,
					...(extra.length > 0 ? { newOperationsFrom: 0 } : {})
				},
				BUDGET
			);
		}
		const stored = input.operationsMode === 'instead' ? [] : (target.model?.operations ?? []);
		const mintedIds = input.mintedIds ?? target.model?.mintedIds ?? [];
		return this.advisor.simulateSteps(
			{
				...args,
				...(target.baseLeafId
					? { featureId: target.baseLeafId }
					: { featureId: target.draftId, blank: true }),
				operations: [...stored, ...extra],
				...(mintedIds.length > 0 ? { mintedIds } : {}),
				...(extra.length > 0 ? { newOperationsFrom: stored.length } : {})
			},
			BUDGET
		);
	}
}
