import {
	createEmptyFinopsDraft,
	createRule,
	isEnforcementMode,
	isRuleKind,
	isRuleSource,
	isRuleStatus,
	type CompiledRule,
	type ProjectFinopsDraft
} from '$domain/finops';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted AI Cost Governor payloads. Rebuilds each
 * compiled rule through its factory so ids, valid enum codes and defaults are
 * always present, clamps the numeric levers to their ranges, and normalizes the
 * gateway link. Live signals are NOT parsed here — they are recomputed from
 * Global Coherence at the edge, never authored.
 */
export function parseFinopsDraft(input: unknown, projectId: string): ProjectFinopsDraft {
	const base = createEmptyFinopsDraft(projectId);
	if (input === null || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;

	const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
	const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
	const str = (v: unknown): string => (typeof v === 'string' ? v : '');
	const bool = (v: unknown): boolean => v === true;

	const rules: CompiledRule[] = parseStableRecords(
		src.rules,
		'finops-rule',
		(r, id) =>
			createRule({
					id,
					kind: isRuleKind(r.kind) ? r.kind : 'block_scope',
					status: isRuleStatus(r.status) ? r.status : 'proposed',
					source: isRuleSource(r.source) ? r.source : 'maturity',
					rationale: str(r.rationale),
					scopeLabel: str(r.scopeLabel),
					capUsd: Math.max(0, num(r.capUsd, 0)),
					estimatedSavingUsd: Math.max(0, num(r.estimatedSavingUsd, 0)),
					createdAt: str(r.createdAt) || 'just now'
				})
	);

	const g = (src.gateway ?? {}) as Record<string, unknown>;

	return {
		...base,
		projectId,
		monthlyBudgetUsd: Math.max(0, num(src.monthlyBudgetUsd, base.monthlyBudgetUsd)),
		spentUsd: Math.max(0, num(src.spentUsd, 0)),
		enforcementMode: isEnforcementMode(src.enforcementMode) ? src.enforcementMode : 'advisory',
		maturityThreshold: clamp(num(src.maturityThreshold, base.maturityThreshold), 0, 100),
		coherenceThreshold: clamp(num(src.coherenceThreshold, base.coherenceThreshold), 0, 100),
		budgetTightenRatio: clamp(num(src.budgetTightenRatio, base.budgetTightenRatio), 0, 1),
		scopeLabel: str(src.scopeLabel),
		scopeReadiness: clamp(num(src.scopeReadiness, base.scopeReadiness), 0, 100),
		gateway: {
			baseUrl: str(g.baseUrl),
			connected: bool(g.connected),
			pendingPushCount: Math.max(0, num(g.pendingPushCount, 0)),
			lastPushOk: bool(g.lastPushOk)
		},
		rules
	};
}
