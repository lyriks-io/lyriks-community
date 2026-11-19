import type { SimulateStepsResult } from '$application/ports';
import type { WalkTarget } from './simulate-behavior';

export type DraftTarget = Extract<WalkTarget, { kind: 'draft' }>;

/** One computed draft as kept: the inputs it was computed from, and its answer. */
export interface DraftWalkRecord {
	readonly inputs: string;
	readonly at: string;
	readonly result: SimulateStepsResult;
}

/** The computed drafts of one project, by draft id. */
export interface StoredDraftWalks {
	readonly entries: Readonly<Record<string, DraftWalkRecord>>;
}

/** Where computed drafts outlive the process: one document per project. */
export interface DraftWalkStore {
	load(projectId: string): Promise<StoredDraftWalks | null>;
	save(projectId: string, data: StoredDraftWalks): Promise<void>;
}

export interface DraftFeatureMemoOptions {
	/**
	 * The content fingerprint of a stored feature, null when it cannot be read.
	 * A draft is replayed over its base feature and nothing else of the kernel,
	 * so it is computed again only when that feature or its own model moved.
	 * Without it nothing is kept and every call reaches the engine.
	 */
	readonly featureFingerprint?: (projectId: string, featureId: string) => string | null;
	/** The engine build: a draft another build computed is computed again. */
	readonly engine?: string;
	/** Keeps computed drafts across restarts; best effort, never a dependency of a read. */
	readonly store?: DraftWalkStore;
	readonly onStoreError?: (error: unknown) => void;
	/** Drafts held in memory, all projects together. */
	readonly kept?: number;
	/** Drafts held in the store, per project. */
	readonly storedPerProject?: number;
	readonly now?: () => string;
}

/** What makes a kept answer: bumped when the kept part of an answer changes shape. */
const FORMAT = 'draft-walk/1';
const KEPT_IN_MEMORY = 128;
const STORED_PER_PROJECT = 64;

/**
 * The part of a walk the readers of a draft use: its verdict and the feature it
 * makes. The batch report (created ids, minted ids) is a writer's concern and is
 * not kept, which keeps a stored draft the size of its feature.
 */
function keptPart(answer: SimulateStepsResult | null): SimulateStepsResult | null {
	if (answer?.kind !== 'walk') return answer;
	const { ok, persisted, featureId, errors, feature } = answer.walk;
	return {
		kind: 'walk',
		walk: {
			ok,
			persisted,
			featureId,
			...(errors !== undefined ? { errors } : {}),
			...(feature !== undefined ? { feature } : {})
		}
	};
}

function isRecord(value: unknown): value is DraftWalkRecord {
	const record = value as Partial<DraftWalkRecord> | null;
	return (
		typeof record === 'object' &&
		record !== null &&
		typeof record.inputs === 'string' &&
		typeof record.at === 'string' &&
		record.result?.kind === 'walk' &&
		typeof record.result.walk === 'object'
	);
}

/**
 * The feature a draft's behaviour model makes, computed once per model and base
 * feature. The engine serves one call at a time and replaying a draft costs
 * about a second on a large project, so the readers that list every draft (the
 * Changes board, a request's graph, its index) would otherwise queue behind each
 * other on every load. Computed drafts are held in memory, shared by readers
 * that ask at once, and kept in the store so a restart computes nothing again.
 * Each caller gets its own copy: nothing a reader changes reaches the next one.
 */
export class DraftFeatureMemo {
	readonly #memory = new Map<string, { inputs: string; pending: Promise<SimulateStepsResult | null> }>();
	readonly #stored = new Map<string, Promise<Map<string, DraftWalkRecord>>>();
	readonly #saving = new Map<string, Promise<void>>();

	constructor(
		private readonly compute: (target: DraftTarget) => Promise<SimulateStepsResult | null>,
		private readonly options: DraftFeatureMemoOptions = {}
	) {}

