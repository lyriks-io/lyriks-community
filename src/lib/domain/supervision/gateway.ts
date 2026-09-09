import type { GatewayAuditEntry, GatewayKey } from './draft';
import type { PolicyStatus } from './enums';

/**
 * Pure per-MEMBER AI-usage analysis for the Supervision gateway tab. The roster
 * is the project's REAL workspace members (lyriks-back collaborators) — the same
 * identities the team is made of — and each is the unit the LiteLLM gateway
 * attributes AI spend, tokens and calls to. A member is keyed by a stable `ref`
 * (their email — the real login — else their id), so a key follows the person,
 * not a display name. Cost & quota governance per person, never a productivity
 * ranking.
 *
 * Real enforcement stays project/scope-level (the AI Cost Governor pushes one
 * key per feature to the proxy); this layer is the per-member ledger on top.
 * Degrades to free-text board names when no back is wired (the air-gapped MAP).
 */

/** One roster entry — a real member resolved to a stable identity. */
export interface RosterMember {
	/** Stable identity: email (preferred), else id, else the display name. */
	ref: string;
	name: string;
	email?: string;
}

/**
 * The stable identity a member's key follows: their email (the real login) when
 * present, else a supplied id, else their display name. Keeps keys attached to
 * the person across renames.
 */
export function memberRef(m: { email?: string; id?: string; name: string }): string {
	return m.email?.trim() || m.id?.trim() || m.name.trim();
}

/** Build a roster from raw member records (e.g. lyriks-back collaborators). */
export function rosterFrom(members: { id?: string; name: string; email?: string }[]): RosterMember[] {
	return members
		.filter((m) => m.name?.trim() || m.email?.trim())
		.map((m) => ({
			ref: memberRef(m),
			name: m.name?.trim() || m.email!.trim(),
			email: m.email?.trim() || undefined
		}));
}

/** Key-safe slug for a member ref (empty when blank). */
export function memberSlug(ref: string): string {
	return ref
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-+|-+$)/g, '');
}

/**
 * The deterministic LiteLLM virtual-key value for one member of a project, e.g.
 * `sk-lyriks-<projectId>-member-<slug>`, where the slug is the member's stable
 * ref (email/id). Deterministic so provisioning is idempotent (create-or-update).
 */
export function memberKeyValue(projectId: string, ref: string): string {
	const seg = memberSlug(ref);
	return seg ? `sk-lyriks-${projectId}-member-${seg}` : `sk-lyriks-${projectId}`;
}

/** Human-readable alias for a member's LiteLLM key, e.g. `lyriks-<projectId>-member-<slug>`. */
export function memberKeyAlias(projectId: string, ref: string): string {
	const seg = memberSlug(ref);
	return seg ? `lyriks-${projectId}-member-${seg}` : `lyriks-${projectId}`;
}

/** One member's rolled-up AI usage — the row the gateway tab renders per person. */
export interface MemberGatewayView {
	/** Stable identity ref (email/id) — what actions & the key are keyed by. */
	member: string;
	/** Display name resolved from the roster (falls back to the ref). */
	name: string;
	email?: string;
	/** The provisioned per-member key, or null when none has been created yet. */
	key: GatewayKey | null;
	/** Deterministic virtual-key value (shown even before provisioning). */
	keyValue: string;
	spentUsd: number;
	tokensUsed: number;
	calls: number;
	blocked: number;
	flagged: number;
	/** Spend as a % of the member budget (0 when uncapped/unprovisioned). */
	budgetPct: number;
	/** Tokens as a % of the member quota (0 when unprovisioned). */
	quotaPct: number;
	/** Recent audit lines for this member, newest first as stored. */
	recent: GatewayAuditEntry[];
}

/**
 * Roll the raw gateway data up per member. The roster is the real workspace
 * members, extended with anyone who already has a provisioned key or a logged AI
 * call but has since left the team (so no spend is ever orphaned). Every member
 * is keyed by their stable `ref`; the display name is resolved from the roster
 * (or the key, or the ref). Spend/tokens prefer the provisioned key's ledger and
 * fall back to summing the member's audit lines.
 */
