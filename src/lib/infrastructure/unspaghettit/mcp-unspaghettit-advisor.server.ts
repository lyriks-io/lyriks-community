import type {
	AdvisorCallBudget,
	BehaviorBatchResult,
	BehaviorContext,
	BehaviorMaturityReport,
	DriftReport,
	FeatureBehavior,
	FeatureDigest,
	FeatureGap,
	FeatureScore,
	FeatureSummary,
	ImplementationCoverage,
	ModelCheckReport,
	QueueItemView,
	QueueKind,
	ScenarioReport,
	ScenarioResult,
	EngineAnswer,
	ProjectBehavior,
	SimulateStepsArgs,
	SimulateStepsResult,
	WhatIfArgs,
	WhatIfResult,
	ProveProjectRulesArgs,
	WhatIfProjectArgs,
	SpecGap,
	SpecProof,
	SpecProofDeadlocks,
	SpecProofFinding,
	SpecProofStuckState,
	SpecProofPath,
	SpecProofReach,
	UnreachedAction,
	SolverStatus,
	UnspaghettitAdvisorPort,
	VerificationVerdict
} from '$application/ports';
import type { SpecLanguage } from '$domain/language';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import {
	extractText,
	msg,
	safeJson,
	UnspaEngineClient,
	type UnspaEngineConfig
} from './unspa-engine-client.server';
import { parseCriteriaEvidence, parseProvenActions } from './parse-implementation-evidence';

/** Proving a project's rules proves every feature that writes what they read. */
const PROJECT_PROOF_TIMEOUT_MS = 600_000;
/** The engine gives the rule checks 30 s; the call waits for that and a margin. */
const RULES_PROOF_TIMEOUT_MS = 60_000;

/**
 * What the advisor needs to reach the engine. Identical to the connection's own
 * configuration, and deliberately the same type: the advisor adds meaning on top
 * of that connection, never a second set of knobs to keep in sync.
 */
export type McpAdvisorConfig = UnspaEngineConfig;

interface ScoreResult {
	score?: number;
	maxScore?: number;
	percentage?: number;
	// 0.4.0 renamed these (`criticalCount` → `criticalIssueCount`); keep the old
	// names as a fallback so a future rename can't silently zero the counts.
	criticalIssueCount?: number;
	recommendedIssueCount?: number;
	criticalCount?: number;
	recommendedCount?: number;
	[k: string]: unknown;
}

interface GapsResult {
	missing?: Array<{ type?: string; name?: string; reason?: string; [k: string]: unknown }>;
	entries?: Array<{ type?: string; name?: string; reason?: string; [k: string]: unknown }>;
	[k: string]: unknown;
}

interface DigestResult {
	hasContent?: boolean;
	markdown?: string;
	[k: string]: unknown;
}

interface FeatureIndexResult {
	id?: string;
	name?: string;
	surfaces?: Array<{
		stateCount?: number;
		actions?: Array<unknown>;
		stateDefinitions?: Array<unknown>;
		[k: string]: unknown;
	}>;
	entities?: Array<unknown>;
	events?: Array<unknown>;
	personas?: Array<unknown>;
	[k: string]: unknown;
}

/**
 * Lazy stdio MCP client. The subprocess is spawned on the first method call
 * and stays warm for the life of the SvelteKit process. Failures are caught
 * locally: the advisor flips `available` to false and methods return null /
 * empty so v3 keeps working when Unspaghettit isn't reachable.
 */
export class McpUnspaghettitAdvisor implements UnspaghettitAdvisorPort {
	#cfg: McpAdvisorConfig;
	/** The shared stdio connection. Owns the subprocess lifecycle; this class owns the meaning. */
	#engine: UnspaEngineClient;

	constructor(cfg: McpAdvisorConfig, engine?: UnspaEngineClient) {
		this.#cfg = cfg;
		this.#engine = engine ?? new UnspaEngineClient(cfg, 'unspa-advisor');
	}

	/** The connection, so a second adapter can share this one rather than spawning its own. */
	get engine(): UnspaEngineClient {
		return this.#engine;
	}

	get available(): boolean {
		return this.#engine.available;
	}

	/**
	 * The engine's own version, from the MCP handshake — so the components
	 * screen shows what is RUNNING (a local development build included), not
	 * what package.json asked for. Connecting is enough; no tool call is made.
	 */
	async engineVersion(): Promise<string | null> {
		return this.#engine.version();
	}

