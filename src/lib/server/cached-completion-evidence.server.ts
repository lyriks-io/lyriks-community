import type { ProjectModelRevisionPort } from '$application/ports';
import type { CompletionEvidenceReader } from '$application/use-cases/project-completion';
import {
	scopeContentFingerprint,
	type CompletionEvidence,
	type ProjectScopeDraft
} from '$domain/scope';

/** How long a complete reading may be reused (a fingerprint change still wins). */
const FRESH_MS = 10 * 60_000;

/**
 * A reading taken while the engine was over budget is reused only briefly: long
 * enough to absorb a retry storm, short enough that the next real attempt gets a
 * real engine reading rather than a frozen provisional one.
 */
const PROVISIONAL_MS = 45_000;

/** Projects held at once. Beyond this the least recently used entries are dropped. */
const MAX_ENTRIES = 200;

interface Entry {
	key: string;
	evidence: CompletionEvidence;
	at: number;
	provisional: boolean;
}

/**
 * Memoized tier in front of the whole-project evidence build.
 *
 * The build is the heaviest read in the product: it runs the coherence engine,
 * every feature's behavior score, the data model and a full end-to-end
 * Experience verification. Closing a project used to run it THREE times over
 * (assess, then audit, then finish) on a model that had not changed between
 * them, and a caller who gave up and retried added a fourth, a fifth, each one
 * competing with the last for the same single-threaded engine.
 *
 * So the evidence is keyed on what it is evidence OF: the section revisions, the
 * kernel folder, and the authored scope content. While those three are identical
 * the answer cannot differ, and every later reader gets the first one's work.
 * Any real edit changes one of them and the next read recomputes: this trades no
 * freshness for the saving, which is why it can sit under the completion gate.
 *
 * Lives at the server edge, next to the other cached tiers, because the cache is
 * a deployment concern: the use-cases underneath stay pure and un-memoized.
 */
export class CachedCompletionEvidence implements CompletionEvidenceReader {
	readonly #entries = new Map<string, Entry>();
	/** One computation per key: concurrent callers wait on it instead of racing. */
	readonly #inFlight = new Map<string, Promise<CompletionEvidence>>();

	constructor(
		private readonly build: CompletionEvidenceReader,
		private readonly modelRevision: ProjectModelRevisionPort,
		/** Identity of the project's kernel folder; see `kernelSignature`. */
		private readonly kernelSignature: (projectId: string) => string,
		private readonly now: () => number = Date.now
	) {}

	async execute(projectId: string, scope: ProjectScopeDraft): Promise<CompletionEvidence> {
		const key = await this.#key(projectId, scope);
		const cached = this.#entries.get(projectId);
		if (cached && cached.key === key && !this.#expired(cached)) {
			// Refresh recency so an active project is not the one we evict.
			this.#entries.delete(projectId);
			this.#entries.set(projectId, cached);
			return cached.evidence;
		}

		const pending = this.#inFlight.get(key);
		if (pending) return pending;

		const startedAt = this.now();
		const run = this.build
			.execute(projectId, scope)
			.then((evidence) => {
				this.#remember(projectId, key, evidence);
				// One line per real computation, so an install can see at a glance how
				// long its own model takes and whether the engine kept up. Cache hits
				// stay silent: a portfolio read would otherwise log one line per project.
				console.log(
					`[completion] ${projectId}: evidence rebuilt in ${this.now() - startedAt}ms${
						evidence.provisional === true ? ' (engine over budget, reading is provisional)' : ''
					}`
				);
				return evidence;
			})
			.finally(() => {
				this.#inFlight.delete(key);
			});
		this.#inFlight.set(key, run);
		return run;
	}

	/** Drop a project's reading, e.g. after a write that bypassed the fingerprints. */
	invalidate(projectId: string): void {
		this.#entries.delete(projectId);
	}

	async #key(projectId: string, scope: ProjectScopeDraft): Promise<string> {
		const model = await this.modelRevision.fingerprint(projectId);
		// The scope half is fingerprinted WITHOUT its sources: those live in the
		// documents section, so the model half already moves when they do, and the
		// cached evidence's own `currentScopeFingerprint` stays exact.
		return `${projectId}|${model}|${this.kernelSignature(projectId)}|${scopeContentFingerprint(scope)}`;
	}

	#expired(entry: Entry): boolean {
		return this.now() - entry.at > (entry.provisional ? PROVISIONAL_MS : FRESH_MS);
	}

	#remember(projectId: string, key: string, evidence: CompletionEvidence): void {
		this.#entries.delete(projectId);
		this.#entries.set(projectId, {
			key,
			evidence,
			at: this.now(),
			provisional: evidence.provisional === true
		});
		while (this.#entries.size > MAX_ENTRIES) {
			const oldest = this.#entries.keys().next();
			if (oldest.done) break;
			this.#entries.delete(oldest.value);
		}
	}
}
