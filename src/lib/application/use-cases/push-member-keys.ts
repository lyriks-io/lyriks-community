import {
	createEmptySupervisionDraft,
	memberKeyAlias,
	memberKeyValue,
	type GatewayKey,
	type ProjectSupervisionDraft
} from '$domain/supervision';
import type {
	ClockPort,
	LiteLLMGatewayPort,
	LiteLLMKeyState,
	SectionDraftSaveOptions,
	SupervisionDraftRepositoryPort,
	TelemetryPort
} from '../ports';

/** One provisioned member key, tagged with the member it belongs to. */
export interface AppliedMemberKey {
	member: string;
	state: LiteLLMKeyState;
}

export interface PushMemberKeysResult {
	configured: boolean;
	applied: AppliedMemberKey[];
	draft: ProjectSupervisionDraft;
	revision: number | null;
}

/**
 * Provision one REAL LiteLLM virtual key per team member from the Supervision
 * ledger — each with its own monthly budget cap, so the gateway enforces spend
 * per person and attributes it back per person. The proxy's returned spend is
 * written back as the authoritative figure for each member key. No-ops cleanly
 * when no proxy is configured (air-gapped install) — the keys stay advisory/local.
 */
export class PushMemberKeysUseCase {
	constructor(
		private readonly drafts: SupervisionDraftRepositoryPort,
		private readonly gateway: LiteLLMGatewayPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(
		projectId: string,
		save: SectionDraftSaveOptions
	): Promise<PushMemberKeysResult> {
		const draft = (await this.drafts.load(projectId)) ?? createEmptySupervisionDraft(projectId);
		if (!this.gateway.available) {
			return { configured: false, applied: [], draft, revision: null };
		}

		const applied: AppliedMemberKey[] = [];
		// One virtual key per provisioned member. A member's budget caps THEIR key
		// alone; models are left open (member keys govern cost/quota, not routing —
		// model routing stays the governor's per-scope job).
		const nextKeys: GatewayKey[] = [];
		for (const k of draft.memberKeys) {
			const state = await this.gateway.applyKey({
				alias: memberKeyAlias(projectId, k.member),
				key: memberKeyValue(projectId, k.member),
				blocked: false,
				models: [],
				maxBudgetUsd: k.monthlyBudgetUsd,
				// Real recurring cap: the proxy auto-resets each member's spend monthly,
				// so a per-member AI budget is enforced every month, not just once.
				budgetDuration: '30d'
			});
			applied.push({ member: k.member, state });
			// The proxy ledger is authoritative for spend.
			nextKeys.push({ ...k, spentUsd: state.spendUsd });
		}

		const savedAt = this.clock.nowIso();
		const updated: ProjectSupervisionDraft = {
			...draft,
			memberKeys: nextKeys,
			lastSavedAt: savedAt
		};
		const revision = await this.drafts.save(updated, save);

		this.telemetry.emit({
			type: 'supervision.gateway.member_keys_pushed',
			projectId,
			keys: applied.length
		});

		return { configured: true, applied, draft: updated, revision };
	}
}