	/** Proof is an Enterprise capability: elsewhere no proof is asked and none is passed on. */
	get #proofs(): boolean {
		return this.#cfg.proofs === true;
	}

	async solverStatus(): Promise<SolverStatus | null> {
		if (!this.#proofs) return null;
		const parsed = (await this.#callJson('solver_status', {})) as Record<string, unknown> | null;
		if (!parsed) return null;
		const module = parsed.prover as { name?: unknown; version?: unknown } | undefined;
		const prover =
			module && typeof module.name === 'string'
				? { prover: { name: module.name, version: typeof module.version === 'string' && module.version ? module.version : null } }
				: {};
		if (parsed.kind === 'native') return { kind: 'native', version: str(parsed.version), ...prover };
		if (parsed.kind === 'wasm' || parsed.kind === 'none') return { kind: parsed.kind, reason: str(parsed.reason), ...prover };
		return null;
	}

	async scoreFeature(featureId: string, budget?: AdvisorCallBudget): Promise<FeatureScore | null> {
		const parsed = await this.#callJson('score_feature', { featureId }, budget);
		if (!parsed) return null;
		const r = parsed as ScoreResult;
		return {
			score: r.score ?? 0,
			maxScore: r.maxScore ?? 0,
			percentage: r.percentage ?? 0,
			criticalCount: r.criticalIssueCount ?? r.criticalCount ?? 0,
			recommendedCount: r.recommendedIssueCount ?? r.recommendedCount ?? 0
		};
	}

	async scoreFeatureDetailed(
		featureId: string,
		opts?: {
			includeIssues?: boolean;
			surfaceId?: string;
			area?: string;
			severity?: 'critical' | 'recommended';
		}
	): Promise<BehaviorMaturityReport | null> {
		const parsed = await this.#callJson('score_feature', {
			featureId,
			includeIssues: opts?.includeIssues !== false,
			...(opts?.surfaceId ? { surfaceId: opts.surfaceId } : {}),
			...(opts?.area ? { area: opts.area } : {}),
			...(opts?.severity ? { severity: opts.severity } : {})
		});
		return parsed && typeof parsed === 'object'
			? (parsed as BehaviorMaturityReport)
			: null;
	}

	async getOperationsReference(): Promise<string | null> {
		return this.#engine.readResourceText('unspa://operations');
	}

	async describeOperations(kind?: string): Promise<Readonly<Record<string, unknown>> | null> {
		const parsed = await this.#callJson('describe_operations', kind ? { kind } : {});
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Readonly<Record<string, unknown>>)
			: null;
	}

	async findFeatureGaps(featureId: string): Promise<FeatureGap[]> {
		try {
			const res = await this.#engine.callTool('get_implementation_gaps', { featureId });
			const text = extractText(res);
			if (!text) return [];
			const parsed = safeJson(text);
			if (parsed === null) {
				console.warn(
					`[unspa-advisor] findFeatureGaps non-JSON for ${featureId}: ${text.slice(0, 240)}`
				);
				return [];
			}
			const r = parsed as GapsResult;
			const rows = r.missing ?? r.entries ?? [];
			return rows.map((g) => ({
				type: typeof g.type === 'string' ? g.type : 'unknown',
				name: typeof g.name === 'string' ? g.name : '<unnamed>',
				reason: typeof g.reason === 'string' ? g.reason : ''
			}));
		} catch (e) {
			console.warn('[unspa-advisor] findFeatureGaps failed:', this.#msg(e));
			return [];
		}
	}

	/**
	 * Coverage comes from ONE place: the implementation-status sidecar, which every
	 * report and every index sync writes server-side, and which
	 * `get_implementation_status` reads too, so the two can never disagree.
	 *
	 * It used to ask `get_implementation_gaps` first. That tool cross-references an
	 * index, and the index lives in the caller's checkout, never here: the only one
	 * the engine could find on its own was the `.unspa.json` of a platform run from
	 * its checkout, another project's. A freshly synced feature then read "0
	 * implemented of 264" while the sidecar held 385 located entities.
	 */
	async getImplementationCoverage(featureId: string): Promise<ImplementationCoverage | null> {
		try {
			return await this.#coverageFromStatus(featureId);
		} catch (e) {
			console.warn('[unspa-advisor] getImplementationCoverage failed:', this.#msg(e));
			return null;
		}
	}

	/**
	 * Coverage tallied from the implementation-status sidecar: what the last
	 * report or index sync actually located, per action and per surface.
	 *
	 * Null when nothing was ever reported for this feature, which is the honest
	 * reading of a feature nobody has adopted, and the one the chip hides on.
	 */
	async #coverageFromStatus(featureId: string): Promise<ImplementationCoverage | null> {
		const parsed = await this.#callJson('get_implementation_status', { featureId });
		if (!parsed || typeof parsed !== 'object') return null;
		const r = parsed as { actions?: unknown; surfaces?: unknown };
		const rows = [...arrayOf(r.actions), ...arrayOf(r.surfaces)];
		if (rows.length === 0) return null;
		let total = 0;
		let implemented = 0;
		for (const row of rows) {
			const scope = (row ?? {}) as { expectedEntities?: unknown; foundEntities?: unknown };
			total += arrayOf(scope.expectedEntities).length;
			implemented += arrayOf(scope.foundEntities).length;
		}
		if (total === 0) return null;
		// Evidence a newer engine adds to this same answer. Each key is omitted when the
		// engine did not send its block, so an older engine reads exactly as before.
		const proven = parseProvenActions(parsed);
		const criteria = parseCriteriaEvidence(parsed);
		return {
			total,
			implemented,
			// The sidecar records what was located and what was not; nothing in it
			// says "half located", so partial stays 0 rather than being invented.
			partial: 0,
			missing: Math.max(0, total - implemented),
			// Located entities only: what is proven or verified below never feeds it.
			percentage: Math.round((implemented / total) * 100),
			...(proven ? { proven } : {}),
			...(criteria ? { criteria } : {})
		};
	}

	async getDigest(
		featureId: string,
		action?: { readonly surfaceId: string; readonly actionId: string }
	): Promise<FeatureDigest | null> {
		try {
			const res = await this.#engine.callTool('get_digest', {
				featureId,
				...(action ? { surfaceId: action.surfaceId, actionId: action.actionId } : {}),
				detailLevel: 'full',
				format: 'markdown'
			});
			const text = extractText(res);
			if (!text) return null;
			const parsed = safeJson(text);
			if (parsed === null) {
				console.warn(`[unspa-advisor] getDigest non-JSON for ${featureId}: ${text.slice(0, 240)}`);
				return null;
			}
			const d = parsed as DigestResult;
			return {
				hasContent: d.hasContent === true,
				markdown: dedupeAdjacentLines(typeof d.markdown === 'string' ? d.markdown : '')
			};
		} catch (e) {
			console.warn('[unspa-advisor] getDigest failed:', this.#msg(e));
			return null;
		}
	}

	async getBehaviorContext(featureId: string, rootKey: string): Promise<BehaviorContext | null> {
		const parsed = await this.#callJson('get_neighborhood', { featureId, rootKey, depth: 1 });
		if (!parsed || typeof parsed !== 'object') {
			// Engine reachable but the entity doesn't exist → a resolvable "not found",
			// distinct from `#callJson` returning null on an unreachable engine. We can't
			// tell those apart from #callJson alone, so treat null as unreachable and let
			// the route compute the ids purely; a present-but-empty response is `found:false`.
			return this.available
				? {
						featureId,
						rootKey,
						found: false,
						kind: rootKey.startsWith('action:') ? 'action' : rootKey.startsWith('surface:') ? 'surface' : 'unknown',
						surfaceId: null,
						surfaceName: null,
						actionId: null,
						name: null,
						depth: null
					}
				: null;
		}
		const r = parsed as Record<string, unknown>;
		const root = (r.root ?? {}) as Record<string, unknown>;
		const rootType = str(root.type);
		const rootId = str(root.id);
		const edges = asArray(r.edges) as Record<string, unknown>[];
		const isAction = rootType === 'action';
		const surfaceId = isAction ? str(root.surfaceId) || null : rootId || null;

		let statesWritten = 0,
			statesRead = 0,
			eventsEmitted = 0,
			transitions = 0,
			actions = 0;
		for (const e of edges) {
			const kind = str(e.kind);
			const from = str(e.from);
			const to = str(e.to);
			if (kind === 'writes' && from === `action:${rootId}`) statesWritten++;
			else if (kind === 'reads' && to === `action:${rootId}`) statesRead++;
			else if (kind === 'emits' && from === `action:${rootId}`) eventsEmitted++;
			else if (kind === 'transitions') transitions++;
			else if (kind === 'contains' && from === `surface:${rootId}`) actions++;
		}

		return {
			featureId,
			rootKey,
			found: rootId.length > 0,
			kind: isAction ? 'action' : rootType === 'surface' ? 'surface' : 'unknown',
			surfaceId,
			surfaceName: str(root.surfaceName) || str(root.name) || null,
			actionId: isAction ? rootId || null : null,
			name: str(root.name) || null,
			depth: { statesWritten, statesRead, eventsEmitted, transitions, actions }
		};
	}

	async applyBehaviorBatch(
		featureId: string,
		operations: readonly Record<string, unknown>[],
		opts?: {
			dryRun?: boolean;
			commit?: string;
			verbose?: boolean;
			expectedUpdatedAt?: string;
			mintedIds?: readonly string[];
		}
	): Promise<BehaviorBatchResult | null> {
		const commit = typeof opts?.commit === 'string' && opts.commit.length > 0 ? opts.commit : null;
		// The commit path replays a cached, already-validated batch; the engine ignores
		// dryRun there and reads the ops + feature from the token, so send neither.
		const dryRun = commit ? false : opts?.dryRun === true;
		const verbose = opts?.verbose === true;
		// The version the batch was written against rides along only when the caller
		// named one (on the commit path too: a token validated against a version should
		// not save over a newer one). An engine that predates the argument ignores it.
		const version =
			typeof opts?.expectedUpdatedAt === 'string' && opts.expectedUpdatedAt.length > 0
				? { expectedUpdatedAt: opts.expectedUpdatedAt }
				: {};
		try {
			const res = await this.#engine.callTool('apply_batch', commit
					? { commit, ...version }
					: {
							featureId,
							operations,
							dryRun,
							verbose,
							...version,
							...(opts?.mintedIds && opts.mintedIds.length > 0 ? { mintedIds: opts.mintedIds } : {})
						}
			);
			if (!res) return null; // transport failure has no known write outcome
			const text = extractText(res);
			const parsed = text ? safeJson(text) : null;
			// A rejected batch comes back as an isError tool result (the engine's own
			// "Batch failed: op[i] …" text), NOT a thrown error — surface it structured.
			// A version conflict is the exception: however the engine flags it, its JSON
			// carries the version to rebase on, which a flattened message would lose.
			if ((res as { isError?: boolean }).isError === true && !isConflictAnswer(parsed)) {
				await this.#recycleIfPoisoned(featureId, commit);
				return failedBatch(dryRun, text ?? 'Batch rejected.');
			}
			if (!parsed || typeof parsed !== 'object') {
				await this.#recycleIfPoisoned(featureId, commit);
				return failedBatch(dryRun, text ? text.slice(0, 400) : 'Empty engine response.');
			}
			const r = parsed as Record<string, unknown>;
			const maturity = (r.maturity ?? null) as { percentage?: unknown } | null;
			// A conflict wrote nothing, so it is never `ok`, whatever else the answer
			// says: `ok` is what callers key their after-write work on (the back sync).
			const conflict = isConflictAnswer(r);
			const ok = r.ok === true && !conflict;
			return {
				ok,
				dryRun: r.dryRun === true || dryRun,
				appliedCount: int(r.appliedCount),
				refs: isStringRecord(r.refs) ? r.refs : {},
				// Callers show `errors[0]` verbatim, so a conflict the engine left unworded
				// still says what happened and what to do, not a bare "Batch rejected.".
				errors: ok
					? []
					: collectBatchErrors(r, conflict ? CONFLICT_FALLBACK_MESSAGE : undefined),
				maturityPercentage:
					maturity && typeof maturity.percentage === 'number' ? maturity.percentage : null,
				commitToken: typeof r.commitToken === 'string' ? r.commitToken : null,
				raw: parsed
			};
		} catch (e) {
			// A THROW here is a transport/subprocess failure (engine died mid-call), not a
			// validation rejection — recycle so the next call respawns a clean engine, and
			// treat it as unreachable so the caller can retry later.
			console.warn('[unspa-advisor] applyBehaviorBatch failed:', this.#msg(e));
			this.#recycle();
			return null;
		}
	}

	/**
	 * A rejected batch MUST leave the engine's in-memory index untouched. A single
	 * op the engine mishandles (e.g. one it throws on internally, even under
	 * `dryRun`) can instead POISON the warm subprocess so every subsequent read —
	 * across all features — returns "not found" until the process is restarted.
	 * Detect exactly that: if the feature the failed batch targeted no longer
	 * resolves, recycle the subprocess so the next call rebuilds a clean index from
	 * the on-disk snapshots. An ordinary validation rejection leaves the feature
	 * resolvable, so this never trips on the common authoring-correction path.
	 */
	async #recycleIfPoisoned(featureId: string, commit: string | null): Promise<void> {
		if (commit || !featureId) return; // commit replays a cached batch; nothing to probe
		try {
			const res = await this.#engine.callTool('get_feature', { featureId });
			const text = res ? extractText(res) : null;
			const parsed = text ? safeJson(text) : null;
			// EXACT id match only: the store resolves ids globally, so a fuzzy match to
			// another project's feature (different id) counts as "not resolving" here.
			if (parsed && typeof parsed === 'object' && (parsed as { id?: unknown }).id === featureId) {
				return; // still resolves → engine healthy, batch rejection was clean
			}
		} catch {
			// probe threw → engine is unhealthy; fall through to recycle
		}
		this.#recycle();
	}

	/** Drop the warm subprocess so the next call transparently respawns a clean one. */
	#recycle(): void {
		this.#engine.recycle();
	}

	async getFeatureSummary(featureId: string): Promise<FeatureSummary | null> {
		try {
			const res = await this.#engine.callTool('get_feature', { featureId });
			const text = extractText(res);
			if (!text) return null;
			const parsed = safeJson(text);
			if (parsed === null) {
				console.warn(
					`[unspa-advisor] getFeatureSummary non-JSON for ${featureId}: ${text.slice(0, 240)}`
				);
				return null;
			}
			const f = parsed as FeatureIndexResult;
			// The Unspaghettit store resolves ids GLOBALLY (short-id expansion across
			// every project), so a missing id can fuzzy-match another project's
			// feature. Reject anything whose id isn't EXACTLY what we asked for.
			if (typeof f.id === 'string' && f.id !== featureId) return null;
			const surfaces = Array.isArray(f.surfaces) ? f.surfaces : [];
			let actionCount = 0;
			let stateCount = 0;
			for (const s of surfaces) {
				const actions = Array.isArray((s as { actions?: unknown }).actions)
					? ((s as { actions: unknown[] }).actions.length as number)
					: 0;
				const states = Array.isArray((s as { stateDefinitions?: unknown }).stateDefinitions)
					? ((s as { stateDefinitions: unknown[] }).stateDefinitions.length as number)
					: 0;
				actionCount += actions;
				stateCount += states;
			}
			return {
				id: typeof f.id === 'string' ? f.id : featureId,
				name: typeof f.name === 'string' ? f.name : '<unnamed>',
				surfaceCount: surfaces.length,
				actionCount,
				stateCount,
				entityCount: Array.isArray(f.entities) ? f.entities.length : 0,
				eventCount: Array.isArray(f.events) ? f.events.length : 0,
				personaCount: Array.isArray(f.personas) ? f.personas.length : 0
			};
		} catch (e) {
			console.warn('[unspa-advisor] getFeatureSummary failed:', this.#msg(e));
			return null;
		}
	}

	async getFeatureBehavior(featureId: string): Promise<FeatureBehavior | null> {
		try {
			const res = await this.#engine.callTool('get_feature', { featureId, verbose: true });
			const text = extractText(res);
			if (!text) return null;
			const parsed = safeJson(text);
			if (parsed === null) return null;
			const f = parsed as {
				id?: unknown;
				surfaces?: Array<{ name?: unknown; actions?: Array<{ name?: unknown }> }>;
				scenarios?: Array<{ name?: unknown }>;
				events?: Array<{ name?: unknown }>;
				personas?: Array<{ name?: unknown }>;
			};
			// Reject a global fuzzy match to another project's feature (see scoreFeature).
			if (typeof f.id === 'string' && f.id !== featureId) return null;
			const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
			const surfacesArr = Array.isArray(f.surfaces) ? f.surfaces : [];
			const surfaces = surfacesArr.map((s) => str(s?.name)).filter(Boolean);
			const actions: string[] = [];
			for (const s of surfacesArr) {
				const acts = Array.isArray(s?.actions) ? s.actions : [];
				for (const a of acts) {
					const n = str(a?.name);
					if (n) actions.push(n);
				}
			}
			const scenarios = (Array.isArray(f.scenarios) ? f.scenarios : [])
				.map((x) => str(x?.name))
				.filter(Boolean);
			const events = (Array.isArray(f.events) ? f.events : [])
				.map((x) => str(x?.name))
				.filter(Boolean);
			const personas = (Array.isArray(f.personas) ? f.personas : [])
				.map((x) => str(x?.name))
				.filter(Boolean);
			return { surfaces, actions, scenarios, events, personas };
		} catch (e) {
			console.warn('[unspa-advisor] getFeatureBehavior failed:', this.#msg(e));
			return null;
		}
	}

	async saveFeatureShell(snapshot: UnspaFeatureSnapshot): Promise<boolean> {
		try {
			const res = await this.#engine.callTool('save_feature', { feature: snapshot.feature });
			if (!res) return false;
			if ((res as { isError?: boolean }).isError === true) return false;
			const text = extractText(res);
			if (text && /validation failed|error/i.test(text)) {
				const parsed = safeJson(text) as { ok?: boolean } | null;
				if (parsed?.ok !== true) {
					console.warn(`[unspa-advisor] save_feature rejected: ${text.slice(0, 240)}`);
					return false;
				}
			}
			return true;
		} catch (e) {
			console.warn('[unspa-advisor] saveFeatureShell failed:', this.#msg(e));
			return false;
		}
	}

	async replaceProject(
		snapshot: UnspaProjectSnapshot
	): Promise<'replaced' | 'not-found' | 'unavailable'> {
		try {
			const res = await this.#engine.callTool('replace_project', { project: snapshot.project });
			if (!res) return 'unavailable';
			const text = extractText(res);
			if (text && /not found/i.test(text)) return 'not-found';
			if ((res as { isError?: boolean }).isError === true) return 'unavailable';
			if (!text) return 'replaced';
			const parsed = safeJson(text) as { ok?: boolean } | null;
			if (parsed?.ok === true) return 'replaced';
			console.warn(`[unspa-advisor] replace_project rejected: ${text.slice(0, 240)}`);
			return 'unavailable';
		} catch (e) {
			console.warn('[unspa-advisor] replaceProject failed:', this.#msg(e));
			return 'unavailable';
		}
	}

	// ───────── Verification & simulation ─────────

	async runScenarios(
		featureId: string,
		scope?: { surfaceId?: string; actionId?: string },
		budget?: AdvisorCallBudget
	): Promise<ScenarioReport | null> {
		const parsed = await this.#callJson(
			'run_all_scenarios',
			{
				featureId,
				...(scope?.surfaceId ? { surfaceId: scope.surfaceId } : {}),
				...(scope?.actionId ? { actionId: scope.actionId } : {})
			},
			budget
		);
		if (!parsed) return null;
		const r = parsed as {
			featureId?: unknown;
			featureName?: unknown;
			total?: unknown;
			passed?: unknown;
			failed?: unknown;
			results?: unknown;
		};
		// The store resolves ids globally; reject a fuzzy match to another feature.
		if (typeof r.featureId === 'string' && r.featureId !== featureId) return null;
		const results = Array.isArray(r.results) ? r.results.map(mapScenarioResult) : [];
		return {
			featureId: typeof r.featureId === 'string' ? r.featureId : featureId,
			featureName: str(r.featureName) || featureId,
			total: int(r.total),
			passed: int(r.passed),
			failed: int(r.failed),
			results
		};
	}

	async modelCheck(
		featureId: string,
		opts?: { maxDepth?: number; maxStates?: number } & AdvisorCallBudget
	): Promise<ModelCheckReport | null> {
		const parsed = await this.#callJson(
			'model_check',
			{
				featureId,
				...(opts?.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
				...(opts?.maxStates !== undefined ? { maxStates: opts.maxStates } : {})
			},
			opts
		);
		if (!parsed) return null;
		const r = parsed as Record<string, unknown>;
		const violations = Array.isArray(r.invariantViolations) ? r.invariantViolations : [];
		const dead = Array.isArray(r.deadActions) ? r.deadActions : [];
		const reach = (r.reachability ?? {}) as Record<string, unknown>;
		return {
			statesExplored: int(r.statesExplored),
			truncated: r.truncated === true,
			invariantViolations: violations.map((v) => {
				const o = (v ?? {}) as Record<string, unknown>;
				return {
					invariantName: str(o.invariantName) || '<invariant>',
					actionName: str(o.actionName),
					path: Array.isArray(o.path) ? o.path.map((p) => str(p)).filter(Boolean) : []
				};
			}),
			deadActions: dead
				.map((d) => {
					const o = (d ?? {}) as Record<string, unknown>;
					return str(o.actionName) || str(d);
				})
				.filter(Boolean),
			// Only an engine that tells "not reached" from "dead" sends the list, and
			// its absence must stay visible: a reader then knows `deadActions` still
			// has to be read next to `truncated`.
			...(Array.isArray(r.unreachedActions)
				? { unreachedActions: mapUnreachedActions(r.unreachedActions) }
				: {}),
			// Same rows, other meaning: never run at all, so never dead.
			...(Array.isArray(r.skippedActions)
				? { skippedActions: mapUnreachedActions(r.skippedActions) }
				: {}),
			deadlockStates: int(r.deadlockStates),
			unreachableSurfaces: mapNamedSurfaces(reach.unreachableSurfaces),
			terminalSurfaces: mapNamedSurfaces(reach.terminalSurfaces)
		};
	}

	async applyProjectBatch(
		projectId: string,
		operations: readonly Record<string, unknown>[],
		dryRun: boolean
	): Promise<EngineAnswer | null> {
		return this.#answer('apply_project_batch', { projectId, operations, dryRun }, { timeoutMs: 60_000 });
	}

	async readProjectBehavior(projectId: string): Promise<ProjectBehavior | null> {
		const [project, states, library] = await Promise.all([
			this.#answer('get_project', { projectId }),
			this.#answer('list_state_variables', { projectId }),
			this.#answer('list_project_library', { projectId })
		]);
		if (!project || project.kind === 'refused') return null;
		const p = project.value as Record<string, unknown>;
		const list = (v: unknown) =>
			Array.isArray(v) ? (v as Readonly<Record<string, unknown>>[]) : [];
		return {
			projectInvariants: list(p.projectInvariants),
			coreFeatures: list(p.coreFeatures),
			stateVariables: states?.kind === 'answer' ? states.value : {},
			library: library?.kind === 'answer' ? library.value : {},
			registeredStateIds: list(p.stateVariables).map((state) => String(state.id))
		};
	}

	async findStateReferences(featureId: string, statePath: string): Promise<EngineAnswer | null> {
		return this.#answer('find_state_references', { featureId, statePath });
	}

	async generateTypesSource(featureId: string): Promise<EngineAnswer | null> {
		return this.#answer('generate_types', { featureId });
	}

	async promoteToProjectLibrary(input: {
		expectedProjectId: string;
		featureId: string;
		definitionKind: 'entity' | 'resource' | 'persona';
		id: string;
		dedupe?: boolean;
	}): Promise<EngineAnswer | null> {
		return this.#answer('promote_to_project_library', {
			expectedProjectId: input.expectedProjectId,
			featureId: input.featureId,
			kind: input.definitionKind,
			id: input.id,
			...(input.dedupe === false ? { dedupe: false } : {})
		});
	}

	/** An engine tool's answer as it came, its refusal kept as a sentence; null when unreachable. */
	async #answer(
		name: string,
		args: Record<string, unknown>,
		budget?: AdvisorCallBudget
	): Promise<EngineAnswer | null> {
		const answer = await this.#engine.callJsonOrError(
			name,
			args,
			budget ? { timeoutMs: budget.timeoutMs } : undefined
		);
		if (!answer) return null;
		if (!answer.ok) return { kind: 'refused', error: answer.error };
		return answer.value && typeof answer.value === 'object'
			? { kind: 'answer', value: answer.value as Readonly<Record<string, unknown>> }
			: { kind: 'refused', error: `${name} answered nothing readable` };
	}

	/**
	 * A whole project's rules take the proofs of every feature that writes what
	 * they read: minutes on a large project, hence a budget of its own.
	 */
	async proveProjectRules(
		args: ProveProjectRulesArgs,
		budget?: AdvisorCallBudget
	): Promise<EngineAnswer | null> {
		if (!this.#proofs) return null;
		return this.#answer(
			'prove_project_invariants',
			{
				projectId: args.projectId,
				...(args.invariantIds && args.invariantIds.length > 0 ? { invariantIds: args.invariantIds } : {}),
				...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
				...(args.language ? { language: args.language } : {}),
				...(args.quick ? { quick: true } : {})
			},
			{ timeoutMs: budget?.timeoutMs ?? PROJECT_PROOF_TIMEOUT_MS }
		);
	}

	async whatIfProject(args: WhatIfProjectArgs, budget?: AdvisorCallBudget): Promise<EngineAnswer | null> {
		if (!this.#proofs) return null;
		return this.#answer(
			'what_if_project',
			{
				projectId: args.projectId,
				operations: args.operations,
				...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
				...(args.language ? { language: args.language } : {})
			},
			{ timeoutMs: budget?.timeoutMs ?? PROJECT_PROOF_TIMEOUT_MS }
		);
	}

	async whatIf(args: WhatIfArgs, budget?: AdvisorCallBudget): Promise<WhatIfResult | null> {
		if (!this.#proofs) return null;
		const answer = await this.#engine.callJsonOrError(
			'what_if',
			{
				featureId: args.featureId,
				operations: args.operations,
				...(args.mintedIds && args.mintedIds.length > 0 ? { mintedIds: args.mintedIds } : {}),
				...(args.blank ? { blank: true } : {}),
				...(args.projectId ? { projectId: args.projectId } : {}),
				...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {})
			},
			budget ? { timeoutMs: budget.timeoutMs } : undefined
		);
		if (!answer) return null;
		if (!answer.ok) return { kind: 'refused', error: answer.error };
		const value = answer.value as Record<string, unknown> | null;
		if (!value || typeof value !== 'object') return { kind: 'refused', error: 'what_if answered nothing readable' };
		// A change that does not validate answers its errors, not a comparison.
		if (value.ok === false) {
			const errors = Array.isArray(value.errors) ? value.errors.map(String) : [];
			return { kind: 'refused', error: errors.join('; ') || 'the change does not validate' };
		}
		return { kind: 'comparison', comparison: value };
	}

	async simulateSteps(
		args: SimulateStepsArgs,
		budget?: AdvisorCallBudget
	): Promise<SimulateStepsResult | null> {
		const answer = await this.#engine.callJsonOrError(
			'simulate_steps',
			{
				...(args.featureId ? { featureId: args.featureId } : {}),
				...(args.blank ? { blank: true } : {}),
				...(args.operations && args.operations.length > 0 ? { operations: args.operations } : {}),
				...(args.mintedIds && args.mintedIds.length > 0 ? { mintedIds: args.mintedIds } : {}),
				...(args.newOperationsFrom !== undefined ? { newOperationsFrom: args.newOperationsFrom } : {}),
				...(args.steps && args.steps.length > 0 ? { steps: args.steps } : {}),
				...(args.snapshot ? { snapshot: args.snapshot } : {}),
				...(args.personaId ? { personaId: args.personaId } : {}),
				...(args.stopOnBlocked ? { stopOnBlocked: true } : {}),
				...(args.runScenarios ? { runScenarios: true } : {}),
				...(args.modelCheck ? { modelCheck: args.modelCheck } : {}),
				...(args.includeFeature ? { includeFeature: true } : {}),
				...(args.projectId ? { projectId: args.projectId } : {}),
				...(args.disable && args.disable.length > 0 ? { disable: [...args.disable] } : {})
			},
			budget ? { timeoutMs: budget.timeoutMs } : undefined
		);
		if (!answer) return null;
		if (!answer.ok) return { kind: 'refused', error: answer.error };
		const walk = answer.value;
		return walk && typeof walk === 'object'
			? { kind: 'walk', walk: walk as Readonly<Record<string, unknown>> }
			: { kind: 'refused', error: 'simulate_steps answered nothing readable' };
	}

	async verify(
		featureId?: string,
		opts?: { modelCheck?: boolean; minMaturity?: number } & AdvisorCallBudget
	): Promise<VerificationVerdict | null> {
		const parsed = await this.#callJson(
			'verify',
			{
				...(featureId ? { featureId } : {}),
				...(opts?.modelCheck ? { modelCheck: true } : {}),
				...(opts?.minMaturity !== undefined ? { minMaturity: opts.minMaturity } : {})
			},
			opts
		);
		if (!parsed) return null;
		const r = parsed as Record<string, unknown>;
		const summary = (r.summary ?? {}) as Record<string, unknown>;
		const features = asArray(r.features).map((f) => {
			const o = (f ?? {}) as Record<string, unknown>;
			const invariants = asArray(o.checks)
				.map((c) => (c ?? {}) as Record<string, unknown>)
				.find((c) => c.id === 'invariants');
			return {
				featureId: str(o.featureId),
				featureName: str(o.featureName),
				passed: o.passed === true,
				...(invariants && Array.isArray(invariants.traces)
					? { brokenStatements: mapBrokenStatements(invariants.traces) }
					: invariants?.status === 'pass'
						? { brokenStatements: [] }
						: {})
			};
		});
		return {
			passed: r.passed === true,
			featuresChecked: int(summary.featuresChecked),
			featuresPassed: int(summary.featuresPassed),
			featuresFailed: int(summary.featuresFailed),
			scenariosRun: int(summary.scenariosRun),
			scenariosFailed: int(summary.scenariosFailed),
			invariantViolations: int(summary.invariantViolations),
			features,
			...(this.#proofs && summary.proof && typeof summary.proof === 'object' ? { solverCounted: true } : {})
		};
	}

	async proveFeatureRules(
		featureId: string,
		budget?: AdvisorCallBudget,
		language: SpecLanguage = 'en'
	): Promise<SpecProof | null> {
		if (!this.#proofs) return null;
		const args = language === 'en' ? { featureId } : { featureId, language };
		const parsed = await this.#callJson('prove_feature_rules', args, {
			timeoutMs: budget?.timeoutMs ?? RULES_PROOF_TIMEOUT_MS
		});
		return parsed ? mapSpecProof(parsed) : null;
	}

	async getSpecGaps(featureId: string, budget?: AdvisorCallBudget): Promise<SpecGap[]> {
		return (await this.getSpecGapsAndProof(featureId, budget)).gaps;
	}

	async getSpecGapsAndProof(
		featureId: string,
		budget?: AdvisorCallBudget,
		language: SpecLanguage = 'en',
		options?: { readonly complete?: boolean }
	): Promise<{ gaps: SpecGap[]; proof: SpecProof | null }> {
		// English is the engine's default: only another language is asked for.
		const args = {
			featureId,
			...(language === 'en' ? {} : { language }),
			...(options?.complete ? { complete: true } : {})
		};
		const parsed = await this.#callJson('get_spec_gaps', args, budget);
		if (!parsed) return { gaps: [], proof: null };
		const r = parsed as Record<string, unknown>;
		return { gaps: mapSpecGaps(r.gaps), proof: this.#proofs ? mapSpecProof(r.proof) : null };
	}

	async getDrift(featureId?: string): Promise<DriftReport | null> {
		const parsed = await this.#callJson('get_drift', featureId ? { featureId } : {});
		if (!parsed) return null;
		const r = parsed as Record<string, unknown>;
		return {
			stale: asArray(r.stale).length,
			unversioned: asArray(r.unversioned).length,
			orphans: asArray(r.orphans).length
		};
	}

	// ───────── Codegen & implementation queue ─────────

	async generateTypes(featureId: string, outputPath: string): Promise<string | null> {
		const parsed = await this.#callJson('generate_types', { featureId, outputPath });
		if (!parsed) return null;
		const r = parsed as Record<string, unknown>;
		if (r.ok !== true) return null;
		return str(r.outputPath) || outputPath;
	}

	async getNextQueued(projectId?: string): Promise<QueueItemView | null> {
		const parsed = await this.#callJson('get_next_queued', projectId ? { projectId } : {});
		if (!parsed) return null;
		const next = (parsed as Record<string, unknown>).next;
		return next ? mapQueueItem(next) : null;
	}

	async listQueue(projectId?: string): Promise<QueueItemView[]> {
		const parsed = await this.#callJson('list_queue', projectId ? { projectId } : {});
		if (!parsed) return [];
		return asArray((parsed as Record<string, unknown>).queue).map(mapQueueItem);
	}

	async enqueue(
		projectId: string,
		item: { kind: QueueKind; featureId: string; surfaceId?: string; actionId?: string; note?: string }
	): Promise<boolean> {
		const parsed = await this.#callJson('enqueue', {
			projectId,
			kind: item.kind,
			featureId: item.featureId,
			...(item.surfaceId ? { surfaceId: item.surfaceId } : {}),
			...(item.actionId ? { actionId: item.actionId } : {}),
			...(item.note ? { note: item.note } : {})
		});
		return (parsed as Record<string, unknown> | null)?.ok === true;
	}

	async syncFromIndex(): Promise<boolean> {
		const parsed = await this.#callJson('sync_from_index', {});
		return (parsed as Record<string, unknown> | null)?.ok === true;
	}

	/** @see UnspaEngineClient.callJson — kept as a private alias so call sites read unchanged. */
	async #callJson(
		name: string,
		args: Record<string, unknown>,
		budget?: AdvisorCallBudget
	): Promise<unknown | null> {
		return this.#engine.callJson(name, args, budget ? { timeoutMs: budget.timeoutMs } : undefined);
	}

	#msg(e: unknown): string {
		return msg(e);
	}
}

