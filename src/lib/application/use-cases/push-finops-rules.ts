import {
	createEmptyFinopsDraft,
	deriveScopedPlans,
	finopsKeyAlias,
	finopsKeyValue,
	type ProjectFinopsDraft
} from '$domain/finops';
import type {
	ClockPort,
	FinopsDraftRepositoryPort,
	LiteLLMGatewayPort,
	LiteLLMKeyState,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';

/** One provisioned virtual key, tagged with the scope (feature) it governs. */
export interface AppliedKey {
	/** '' = the whole-project key; otherwise the feature name. */
	scope: string;
	state: LiteLLMKeyState;
}

export interface PushFinopsRulesResult {
	configured: boolean;
	/** One entry per governed scope (feature / whole-project). */
	applied: AppliedKey[];
	draft: ProjectFinopsDraft;
	revision: number | null;
}

/**
 * Push the active compiled rules to the LiteLLM proxy: project them onto the
 * project's virtual key (block / model allow-list / budget cap), then reflect
 * the applied state back into the draft (spend, connection, cleared queue).
 * No-ops cleanly when no proxy is configured (air-gapped install).
 */
export class PushFinopsRulesUseCase {
	constructor(
		private readonly drafts: FinopsDraftRepositoryPort,
		private readonly gateway: LiteLLMGatewayPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort,
		private readonly cheapModel: string
	) {}

	async execute(
		projectId: string,
		save: SectionDraftSaveOptions
	): Promise<PushFinopsRulesResult> {
		const draft = (await this.drafts.load(projectId)) ?? createEmptyFinopsDraft(projectId);
		if (!this.gateway.available) {
			return { configured: false, applied: [], draft, revision: null };
		}

		// One virtual key per governed scope: a guardrail on a feature restricts
		// that feature's key alone, never the whole project.
		const scoped = deriveScopedPlans(draft, this.cheapModel);
		const applied: AppliedKey[] = [];
		for (const { scope, plan } of scoped) {
			const state = await this.gateway.applyKey({
				alias: finopsKeyAlias(projectId, scope),
				key: finopsKeyValue(projectId, scope),
				...plan
			});
			applied.push({ scope, state });
		}

		// The proxy ledger is authoritative: total spend is the sum across keys.
		// With no keys provisioned, keep the last known figure (nothing to read).
		const spendUsd = applied.length
			? applied.reduce((sum, k) => sum + k.state.spendUsd, 0)
			: draft.spentUsd;
		const savedAt = this.clock.nowIso();
		const updated: ProjectFinopsDraft = {
			...draft,
			spentUsd: spendUsd,
			gateway: {
				...draft.gateway,
				baseUrl: this.gateway.baseUrl,
				connected: true,
				pendingPushCount: 0,
				lastPushOk: true
			},
			lastSavedAt: savedAt
		};
		const revision = await this.drafts.save(updated, save);

		this.telemetry.emit({
			type: 'finops.gateway.pushed',
			projectId,
			keys: applied.length,
			blocked: applied.filter((k) => k.state.blocked).length
		});

		return { configured: true, applied, draft: updated, revision };
	}
}