	async walk(projectId: string, target: DraftTarget): Promise<SimulateStepsResult | null> {
		const inputs = this.#inputsOf(projectId, target);
		if (inputs === null) return keptPart(await this.compute(target));
		const slot = `${projectId}\u0000${target.draftId}`;
		let entry = this.#memory.get(slot);
		if (entry && entry.inputs === inputs) {
			// Most recently used last, so the oldest is the one let go.
			this.#memory.delete(slot);
			this.#memory.set(slot, entry);
		} else {
			const pending = this.#fromStore(projectId, target.draftId, inputs).then(
				(stored) => stored ?? this.#computeAndKeep(projectId, target, inputs)
			);
			entry = { inputs, pending };
			this.#memory.delete(slot);
			this.#memory.set(slot, entry);
			this.#trim();
			// Only a walk is kept: an engine that did not answer or refused is asked again.
			const kept = entry;
			pending.then(
				(answer) => {
					if (answer?.kind !== 'walk') this.#forget(slot, kept);
				},
				() => this.#forget(slot, kept)
			);
		}
		const answer = await entry.pending;
		return answer === null ? null : structuredClone(answer);
	}

	/** Everything the computed feature depends on, or null when it cannot be told. */
	#inputsOf(projectId: string, target: DraftTarget): string | null {
		const fingerprint = this.options.featureFingerprint;
		if (!fingerprint) return null;
		let base: string | null = null;
		if (target.baseLeafId) {
			try {
				base = fingerprint(projectId, target.baseLeafId);
			} catch {
				base = null;
			}
			if (base === null) return null;
		}
		return JSON.stringify([
			FORMAT,
			this.options.engine ?? '',
			target.draftKind,
			target.baseLeafId,
			base,
			target.model?.operations ?? [],
			target.model?.mintedIds ?? []
		]);
	}

	async #computeAndKeep(projectId: string, target: DraftTarget, inputs: string): Promise<SimulateStepsResult | null> {
		const answer = keptPart(await this.compute(target));
		if (answer?.kind === 'walk' && this.options.store) {
			const now = this.options.now?.() ?? new Date().toISOString();
			void this.#keep(projectId, target.draftId, { inputs, at: now, result: answer });
		}
		return answer;
	}

	async #fromStore(projectId: string, draftId: string, inputs: string): Promise<SimulateStepsResult | null> {
		if (!this.options.store) return null;
		const records = await this.#records(projectId);
		const record = records.get(draftId);
		return record && record.inputs === inputs ? record.result : null;
	}

	/** The project's stored drafts, read once per process and kept in step with each save. */
	#records(projectId: string): Promise<Map<string, DraftWalkRecord>> {
		let records = this.#stored.get(projectId);
		if (!records) {
			records = (this.options.store?.load(projectId) ?? Promise.resolve(null)).then(
				(stored) =>
					new Map(
						Object.entries(stored?.entries ?? {}).filter((pair): pair is [string, DraftWalkRecord] => isRecord(pair[1]))
					),
				(error) => {
					this.options.onStoreError?.(error);
					return new Map<string, DraftWalkRecord>();
				}
			);
			this.#stored.set(projectId, records);
		}
		return records;
	}

	/** Saves of one project run one after the other, so two drafts computed at once both land. */
	#keep(projectId: string, draftId: string, record: DraftWalkRecord): Promise<void> {
		const previous = this.#saving.get(projectId) ?? Promise.resolve();
		const next = previous.then(async () => {
			const records = await this.#records(projectId);
			records.set(draftId, record);
			const limit = this.options.storedPerProject ?? STORED_PER_PROJECT;
			const newest = [...records].sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, limit);
			for (const [id] of records) if (!newest.some(([kept]) => kept === id)) records.delete(id);
			await this.options.store!.save(projectId, { entries: Object.fromEntries(records) });
		}).catch((error) => this.options.onStoreError?.(error));
		this.#saving.set(projectId, next);
		return next;
	}

	#forget(slot: string, entry: { pending: Promise<SimulateStepsResult | null> }): void {
		if (this.#memory.get(slot)?.pending === entry.pending) this.#memory.delete(slot);
	}

	#trim(): void {
		const kept = this.options.kept ?? KEPT_IN_MEMORY;
		for (const oldest of this.#memory.keys()) {
			if (this.#memory.size <= kept) break;
			this.#memory.delete(oldest);
		}
	}
}