/**
 * Collapse consecutive identical lines in the engine's digest markdown. The
 * engine's "Where you can go" section emits one line per transition without
 * naming the target surface (and includes intra-surface action sequences), so N
 * navigations from a surface render as N identical "<surface> to another surface"
 * bullets. Identical adjacent lines carry no distinguishing information, so
 * folding them to one is loss-free presentation cleanup; the day the engine names
 * distinct targets, the lines differ and none are folded. Blank lines are kept.
 */
function dedupeAdjacentLines(markdown: string): string {
	const out: string[] = [];
	let prev: string | null = null;
	for (const line of markdown.split('\n')) {
		const key = line.trim();
		if (key !== '' && key === prev) continue;
		out.push(line);
		prev = key;
	}
	return out.join('\n');
}

/** Shown when the engine reports a version conflict without wording it itself. */
const CONFLICT_FALLBACK_MESSAGE =
	'The feature changed since the version this batch was written against. Nothing was written: ' +
	're-read the feature, rebase the batch on `currentUpdatedAt`, and send it again.';

/** Is this parsed apply_batch answer the engine's structured version conflict? */
function isConflictAnswer(parsed: unknown): boolean {
	return (
		parsed !== null &&
		typeof parsed === 'object' &&
		!Array.isArray(parsed) &&
		(parsed as { conflict?: unknown }).conflict === true
	);
}