export function deriveMemberGateway(
	projectId: string,
	roster: RosterMember[],
	memberKeys: GatewayKey[],
	audit: GatewayAuditEntry[]
): MemberGatewayView[] {
	// Ordered ref list: real members first, then keyed/audited refs not on the team.
	const refs: string[] = [];
	const byRef = new Map<string, RosterMember>();
	const add = (ref: string, member?: RosterMember) => {
		const r = ref.trim();
		if (!r || byRef.has(r)) return;
		byRef.set(r, member ?? { ref: r, name: r });
		refs.push(r);
	};
	for (const m of roster) add(m.ref, m);
	for (const k of memberKeys) add(k.member);
	for (const e of audit) add(e.actor);

	return refs.map((ref) => {
		const entry = byRef.get(ref)!;
		const key = memberKeys.find((k) => k.member === ref) ?? null;
		const lines = audit.filter((e) => e.actor === ref);
		const auditSpend = lines.reduce((s, e) => s + Math.max(0, e.cost), 0);
		const auditTokens = lines.reduce((s, e) => s + Math.max(0, e.tokens), 0);
		const spentUsd = key ? key.spentUsd : auditSpend;
		const tokensUsed = key ? key.tokensUsed : auditTokens;
		return {
			member: ref,
			name: entry.name,
			email: entry.email,
			key,
			keyValue: memberKeyValue(projectId, ref),
			spentUsd,
			tokensUsed,
			calls: lines.length,
			blocked: lines.filter((e) => e.status === 'blocked').length,
			flagged: lines.filter((e) => e.status === 'flagged').length,
			budgetPct: key && key.monthlyBudgetUsd > 0 ? Math.round((spentUsd / key.monthlyBudgetUsd) * 100) : 0,
			quotaPct: key && key.tokenQuota > 0 ? Math.round((tokensUsed / key.tokenQuota) * 100) : 0,
			recent: lines
		};
	});
}

/** Whole-team AI-usage totals, for the gateway tab's summary tiles. */
export interface GatewayTotals {
	members: number;
	provisioned: number;
	spentUsd: number;
	budgetUsd: number;
	tokensUsed: number;
	blocked: number;
}

export function gatewayTotals(views: MemberGatewayView[]): GatewayTotals {
	return {
		members: views.length,
		provisioned: views.filter((v) => v.key).length,
		spentUsd: views.reduce((s, v) => s + v.spentUsd, 0),
		budgetUsd: views.reduce((s, v) => s + (v.key?.monthlyBudgetUsd ?? 0), 0),
		tokensUsed: views.reduce((s, v) => s + v.tokensUsed, 0),
		blocked: views.reduce((s, v) => s + v.blocked, 0)
	};
}

/** Per-member budget/quota alerts — a key at ≥ 90% of its ceiling. */
export function gatewayAlerts(views: MemberGatewayView[]): string[] {
	const alerts: string[] = [];
	for (const v of views) {
		if (v.budgetPct >= 90) alerts.push(`${v.name} is at ${v.budgetPct}% of their AI budget`);
		if (v.quotaPct >= 90) alerts.push(`${v.name} is at ${v.quotaPct}% of their token quota`);
	}
	return alerts;
}

/**
 * A live AI-usage policy check — its status is COMPUTED from real gateway data
 * (pulled per-member spend + the governor's project spend), not set by hand.
 */
export interface GatewayPolicyCheck {
	id: string;
	label: string;
	status: PolicyStatus;
	detail: string;
}

/**
 * The live cost-policy checks the AI-policy tab shows above the declared rules.
 * Every status is derived from real numbers, so "compliant / watch / violation"
 * reflects what the gateway actually metered — the FinOps guardrail an enterprise
 * governs on. `projectSpentRatio` is the governor's spend ÷ monthly budget.
 */
export function evaluateGatewayPolicy(
	views: MemberGatewayView[],
	projectSpentRatio: number
): GatewayPolicyCheck[] {
	const checks: GatewayPolicyCheck[] = [];
	const keyed = views.filter((v) => v.key);

	if (keyed.length > 0) {
		const over = keyed.filter((v) => v.budgetPct >= 100);
		const near = keyed.filter((v) => v.budgetPct >= 90 && v.budgetPct < 100);
		checks.push({
			id: 'member-budgets',
			label: 'Every member within their monthly AI budget',
			status: over.length ? 'violation' : near.length ? 'warn' : 'ok',
			detail: over.length
				? `Over budget: ${over.map((v) => v.name).join(', ')}`
				: near.length
					? `Near the cap: ${near.map((v) => v.name).join(', ')}`
					: `${keyed.length} member key${keyed.length > 1 ? 's' : ''} under budget`
		});
	} else {
		checks.push({
			id: 'member-budgets',
			label: 'Per-member AI budgets in force',
			status: 'warn',
			detail: 'No member keys provisioned. Provision keys to enforce per-person budgets.'
		});
	}

	const pct = Math.round(Math.max(0, projectSpentRatio) * 100);
	checks.push({
		id: 'project-budget',
		label: 'Project AI spend within the monthly budget',
		status: projectSpentRatio > 1 ? 'violation' : projectSpentRatio > 0.9 ? 'warn' : 'ok',
		detail: `${pct}% of the monthly AI budget used`
	});

	return checks;
}
