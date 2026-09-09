import {
	createEmptyFinopsDraft,
	finopsKeyValue,
	WHOLE_PROJECT_SCOPE,
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

export interface PullFinopsUsageResult {
	configured: boolean;
	/** The live state of each governed scope's key that the proxy still holds. */
	states: LiteLLMKeyState[];
	draft: ProjectFinopsDraft;
	revision: number | null;
}

/**
 * Pull the live spend across every governed scope's virtual key from the LiteLLM
 * proxy and write the summed total back as the authoritative spend figure (the
 * proxy's ledger wins). No-ops cleanly when no proxy is configured.
 */
export class PullFinopsUsageUseCase {
	constructor(
		private readonly drafts: FinopsDraftRepositoryPort,
		private readonly gateway: LiteLLMGatewayPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(
		projectId: string,
		save: SectionDraftSaveOptions
	): Promise<PullFinopsUsageResult> {
		const draft = (await this.drafts.load(projectId)) ?? createEmptyFinopsDraft(projectId);
		if (!this.gateway.available) {
			return { configured: false, states: [], draft, revision: null };
		}

		// Read every scope that currently owns an active guardrail, plus the base
		// project key, and sum their spend. Distinct scopes only.
		const scopes = new Set<string>([WHOLE_PROJECT_SCOPE]);
		for (const r of draft.rules) {
			if (r.status === 'active') scopes.add(r.scopeLabel.trim());
		}
		const read = await Promise.all(
			[...scopes].map((scope) => this.gateway.readKey(finopsKeyValue(projectId, scope)))
		);
		const states = read.filter((s): s is LiteLLMKeyState => s !== null);

		const spendUsd = states.length
			? states.reduce((sum, s) => sum + s.spendUsd, 0)
			: draft.spentUsd;
		const savedAt = this.clock.nowIso();
		const updated: ProjectFinopsDraft = {
			...draft,
			spentUsd: spendUsd,
			gateway: { ...draft.gateway, baseUrl: this.gateway.baseUrl, connected: true },
			lastSavedAt: savedAt
		};
		const revision = await this.drafts.save(updated, save);

		this.telemetry.emit({
			type: 'finops.gateway.usage_pulled',
			projectId,
			spendUsd,
			keys: states.length
		});

		return { configured: true, states, draft: updated, revision };
	}
}