/** A rejected/failed apply_batch result (engine reachable, batch not applied). */
function failedBatch(dryRun: boolean, message: string): BehaviorBatchResult {
	return {
		ok: false,
		dryRun,
		appliedCount: 0,
		refs: {},
		errors: [message],
		maturityPercentage: null,
		commitToken: null,
		raw: message
	};
}

/** Pull whatever error text an apply_batch failure carries (shape varies by op). */
function collectBatchErrors(r: Record<string, unknown>, fallback = 'Batch rejected.'): string[] {
	const out: string[] = [];
	const validation = r.validation as { errors?: unknown; issues?: unknown } | undefined;
	for (const src of [validation?.errors, validation?.issues, r.errors]) {
		for (const e of asArray(src)) {
			if (typeof e === 'string') out.push(e);
			else if (e && typeof e === 'object') {
				const m = (e as { message?: unknown }).message;
				if (typeof m === 'string') out.push(m);
			}
		}
	}
	return out.length ? out : [fallback];
}

function isStringRecord(v: unknown): v is Record<string, string> {
	return (
		typeof v === 'object' &&
		v !== null &&
		!Array.isArray(v) &&
		Object.values(v).every((x) => typeof x === 'string')
	);
}

/* ── coercion + mapping helpers for the value-add reads ─────────────────── */

