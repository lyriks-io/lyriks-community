import {
	createAssignment,
	createDecision,
	createEmptySupervisionDraft,
	createGatewayKey,
	createPolicyRule,
	isAssignmentStatus,
	isDecisionArea,
	isPolicyCategory,
	isPolicyStatus,
	isScopeType,
	type Assignment,
	type Decision,
	type GatewayKey,
	type PolicyRule,
	type ProjectSupervisionDraft
} from '$domain/supervision';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Supervision payloads. Rebuilds each
 * assignment / policy rule / decision through its factory so ids, valid enum
 * codes and defaults are always present. The read-only feeds (activity feed and
 * gateway audit) are trusted through as-is — they mirror upstream telemetry and
 * are not authored here.
 */
export function parseSupervisionDraft(input: unknown, projectId: string): ProjectSupervisionDraft {
	const base = createEmptySupervisionDraft(projectId);
	if (input === null || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
	const str = (v: unknown): string => (typeof v === 'string' ? v : '');

	const assignments: Assignment[] = parseStableRecords(
		src.assignments,
		'assignment',
		(a, id) =>
			createAssignment({
					id,
					assignee: str(a.assignee),
					scopeType: isScopeType(a.scopeType) ? a.scopeType : 'step',
					scopeLabel: str(a.scopeLabel),
					status: isAssignmentStatus(a.status) ? a.status : 'todo',
					progress: Math.max(0, Math.min(100, num(a.progress, 0))),
					dueInDays: num(a.dueInDays, 3),
					updatedAt: str(a.updatedAt) || 'just now'
			})
	);

	const policyRules: PolicyRule[] = parseStableRecords(
		src.policyRules,
		'policy-rule',
		(r, id) =>
			createPolicyRule({
					id,
					category: isPolicyCategory(r.category) ? r.category : 'tool',
					label: str(r.label),
					status: isPolicyStatus(r.status) ? r.status : 'ok',
					detail: str(r.detail)
			})
	);

	const decisions: Decision[] = parseStableRecords(
		src.decisions,
		'decision',
		(d, id) =>
			createDecision({
					id,
					title: str(d.title),
					rationale: str(d.rationale),
					by: str(d.by),
					area: isDecisionArea(d.area) ? d.area : 'feature',
					when: str(d.when) || 'just now'
			})
	);

	const memberKeys: GatewayKey[] = Array.isArray(src.memberKeys)
		? src.memberKeys
				.map((raw) => {
					const k = (raw ?? {}) as Record<string, unknown>;
					return createGatewayKey({
						member: str(k.member).trim(),
						monthlyBudgetUsd: Math.max(0, num(k.monthlyBudgetUsd, 50)),
						spentUsd: Math.max(0, num(k.spentUsd, 0)),
						tokensUsed: Math.max(0, num(k.tokensUsed, 0)),
						tokenQuota: Math.max(0, num(k.tokenQuota, 1_000_000))
					});
				})
				.filter((k) => k.member)
		: [];
	const uniqueMemberKeys = memberKeys.filter(
		(key, index, all) =>
			all.findIndex((candidate) => candidate.member.toLowerCase() === key.member.toLowerCase()) ===
			index
	);

	return {
		...base,
		projectId,
		assignments,
		policyRules,
		decisions,
		memberKeys: uniqueMemberKeys,
		activity: parseStableRecords(src.activity, 'activity', (record, id) => ({
			...record,
			id
		}) as unknown as ProjectSupervisionDraft['activity'][number]),
		gatewayAudit: parseStableRecords(src.gatewayAudit, 'gateway-audit', (record, id) => ({
			...record,
			id
		}) as unknown as ProjectSupervisionDraft['gatewayAudit'][number])
	};
}
