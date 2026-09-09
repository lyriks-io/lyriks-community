import type {
	AdoptionResult,
	AttachSourceInput,
	BehavioralIndexPayload,
	CandidateSpanInput,
	CodeAdoptionPort,
	DisposeCandidateInput,
	ElementSpanInput,
	FlagConflictInput,
	ReportImplementationInput,
	ResolveConflictInput
} from '$application/ports';
import type { UnspaEngineClient } from './unspa-engine-client.server';

/**
 * Code → spec over the Unspaghettit engine's stdio MCP.
 *
 * Thin by design: every method is one engine call with the platform's naming at
 * the boundary. The engine already implements adoption end to end — the value
 * added here is that it is reachable ONLY through an authenticated platform
 * route, never as an exposed MCP surface, and that the two calls which would
 * touch the server's filesystem are neutralised (see `seedIndexFromAnalysis`,
 * and the absence of any `attachSourcePath`).
 *
 * Shares the advisor's warm subprocess rather than spawning a second one: the
 * engine keeps an in-memory index of the store, and two processes over the same
 * directory would each hold a half-stale view of it.
 */
export class McpCodeAdoption implements CodeAdoptionPort {
	#engine: UnspaEngineClient;

	constructor(engine: UnspaEngineClient) {
		this.#engine = engine;
	}

	get available(): boolean {
		return this.#engine.available;
	}

	// ───────── Sources ─────────