function str(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}
function int(v: unknown): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function asArray(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}

function mapScenarioResult(raw: unknown): ScenarioResult {
	const o = (raw ?? {}) as Record<string, unknown>;
	const expected = o.expectedStatus;
	const assertions = asArray(o.assertions).map((a) => {
		const x = (a ?? {}) as Record<string, unknown>;
		return {
			path: str(x.path),
			held: typeof x.held === 'boolean' ? x.held : null,
			skipped: x.skipped === true,
			description: typeof x.description === 'string' ? x.description : null
		};
	});
	return {
		scenarioId: str(o.scenarioId),
		scenarioName: str(o.scenarioName) || '<scenario>',
		actionName: str(o.actionName),
		personaName: typeof o.personaName === 'string' ? o.personaName : null,
		pass: o.pass === true,
		actualStatus: o.actualStatus === 'blocked' ? 'blocked' : 'success',
		expectedStatus: expected === 'success' || expected === 'blocked' ? expected : null,
		summary: str(o.summary),
		assertions
	};
}

/** The `traces` of verify's invariants check: one row per statement and breaking action. */
function mapBrokenStatements(traces: unknown[]): { name: string; path: string[] }[] {
	return traces
		.map((t) => {
			const o = (t ?? {}) as Record<string, unknown>;
			return {
				name: str(o.label),
				path: Array.isArray(o.path) ? o.path.map((p) => str(p)).filter(Boolean) : []
			};
		})
		.filter((t) => t.name.length > 0);
}

