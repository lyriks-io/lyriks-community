import type {
	CoherenceAnalysis,
	Gap,
	GapDecision,
	GapDecisionStatus,
	ProjectCoherenceDraft,
	SettledGap
} from './draft';

/**
 * Decisions over coherence gaps. Pure: the checker applies them to an analysis
 * so every consumer (rings, Control Center, portfolio, Coherence page) reads the
 * same open list; the route appends them with the caller's identity.
 *
 * Rules:
 *   - a BLOCKING gap is never settled: it is fixed at the source, full stop;
 *   - a decision belongs to a person, an AI client may only report;
 *   - a decision is never deleted, a reopen supersedes it;
 *   - a legacy acknowledgement (no reason) still settles, and says so.
 */

/** The decision that currently stands for each gap: latest, not superseded, not a reopen. */
export function activeDecisions(decisions: readonly GapDecision[]): Map<string, GapDecision> {
	const active = new Map<string, GapDecision>();
	for (const d of decisions) {
		if (d.supersededById !== null || d.status === 'reopened') continue;
		const current = active.get(d.gapId);
		if (!current || current.decidedAt <= d.decidedAt) active.set(d.gapId, d);
	}
	return active;
}

/** A settling decision synthesised for a pre-decisions acknowledgement. */
function legacyDecision(gap: Gap): GapDecision {
	return {
		id: `legacy-ack-${gap.id}`,
		gapId: gap.id,
		status: 'accepted_risk',
		reason: 'Acknowledged before decisions were traced (no reason recorded).',
		authorId: 'unknown',
		authorKind: 'person',
		decidedAt: '',
		gapTitle: gap.title,
		supersededById: null
	};
}

/**
 * Move every settled gap out of the open list, keeping it with its decision.
 * Idempotent, and an analysis with nothing to settle comes back untouched.
 */
export function applyDecisions(
	analysis: CoherenceAnalysis,
	draft: Pick<ProjectCoherenceDraft, 'acknowledgedGapIds' | 'decisions'>
): CoherenceAnalysis {
	const active = activeDecisions(draft.decisions);
	const acked = new Set(draft.acknowledgedGapIds);
	if (active.size === 0 && acked.size === 0) return analysis;
	const open: Gap[] = [];
	const settled: SettledGap[] = [...(analysis.settled ?? [])];
	for (const gap of analysis.gaps) {
		if (gap.blocking) {
			open.push(gap);
			continue;
		}
		const decision = active.get(gap.id) ?? (acked.has(gap.id) ? legacyDecision(gap) : undefined);
		if (decision) settled.push({ gap, decision });
		else open.push(gap);
	}
	if (settled.length === (analysis.settled?.length ?? 0)) return analysis;
	return { ...analysis, gaps: open, settled };
}

export interface DecisionRefusal {
	ok: false;
	why: string;
}
export type DecisionVerdict = { ok: true } | DecisionRefusal;

/** Whether this gap may be settled by this author. */
export function canSettle(
	gap: Pick<Gap, 'blocking'> | undefined,
	author: { kind: 'person' | 'ai_client' },
	reason: string
): DecisionVerdict {
	if (!gap) return { ok: false, why: 'This gap is no longer open; nothing to settle.' };
	if (gap.blocking) return { ok: false, why: 'A blocking gap cannot be settled: fix it at the source.' };
	if (author.kind !== 'person')
		return { ok: false, why: 'Settling a gap is a decision, and decisions belong to a person.' };
	if (reason.trim() === '')
		return { ok: false, why: 'A decision without a reason is indistinguishable from gaming the score.' };
	return { ok: true };
}

export interface DecisionInput {
	gapId: string;
	gapTitle: string;
	status: Exclude<GapDecisionStatus, 'reopened'>;
	reason: string;
	author: { id: string; kind: 'person' | 'ai_client' };
}

/** Append a settling decision. A standing decision on the same gap is superseded. */
export function settleGap(
	draft: ProjectCoherenceDraft,
	input: DecisionInput,
	id: string,
	now: string
): ProjectCoherenceDraft {
	const decisions = supersede(draft.decisions, input.gapId, id);
	const decision: GapDecision = {
		id,
		gapId: input.gapId,
		status: input.status,
		reason: input.reason.trim(),
		authorId: input.author.id,
		authorKind: input.author.kind,
		decidedAt: now,
		gapTitle: input.gapTitle,
		supersededById: null
	};
	return {
		...draft,
		// A traced decision replaces the untraced acknowledgement of the same gap.
		acknowledgedGapIds: draft.acknowledgedGapIds.filter((g) => g !== input.gapId),
		decisions: [...decisions, decision]
	};
}

/** Reopen a settled gap: the standing decision is superseded by a reopen entry, never deleted. */
export function reopenGap(
	draft: ProjectCoherenceDraft,
	gapId: string,
	author: { id: string; kind: 'person' | 'ai_client' },
	reason: string,
	id: string,
	now: string
): ProjectCoherenceDraft {
	const standing = activeDecisions(draft.decisions).get(gapId);
	const decisions = supersede(draft.decisions, gapId, id);
	const reopen: GapDecision = {
		id,
		gapId,
		status: 'reopened',
		reason: reason.trim(),
		authorId: author.id,
		authorKind: author.kind,
		decidedAt: now,
		gapTitle: standing?.gapTitle ?? gapId,
		supersededById: null
	};
	return {
		...draft,
		acknowledgedGapIds: draft.acknowledgedGapIds.filter((g) => g !== gapId),
		decisions: [...decisions, reopen]
	};
}

function supersede(decisions: readonly GapDecision[], gapId: string, byId: string): GapDecision[] {
	return decisions.map((d) =>
		d.gapId === gapId && d.supersededById === null && d.status !== 'reopened'
			? { ...d, supersededById: byId }
			: d
	);
}
