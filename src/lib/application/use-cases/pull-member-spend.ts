import {
	createEmptySupervisionDraft,
	memberKeyValue,
	type GatewayAuditEntry,
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

export interface MemberKeyState {
	member: string;
	state: LiteLLMKeyState;
}

export interface PullMemberSpendResult {
	configured: boolean;
	states: MemberKeyState[];
	draft: ProjectSupervisionDraft;
	revision: number | null;
}

/** How many audit lines to keep in the mirror (newest first) — a display feed, not the ledger. */
const AUDIT_CAP = 100;

/** Coarse "3h ago"-style recency from an ISO timestamp against the current clock. */
function ago(nowIso: string, atIso: string): string {
	if (!atIso) return '';
	const now = Date.parse(nowIso);
	const at = Date.parse(atIso);
	if (!Number.isFinite(now) || !Number.isFinite(at)) return '';
	const mins = Math.max(0, Math.round((now - at) / 60000));
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Pull each member key's live spend AND its real per-call ledger from the LiteLLM
 * proxy. Writes back, per member: the authoritative spend, the real tokens burned
 * (summed from the ledger), and a fresh audit trail of actual metered calls. The
 * proxy's ledger wins. No-ops when no proxy is wired.
 */
export class PullMemberSpendUseCase {
	constructor(
		private readonly drafts: SupervisionDraftRepositoryPort,
		private readonly gateway: LiteLLMGatewayPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(
		projectId: string,
		save: SectionDraftSaveOptions
	): Promise<PullMemberSpendResult> {
		const draft = (await this.drafts.load(projectId)) ?? createEmptySupervisionDraft(projectId);
		if (!this.gateway.available) {
			return { configured: false, states: [], draft, revision: null };
		}

		const now = this.clock.nowIso();
		const states: MemberKeyState[] = [];
		const nextKeys: GatewayKey[] = [];
		// Carry the raw ISO time so the mirror sorts by real recency, not the label.
		const lines: { at: string; entry: GatewayAuditEntry }[] = [];

		for (const k of draft.memberKeys) {
			const keyValue = memberKeyValue(projectId, k.member);
			const [state, logs] = await Promise.all([
				this.gateway.readKey(keyValue),
				this.gateway.readSpendLogs(keyValue)
			]);
			const tokensUsed = logs.reduce((s, l) => s + Math.max(0, l.totalTokens), 0);
			if (state) {
				states.push({ member: k.member, state });
				nextKeys.push({ ...k, spentUsd: state.spendUsd, tokensUsed });
			} else {
				nextKeys.push({ ...k, tokensUsed });
			}
			// The member's real calls become their audit lines (actor = stable ref).
			for (const l of logs) {
				lines.push({
					at: l.at,
					entry: {
						id: `${k.member}:${l.at}:${l.model}`,
						actor: k.member,
						model: l.model,
						tokens: l.totalTokens,
						cost: l.spendUsd,
						status: 'ok',
						reason: '',
						when: ago(now, l.at)
					}
				});
			}
		}

		lines.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
		const updated: ProjectSupervisionDraft = {
			...draft,
			memberKeys: nextKeys,
			gatewayAudit: lines.slice(0, AUDIT_CAP).map((l) => l.entry),
			lastSavedAt: now
		};
		const revision = await this.drafts.save(updated, save);

		this.telemetry.emit({
			type: 'supervision.gateway.member_spend_pulled',
			projectId,
			keys: states.length,
			calls: lines.length
		});

		return { configured: true, states, draft: updated, revision };
	}
}