/** Rows the engine could not name are dropped: an anonymous "not reached" helps nobody. */
function mapSpecGaps(v: unknown): SpecGap[] {
	return asArray(v).map((g) => {
		const o = (g ?? {}) as Record<string, unknown>;
		return {
			severity: o.severity === 'critical' ? 'critical' : 'recommended',
			entityType:
				o.entityType === 'feature' || o.entityType === 'surface' || o.entityType === 'criterion'
					? o.entityType
					: 'action',
			entityId: str(o.entityId),
			entityName: str(o.entityName) || '<unnamed>',
			reason: str(o.reason),
			suggestedFix: str(o.suggestedFix),
			// An older engine sends no code: the platform then reads the English text.
			code: str(o.code),
			...(str(o.subjectId) ? { subjectId: str(o.subjectId) } : {})
		};
	});
}

const REACH_OUTCOMES: readonly SpecProofReach['outcome'][] = [
	'reached',
	'none-within-bound',
	'unsettled',
	'unsupported'
];

const PATH_OUTCOMES: readonly SpecProofPath['outcome'][] = [
	'violated',
	'none-within-bound',
	'unsettled',
	'unsupported'
];

/**
 * The solver's answer as the engine sent it, or null when it sent none (an
 * older engine). A missing proof stays null: an empty one would read as clean.
 */