	async attachSource(input: AttachSourceInput): Promise<AdoptionResult | null> {
		return this.#call('attach_source_file', {
			featureId: input.featureId,
			fileName: input.fileName,
			content: input.content,
			...(input.kind ? { kind: input.kind } : {}),
			...(input.authority ? { authority: input.authority } : {}),
			...(input.artifact ? { artifact: input.artifact } : {}),
			...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {})
		});
	}

	async listSources(projectId: string): Promise<AdoptionResult | null> {
		return this.#call('list_sources', { projectId });
	}

	async getSource(
		sourceId: string,
		opts?: { readonly offset?: number; readonly maxChars?: number }
	): Promise<AdoptionResult | null> {
		return this.#call('get_source', {
			sourceId,
			...(opts?.offset !== undefined ? { offset: opts.offset } : {}),
			...(opts?.maxChars !== undefined ? { maxChars: opts.maxChars } : {})
		});
	}

	async classifySource(
		sourceId: string,
		classification: Readonly<Record<string, unknown>>
	): Promise<AdoptionResult | null> {
		return this.#call('classify_source', { sourceId, ...classification });
	}

	async removeSource(sourceId: string): Promise<AdoptionResult | null> {
		// `confirm` is the engine's guard against an accidental delete; the platform
		// route is the place that decides, and it only calls this deliberately.
		return this.#call('remove_source', { sourceId, confirm: true });
	}

	// ───────── Analysis ─────────

	async recordElementSpans(
		featureId: string,
		spans: readonly ElementSpanInput[],
		sourceId?: string
	): Promise<AdoptionResult | null> {
		return this.#call('record_element_spans', {
			featureId,
			...(sourceId ? { sourceId } : {}),
			spans: spans.map((s) => ({
				elementId: s.elementId,
				startOffset: s.startOffset,
				endOffset: s.endOffset,
				...(s.sourceId ? { sourceId: s.sourceId } : {})
			}))
		});
	}

	async stageCandidates(
		featureId: string,
		candidates: readonly CandidateSpanInput[],
		sourceId?: string
	): Promise<AdoptionResult | null> {
		return this.#call('stage_candidates', {
			featureId,
			...(sourceId ? { sourceId } : {}),
			candidates: candidates.map((c) => ({
				startOffset: c.startOffset,
				endOffset: c.endOffset,
				summary: c.summary,
				...(c.sourceId ? { sourceId: c.sourceId } : {}),
				...(c.kind ? { kind: c.kind } : {}),
				...(c.confidence !== undefined ? { confidence: c.confidence } : {})
			}))
		});
	}

	async disposeCandidate(input: DisposeCandidateInput): Promise<AdoptionResult | null> {
		return this.#call('dispose_candidate', {
			featureId: input.featureId,
			candidateId: input.candidateId,
			...(input.disposition ? { disposition: input.disposition } : {}),
			...(input.rationale ? { rationale: input.rationale } : {}),
			...(input.elementId ? { elementId: input.elementId } : {})
		});
	}

	async flagConflict(input: FlagConflictInput): Promise<AdoptionResult | null> {
		return this.#call('flag_conflict', {
			featureId: input.featureId,
			summary: input.summary,
			...(input.statements ? { statements: input.statements } : {}),
			...(input.affectedElements ? { affectedElements: input.affectedElements } : {})
		});
	}

	async resolveConflict(input: ResolveConflictInput): Promise<AdoptionResult | null> {
		return this.#call('resolve_conflict', {
			featureId: input.featureId,
			conflictId: input.conflictId,
			status: input.status,
			resolution: input.resolution,
			...(input.resolvedInFavorOf ? { resolvedInFavorOf: input.resolvedInFavorOf } : {})
		});
	}

	async finalizeAnalysis(featureId: string): Promise<AdoptionResult | null> {
		return this.#call('finalize_analysis', { featureId });
	}

	async resetAnalysis(featureId: string): Promise<AdoptionResult | null> {
		return this.#call('reset_analysis', { featureId, confirm: true });
	}

	async getProvenance(featureId: string): Promise<AdoptionResult | null> {
		return this.#call('get_provenance', { featureId });
	}

	async getSourceCoverage(featureId: string, sourceId?: string): Promise<AdoptionResult | null> {
		return this.#call('get_source_coverage', {
			featureId,
			...(sourceId ? { sourceId } : {})
		});
	}

	// ───────── Implementation index ─────────

	/**
	 * ALWAYS `dryRun: true`. Left to itself the engine writes the entries into a
	 * `.unspa.json` beside its own working directory — inside the platform
	 * container, a file no developer will ever see, while the checkout that
	 * matters stays empty. Previewing returns the same entries and writes
	 * nothing; the caller persists them in the repo it actually owns.
	 */
	async seedIndexFromAnalysis(
		featureId: string,
		opts?: { readonly overwrite?: boolean }
	): Promise<AdoptionResult | null> {
		return this.#call('seed_index_from_analysis', {
			featureId,
			dryRun: true,
			...(opts?.overwrite ? { overwrite: true } : {})
		});
	}

	async syncImplementationIndex(
		projectId: string,
		index: BehavioralIndexPayload
	): Promise<AdoptionResult | null> {
		return this.#call('sync_from_index', { projectId, index });
	}

	async reportImplementationStatus(
		input: ReportImplementationInput
	): Promise<AdoptionResult | null> {
		return this.#call('report_implementation_status', {
			featureId: input.featureId,
			...(input.actionId ? { actionId: input.actionId } : {}),
			...(input.surfaceId ? { surfaceId: input.surfaceId } : {}),
			foundEntities: input.foundEntities
		});
	}

	async reportImplementationStatusBatch(
		featureId: string,
		entries: readonly Omit<ReportImplementationInput, 'featureId'>[]
	): Promise<AdoptionResult | null> {
		// The engine names the batch `reports`; sending our own word for it made
		// every batch push fail its input validation, which is why the sidecar
		// stayed empty on an adopted project.
		return this.#call('report_implementation_status_batch', { featureId, reports: entries });
	}

	async getImplementationStatus(
		featureId: string,
		opts?: Readonly<Record<string, unknown>>
	): Promise<AdoptionResult | null> {
		return this.#call('get_implementation_status', { featureId, ...(opts ?? {}) });
	}

	async getBehavioralIndex(
		projectId: string,
		index: BehavioralIndexPayload,
		filters?: Readonly<Record<string, unknown>>
	): Promise<AdoptionResult | null> {
		return this.#call('get_behavioral_index', { projectId, index, ...(filters ?? {}) });
	}

	async getImplementationGaps(
		featureId: string,
		projectId: string,
		index: BehavioralIndexPayload
	): Promise<AdoptionResult | null> {
		return this.#call('get_implementation_gaps', { featureId, projectId, index });
	}

	/**
	 * `projectId` is always sent, even alongside a `featureId` the engine would
	 * scope by anyway. Without it the engine's whole-project sweep falls back to
	 * every feature it can see — which on a shared appliance means one tenant's
	 * drift report quietly includes another's.
	 */
	async getImplementationDrift(
		projectId: string,
		index: BehavioralIndexPayload,
		featureId?: string
	): Promise<AdoptionResult | null> {
		return this.#call('get_drift', { projectId, index, ...(featureId ? { featureId } : {}) });
	}

	/**
	 * One engine call. Keeps a tool's refusal as `{ok: false, error}` instead of
	 * collapsing it to null: across this whole port a refusal is the answer (an
	 * untraced element, a finalized analysis, a source over the cap), and the
	 * agent cannot correct what it cannot read. Only an unreachable engine is null.
	 */
	async #call(name: string, args: Record<string, unknown>): Promise<AdoptionResult | null> {
		const res = await this.#engine.callJsonOrError(name, args);
		if (res === null) return null;
		if (!res.ok) return res;
		const value = res.value;
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? { ok: true, value: value as Readonly<Record<string, unknown>> }
			: { ok: true, value: { result: value } };
	}
}
