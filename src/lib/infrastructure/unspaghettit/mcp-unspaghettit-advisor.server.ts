import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
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
	SimulateArgs,
	SimulationResult,
	SpecGap,
	UnspaghettitAdvisorPort,
	VerificationVerdict
} from '$application/ports';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import {
	extractText,
	msg,
	safeJson,
	UnspaEngineClient,
	type UnspaEngineConfig
} from './unspa-engine-client.server';

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
	stats?: { total?: number; implemented?: number; partial?: number; missing?: number; [k: string]: unknown };
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
		const client = await this.#getClient();
		if (!client) return null;
		try {
			const resource = await client.readResource({ uri: 'unspa://operations' });
			const text = resource.contents.find(
				(content): content is Extract<(typeof resource.contents)[number], { text: string }> =>
					'text' in content
			)?.text;
			return typeof text === 'string' ? text : null;
		} catch (e) {
			console.warn('[unspa-advisor] getOperationsReference failed:', this.#msg(e));
			return null;
		}
	}

	async describeOperations(kind?: string): Promise<Readonly<Record<string, unknown>> | null> {
		const parsed = await this.#callJson('describe_operations', kind ? { kind } : {});
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Readonly<Record<string, unknown>>)
			: null;
	}

	async findFeatureGaps(featureId: string): Promise<FeatureGap[]> {
		const client = await this.#getClient();
		if (!client) return [];
		try {
			const res = await client.callTool({
				name: 'get_implementation_gaps',
				arguments: { featureId }
			});
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

	async getImplementationCoverage(featureId: string): Promise<ImplementationCoverage | null> {
		const client = await this.#getClient();
		if (!client) return null;
		try {
			const res = await client.callTool({
				name: 'get_implementation_gaps',
				arguments: { featureId }
			});
			const text = extractText(res);
			const parsed = text ? safeJson(text) : null;
			if (text && parsed === null) {
				console.warn(
					`[unspa-advisor] getImplementationCoverage non-JSON for ${featureId}: ${text.slice(0, 240)}`
				);
			}
			const s = (parsed as GapsResult | null)?.stats ?? {};
			const total = typeof s.total === 'number' ? s.total : 0;
			// `get_implementation_gaps` cross-references the index, and the index
			// lives in the caller's checkout, which an appliance does not have: with
			// nothing to cross-reference the engine answers no stats, and coverage
			// read as absent however much had been reported. The status sidecar is
			// written server-side by every report and sync, so it can answer here.
			if (total === 0) return this.#coverageFromStatus(featureId);
			const implemented = typeof s.implemented === 'number' ? s.implemented : 0;
			const partial = typeof s.partial === 'number' ? s.partial : 0;
			const missing =
				typeof s.missing === 'number' ? s.missing : Math.max(0, total - implemented - partial);
			const percentage = Math.round((implemented / total) * 100);
			return { total, implemented, partial, missing, percentage };
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
		return {
			total,
			implemented,
			// The sidecar records what was located and what was not; nothing in it
			// says "half located", so partial stays 0 rather than being invented.
			partial: 0,
			missing: Math.max(0, total - implemented),
			percentage: Math.round((implemented / total) * 100)
		};
	}

	async getDigest(featureId: string): Promise<FeatureDigest | null> {
		const client = await this.#getClient();
		if (!client) return null;
		try {
			const res = await client.callTool({
				name: 'get_digest',
				arguments: { featureId, detailLevel: 'full', format: 'markdown' }
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
		opts?: { dryRun?: boolean; commit?: string; verbose?: boolean }
	): Promise<BehaviorBatchResult | null> {
		const client = await this.#getClient();
		if (!client) return null; // engine unreachable — distinct from a rejected batch
		const commit = typeof opts?.commit === 'string' && opts.commit.length > 0 ? opts.commit : null;
		// The commit path replays a cached, already-validated batch; the engine ignores
		// dryRun there and reads the ops + feature from the token, so send neither.
		const dryRun = commit ? false : opts?.dryRun === true;
		const verbose = opts?.verbose === true;
		try {
			const res = await client.callTool({
				name: 'apply_batch',
				arguments: commit ? { commit } : { featureId, operations, dryRun, verbose }
			});
			const text = extractText(res);
			// A rejected batch comes back as an isError tool result (the engine's own
			// "Batch failed: op[i] …" text), NOT a thrown error — surface it structured.
			if ((res as { isError?: boolean }).isError === true) {
				await this.#recycleIfPoisoned(featureId, commit);
				return failedBatch(dryRun, text ?? 'Batch rejected.');
			}
			const parsed = text ? safeJson(text) : null;
			if (!parsed || typeof parsed !== 'object') {
				await this.#recycleIfPoisoned(featureId, commit);
				return failedBatch(dryRun, text ? text.slice(0, 400) : 'Empty engine response.');
			}
			const r = parsed as Record<string, unknown>;
			const maturity = (r.maturity ?? null) as { percentage?: unknown } | null;
			return {
				ok: r.ok === true,
				dryRun: r.dryRun === true || dryRun,
				appliedCount: int(r.appliedCount),
				refs: isStringRecord(r.refs) ? r.refs : {},
				errors: r.ok === true ? [] : collectBatchErrors(r),
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
			const res = await this.#engine.connected?.callTool({
				name: 'get_feature',
				arguments: { featureId }
			});
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
		const client = await this.#getClient();
		if (!client) return null;
		try {
			const res = await client.callTool({
				name: 'get_feature',
				arguments: { featureId }
			});
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
		const client = await this.#getClient();
		if (!client) return null;
		try {
			const res = await client.callTool({
				name: 'get_feature',
				arguments: { featureId, verbose: true }
			});
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
		const client = await this.#getClient();
		if (!client) return false;
		try {
			const res = await client.callTool({
				name: 'save_feature',
				arguments: { feature: snapshot.feature }
			});
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
		const client = await this.#getClient();
		if (!client) return 'unavailable';
		try {
			const res = await client.callTool({
				name: 'replace_project',
				arguments: { project: snapshot.project }
			});
			const text = extractText(res);
			if (!text) return 'replaced';
			if (/not found/i.test(text)) return 'not-found';
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
			deadlockStates: int(r.deadlockStates),
			unreachableSurfaces: mapNamedSurfaces(reach.unreachableSurfaces),
			terminalSurfaces: mapNamedSurfaces(reach.terminalSurfaces)
		};
	}

	async simulateAction(args: SimulateArgs): Promise<SimulationResult | null> {
		const parsed = await this.#callJson('dry_run_simulate', {
			featureId: args.featureId,
			surfaceId: args.surfaceId,
			actionId: args.actionId,
			...(args.snapshot ? { snapshot: args.snapshot } : {}),
			...(args.parameters ? { parameters: args.parameters } : {})
		});
		if (!parsed) return null;
		const r = parsed as Record<string, unknown>;
		const status: 'success' | 'blocked' = r.status === 'blocked' ? 'blocked' : 'success';
		const blockedReasons: string[] = [];
		for (const e of asArray(r.parameterErrors)) {
			const o = e as Record<string, unknown>;
			const reason = [str(o.parameterName), str(o.reason)].filter(Boolean).join(': ');
			if (reason) blockedReasons.push(reason);
		}
		for (const v of asArray(r.invariantViolations)) {
			const name = str((v as Record<string, unknown>).invariantName);
			if (name) blockedReasons.push(`invariant: ${name}`);
		}
		return {
			status,
			nextState: (r.nextState ?? {}) as Record<string, unknown>,
			transition: typeof r.transition === 'string' ? r.transition : null,
			blockedReasons
		};
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
			return {
				featureId: str(o.featureId),
				featureName: str(o.featureName),
				passed: o.passed === true
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
			features
		};
	}

	async getSpecGaps(featureId: string, budget?: AdvisorCallBudget): Promise<SpecGap[]> {
		const parsed = await this.#callJson('get_spec_gaps', { featureId }, budget);
		if (!parsed) return [];
		const gaps = asArray((parsed as Record<string, unknown>).gaps);
		return gaps.map((g) => {
			const o = (g ?? {}) as Record<string, unknown>;
			return {
				severity: o.severity === 'critical' ? 'critical' : 'recommended',
				entityType:
					o.entityType === 'feature' || o.entityType === 'surface' ? o.entityType : 'action',
				entityId: str(o.entityId),
				entityName: str(o.entityName) || '<unnamed>',
				reason: str(o.reason),
				suggestedFix: str(o.suggestedFix)
			};
		});
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

	async #getClient(): Promise<Client | null> {
		return this.#engine.client();
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
function collectBatchErrors(r: Record<string, unknown>): string[] {
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
	return out.length ? out : ['Batch rejected.'];
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