function mapSpecProof(v: unknown): SpecProof | null {
	if (!v || typeof v !== 'object') return null;
	const o = v as Record<string, unknown>;
	const paths = (o.paths ?? null) as Record<string, unknown> | null;
	const actions = (o.actions ?? null) as Record<string, unknown> | null;
	const goals = (o.goals ?? null) as Record<string, unknown> | null;
	return {
		solver: o.solver === 'ran' ? 'ran' : 'unavailable',
		questions: int(o.questions),
		unsettled: int(o.unsettled),
		...(str(o.reason) ? { reason: str(o.reason) } : {}),
		...(str(o.interrupted) ? { interrupted: str(o.interrupted) } : {}),
		...(typeof o.moreToCome === 'boolean' ? { moreToCome: o.moreToCome } : {}),
		...(Array.isArray(o.rulesSettled) ? { rulesSettled: o.rulesSettled.map(String) } : {}),
		...(paths
			? {
					paths: {
						maxSteps: int(paths.maxSteps),
						results: asArray(paths.results).flatMap((row) => {
							const p = (row ?? {}) as Record<string, unknown>;
							const outcome = PATH_OUTCOMES.find((known) => known === p.outcome);
							if (!outcome) return [];
							return [
								{
									invariantId: str(p.invariantId),
									invariantName: str(p.invariantName) || str(p.invariantId),
									outcome,
									...(typeof p.steps === 'number' ? { steps: p.steps } : {}),
									...(str(p.reason) ? { reason: str(p.reason) } : {})
								}
							];
						})
					}
				}
			: {}),
		...(actions
			? {
					actions: {
						maxSteps: int(actions.maxSteps),
						results: asArray(actions.results).flatMap((row) => {
							const a = (row ?? {}) as Record<string, unknown>;
							const outcome = REACH_OUTCOMES.find((known) => known === a.outcome);
							if (!outcome) return [];
							return [
								{
									actionId: str(a.actionId),
									actionName: str(a.actionName) || str(a.actionId),
									outcome,
									...(typeof a.steps === 'number' ? { steps: a.steps } : {}),
									...(str(a.reason) ? { reason: str(a.reason) } : {})
								}
							];
						})
					}
				}
			: {}),
		...(goals
			? {
					goals: {
						maxSteps: int(goals.maxSteps),
						results: asArray(goals.results).flatMap((row) => {
							const g = (row ?? {}) as Record<string, unknown>;
							const outcome = REACH_OUTCOMES.find((known) => known === g.outcome);
							if (!outcome) return [];
							return [
								{
									goalId: str(g.goalId),
									goalName: str(g.goalName) || str(g.goalId),
									outcome,
									...(typeof g.steps === 'number' ? { steps: g.steps } : {}),
									...(str(g.reason) ? { reason: str(g.reason) } : {})
								}
							];
						})
					}
				}
			: {}),
		...mapDeadlocks(o.deadlocks),
		...mapFindings(o.findings),
		leads: asArray(o.leads).map((row) => {
			const l = (row ?? {}) as Record<string, unknown>;
			return {
				actionId: str(l.actionId),
				actionName: str(l.actionName),
				invariantId: str(l.invariantId),
				invariantName: str(l.invariantName),
				situation: str(l.situation),
				pathSearch: str(l.pathSearch)
			};
		})
	};
}

const DEADLOCK_OUTCOMES = ['found', 'none-within-bound', 'unsettled', 'unsupported'] as const;

function mapFindings(v: unknown): { findings?: SpecProofFinding[] } {
	if (!Array.isArray(v)) return {};
	const optional = (o: Record<string, unknown>, key: string) => (str(o[key]) ? { [key]: str(o[key]) } : {});
	return {
		findings: v.flatMap((row) => {
			const o = (row ?? {}) as Record<string, unknown>;
			if (!str(o.kind)) return [];
			const path = Array.isArray(o.path)
				? o.path.map((step) => {
						const s = (step ?? {}) as Record<string, unknown>;
						return {
							actionId: str(s.actionId),
							actionName: str(s.actionName),
							surfaceId: str(s.surfaceId),
							...(str(s.featureName) ? { featureName: str(s.featureName) } : {}),
							parameters: (s.parameters && typeof s.parameters === 'object' ? s.parameters : {}) as Record<string, unknown>
						};
					})
				: undefined;
			return [
				{
					kind: str(o.kind),
					severity: o.severity === 'critical' ? ('critical' as const) : ('recommended' as const),
					detail: str(o.detail),
					...optional(o, 'surfaceName'),
					...optional(o, 'actionId'),
					...optional(o, 'actionName'),
					...optional(o, 'ruleId'),
					...optional(o, 'invariantId'),
					...optional(o, 'invariantName'),
					...optional(o, 'goalId'),
					...optional(o, 'goalName'),
					...(path ? { path } : {}),
					...mapStuck(o.stuck)
				}
			];
		})
	};
}

/** The states that hold a target back, as the engine names them (criterion 39ea86c2). */
function mapStuck(v: unknown): { stuck?: SpecProofStuckState[] } {
	if (!Array.isArray(v)) return {};
	const stuck = v.flatMap((row) => {
		const s = (row ?? {}) as Record<string, unknown>;
		if (!str(s.path)) return [];
		const changedBy = Array.isArray(s.changedBy) ? s.changedBy.filter((name): name is string => typeof name === 'string') : [];
		return [{ path: str(s.path), startsAt: s.startsAt ?? null, changedBy }];
	});
	return stuck.length > 0 ? { stuck } : {};
}

function mapDeadlocks(v: unknown): { deadlocks?: SpecProofDeadlocks } {
	if (!v || typeof v !== 'object') return {};
	const o = v as Record<string, unknown>;
	const outcome = DEADLOCK_OUTCOMES.find((known) => known === o.outcome);
	if (!outcome) return {};
	const path = asArray(o.path).map((step) => str(((step ?? {}) as Record<string, unknown>).actionName));
	return {
		deadlocks: {
			maxSteps: int(o.maxSteps),
			outcome,
			...(typeof o.steps === 'number' ? { steps: o.steps } : {}),
			...(path.length > 0 ? { path } : {}),
			...(str(o.reason) ? { reason: str(o.reason) } : {})
		}
	};
}

function mapUnreachedActions(rows: readonly unknown[]): UnreachedAction[] {
	return rows.flatMap((row) => {
		const o = (row ?? {}) as Record<string, unknown>;
		const actionId = str(o.actionId);
		const actionName = str(o.actionName) || actionId;
		if (!actionName) return [];
		return [{ surfaceId: str(o.surfaceId), actionId, actionName, reason: str(o.reason) }];
	});
}

function mapNamedSurfaces(v: unknown): { surfaceId: string; surfaceName: string }[] {
	return asArray(v).map((s) => {
		const o = (s ?? {}) as Record<string, unknown>;
		return { surfaceId: str(o.surfaceId), surfaceName: str(o.surfaceName) || str(o.surfaceId) };
	});
}

function mapQueueItem(raw: unknown): QueueItemView {
	const o = (raw ?? {}) as Record<string, unknown>;
	const kind: QueueKind = o.kind === 'feature' || o.kind === 'surface' ? o.kind : 'action';
	const label = str(o.actionName) || str(o.surfaceName) || str(o.featureName) || str(o.id);
	return {
		id: str(o.id),
		kind,
		featureId: str(o.featureId),
		featureName: str(o.featureName),
		label,
		goal: typeof o.goal === 'string' ? o.goal : null
	};
}

/** The array at a loosely-typed field, or none. */
function arrayOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
