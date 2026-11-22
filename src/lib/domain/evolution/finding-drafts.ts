import type { CoherenceFinding, EvolutionRequest } from './draft';
import { ELEMENT_PATH_PREFIX } from './spec-actions';
import { stableId } from './ids';
import { coherenceHeadline, type CoherenceHeadline } from '$domain/coherence';
import type { Gap } from '$domain/coherence';
import type { ProjectRulesDraft } from '$domain/rules';

/**
 * The findings of Project health a request settles (ac-evo-draft-findings):
 * one or several, each with what becomes of it, fixed by the change or kept as
 * it is with the reason. They are held on the request like every other draft,
 * validated on the Specification, and they leave Project health when the change
 * lands (ac-evo-draft-findings-landing), so a request that fixes a problem never
 * leaves it on the list for somebody to settle again by hand.
 *
 * A finding the rules register holds (declared by whoever wrote the spec) is
 * written there at the landing. A finding kept as it is is settled by design. A
 * finding the engine detects is written nowhere: it leaves because the landed
 * spec no longer carries its cause, and one still listed says so.
 */

export const FINDING_DRAFT_PREFIX = 'finding:';
export const FINDINGS_BLOCK_NAME = 'Findings this change settles';

export const FINDING_OUTCOMES = ['undecided', 'fixed', 'kept'] as const;
export type FindingOutcome = (typeof FINDING_OUTCOMES)[number];
export const isFindingOutcome = (v: unknown): v is FindingOutcome => typeof v === 'string' && (FINDING_OUTCOMES as readonly string[]).includes(v);

/** How a settled finding left Project health, set by the landing. */
export type FindingSettlement = 'register' | 'by_design' | 'engine';

export interface FindingDraft {
	/** `finding:<findingId>`: one line per finding, whatever writes it. */
	readonly id: string;
	/** The id Project health gives the finding (a gap id). */
	readonly findingId: string;
	/** The finding's title as Project health read it when it was named: a display copy. */
	title: string;
	/** The feature it names, when it names one. */
	featureRef: string | null;
	/** Whether it stood between the spec and a build when it was named. */
	blocking: boolean;
	outcome: FindingOutcome;
	/** Why it is kept as it is; for a fix, where it was fixed when the fix is already in the product (optional). */
	reason: string;
	sourceIds: string[];
	/** Set by the landing. */
	materialisedAt: string | null;
	/** Set by the landing: where the settlement went. */
	settledAs?: FindingSettlement;
}

/** The slice of a Project health finding a request reads. */
export type ListedFinding = Pick<Gap, 'id' | 'title' | 'blocking'> & Partial<Pick<Gap, 'featureRef' | 'checkId' | 'provenance'>>;

export const findingDraftIdOf = (findingId: string): string => `${FINDING_DRAFT_PREFIX}${findingId}`;

/** The rules register's own id of a finding it holds, or null for a finding something else detects. */
const REGISTER_GAP = /^gap-rules-issue-(?:conflict|ambiguity|missing|duplicate|orphan)-(.+)$/;
export const registerIssueIdOf = (findingId: string): string | null => REGISTER_GAP.exec(findingId)?.[1] ?? null;

export const liveFindingDrafts = (drafts: readonly FindingDraft[] | undefined): FindingDraft[] => (drafts ?? []).filter((d) => d.materialisedAt === null);

/**
 * A finding is validated on the Specification on a synthetic field whose value
 * is its fingerprint, like a change to the rules: an outcome or a reason
 * changed after a person validated it reads stale.
 */
export const FINDING_CHANGE_PATH_PREFIX = `${ELEMENT_PATH_PREFIX}finding.`;
export const findingChangeKey = (draft: Pick<FindingDraft, 'findingId'>): string => `${FINDING_CHANGE_PATH_PREFIX}${draft.findingId}`;
export const findingChangeFingerprint = (draft: Pick<FindingDraft, 'findingId' | 'outcome' | 'reason'>): string =>
	JSON.stringify({ finding: draft.findingId, outcome: draft.outcome, reason: draft.reason });
export const findingDraftOfKey = (drafts: readonly FindingDraft[] | undefined, key: string): FindingDraft | undefined =>
	(drafts ?? []).find((d) => findingChangeKey(d) === key);

/** Why a line cannot be validated as it stands, or null. */
export function findingValidationRefusal(draft: Pick<FindingDraft, 'outcome'>): string | null {
	return draft.outcome === 'undecided' ? 'Choose what becomes of this finding (fixed by this change, or kept as it is) before validating it.' : null;
}

/** The live request, other than this one, that already settles the finding. */
export function requestSettling(
	requests: readonly Pick<EvolutionRequest, 'id' | 'status' | 'findingDrafts'>[],
	findingId: string,
	except: string | null
): Pick<EvolutionRequest, 'id'> | null {
	return (
		requests.find(
			(r) => r.id !== except && r.status !== 'deleted' && r.status !== 'cancelled' && r.status !== 'closed' && liveFindingDrafts(r.findingDrafts).some((d) => d.findingId === findingId)
		) ?? null
	);
}

/** Every finding a live request settles, with that request (ac-cc-open-request): Project health names it instead of offering it again. */
export function findingsSettledByRequests(
	requests: readonly Pick<EvolutionRequest, 'id' | 'status' | 'findingDrafts'>[]
): Map<string, Pick<EvolutionRequest, 'id'>> {
	const by = new Map<string, Pick<EvolutionRequest, 'id'>>();
	for (const r of requests) {
		if (r.status === 'deleted' || r.status === 'cancelled' || r.status === 'closed') continue;
		for (const d of liveFindingDrafts(r.findingDrafts)) if (!by.has(d.findingId)) by.set(d.findingId, r);
	}
	return by;
}

/**
 * Why a line naming this finding with this outcome is refused, or null
 * (ac-evo-draft-findings). `listed` is the finding as Project health reads it
 * now; `settledBy` the other live request holding it, as its key.
 */
export function findingLineRefusal(input: {
	readonly findingId: string;
	readonly listed: ListedFinding | null;
	readonly settledBy: string | null;
	readonly outcome: FindingOutcome;
	readonly reason: string;
}): string | null {
	if (!input.findingId.trim()) return 'Name the finding by findingId, the id Project health gives it.';
	if (!input.listed) return `Project health no longer lists "${input.findingId}": there is nothing left to settle.`;
	if (input.settledBy) return `${input.settledBy} already settles this finding.`;
	if (input.listed.blocking && input.outcome === 'kept') return 'A blocking finding is fixed, never kept.';
	if (input.outcome === 'kept' && input.reason.trim() === '') return 'A finding kept as it is needs its reason.';
	return null;
}

export function newFindingDraft(listed: ListedFinding, input: { readonly outcome: FindingOutcome; readonly reason: string; readonly sourceIds: readonly string[] }): FindingDraft {
	return {
		id: findingDraftIdOf(listed.id),
		findingId: listed.id,
		title: listed.title,
		featureRef: listed.featureRef ?? null,
		blocking: listed.blocking,
		outcome: input.outcome,
		reason: input.outcome === 'undecided' ? '' : input.reason.trim(),
		sourceIds: [...new Set(input.sourceIds)],
		materialisedAt: null
	};
}

/** The description a request opened on findings starts with: what it settles, in the list's own words. */
export function descriptionNaming(findings: readonly Pick<ListedFinding, 'title'>[]): string {
	const titles = findings.map((f) => `- ${f.title}`);
	return findings.length === 1
		? `Settle this finding of Project health:\n${titles[0]}`
		: `Settle these ${findings.length} findings of Project health:\n${titles.join('\n')}`;
}

/* ---------------------------------------------------------------- landing */

/** Where the landing writes a line: the register, a decision by design, or nowhere (the engine reads the landed spec). */
export function settlementOf(draft: Pick<FindingDraft, 'findingId' | 'outcome'>, register: Pick<ProjectRulesDraft, 'issues'>): FindingSettlement | null {
	if (draft.outcome === 'undecided') return null;
	const issueId = registerIssueIdOf(draft.findingId);
	if (issueId && register.issues.some((i) => i.id === issueId)) return 'register';
	return draft.outcome === 'kept' ? 'by_design' : 'engine';
}

/**
 * The rules register with the request's findings written in
 * (ac-evo-draft-findings-landing): a finding fixed is resolved with the request
 * and its merge commit as its note, a finding kept is resolved as kept with its
 * reason and who validated it (the same words Spec 360 writes when a person
 * keeps one). An issue already settled is left as it is. Pure.
 */
export function registerWithSettlements(
	rules: ProjectRulesDraft,
	drafts: readonly FindingDraft[],
	input: { readonly requestKey: string; readonly mergeCommit: string | null; readonly at: string; readonly validatorOf: (draft: FindingDraft) => string }
): { readonly rules: ProjectRulesDraft; readonly written: string[] } {
	const byIssue = new Map<string, FindingDraft>();
	for (const draft of drafts) {
		const issueId = registerIssueIdOf(draft.findingId);
		if (issueId && draft.outcome !== 'undecided') byIssue.set(issueId, draft);
	}
	const written: string[] = [];
	const issues = rules.issues.map((issue) => {
		const draft = byIssue.get(issue.id);
		if (!draft || (issue.status !== 'open' && issue.status !== 'in_review')) return issue;
		const merged = input.mergeCommit ? `, merged in ${input.mergeCommit.slice(0, 7)}` : '';
		const where = draft.reason.trim() ? `: ${draft.reason.trim().replace(/\.$/, '')}` : '';
		// A request that merged code fixed it; one that brings none settles a fix already in the product.
		const line =
			draft.outcome === 'fixed'
				? `${input.mergeCommit ? 'Fixed' : 'Settled as fixed'} by ${input.requestKey}${merged}${where}.`
				: `Kept as it is by ${input.validatorOf(draft).trim() || 'a project editor'} on ${input.at.slice(0, 10)} (${input.requestKey}): ${draft.reason}`;
		written.push(draft.id);
		return { ...issue, status: 'resolved' as const, resolutionNote: issue.resolutionNote.trim() ? `${issue.resolutionNote.trim()}\n${line}` : line };
	});
	return { rules: { ...rules, issues }, written };
}

/** The findings the request settled that Project health still lists after the landing. */
export function findingsStillListed(drafts: readonly FindingDraft[] | undefined, gaps: readonly Pick<Gap, 'id'>[]): FindingDraft[] {
	const listed = new Set(gaps.map((g) => g.id));
	return (drafts ?? []).filter((d) => d.materialisedAt !== null && listed.has(d.findingId));
}

/* ------------------------------------------------- Project health after */

/** Project health as the change would leave it (ac-evo-coh-after). */
export interface ProjectHealthAfter {
	readonly now: Pick<CoherenceHeadline, 'score' | 'verdict' | 'total' | 'blocking'>;
	readonly after: Pick<CoherenceHeadline, 'score' | 'verdict' | 'total' | 'blocking'>;
	/** The findings that leave with the change: written into the register, or kept by design. */
	readonly leaving: readonly { readonly findingId: string; readonly title: string }[];
	/** Fixed by the change but detected by the engine: counted as staying until it reads the landed spec. */
	readonly expectedToLeave: readonly { readonly findingId: string; readonly title: string }[];
	/** Named on the request with no outcome chosen yet: staying. */
	readonly undecided: number;
	/** The findings only the request's drafts bring. */
	readonly coming: readonly { readonly id: string; readonly title: string }[];
}

const SEVERITY_AS_GAP: Record<CoherenceFinding['severity'], Gap['severity']> = { blocking: 'high', major: 'medium', minor: 'low' };

const pickHeadline = (h: CoherenceHeadline) => ({ score: h.score, verdict: h.verdict, total: h.total, blocking: h.blocking });

/**
 * Project health now and after the change (ac-evo-coh-after): the findings the
 * request settles taken off the list it reads now, the findings only its drafts
 * bring added, the headline recomputed on that list. A fix only the engine can
 * confirm stays counted: nothing proves it before the landed spec is read.
 */
export function projectHealthAfter(input: {
	readonly gaps: readonly Gap[];
	readonly findingDrafts: readonly FindingDraft[] | undefined;
	readonly register: Pick<ProjectRulesDraft, 'issues'>;
	/** The request's own coherence findings: those of scope request that are not notes are what it brings. */
	readonly requestFindings: readonly CoherenceFinding[];
	/** The request read: its engine findings are keyed by it and by the gap they map (coherence-mapping). */
	readonly requestId: string;
}): ProjectHealthAfter {
	const live = liveFindingDrafts(input.findingDrafts);
	const listed = new Map(input.gaps.map((g) => [g.id, g]));
	const leaving: { findingId: string; title: string }[] = [];
	const expectedToLeave: { findingId: string; title: string }[] = [];
	let undecided = 0;
	for (const draft of live) {
		const gap = listed.get(draft.findingId);
		if (!gap) continue;
		const settlement = settlementOf(draft, input.register);
		if (settlement === null) undecided++;
		else if (settlement === 'engine') expectedToLeave.push({ findingId: draft.findingId, title: gap.title });
		else leaving.push({ findingId: draft.findingId, title: gap.title });
	}
	// What the engine reports is already on the list read now: it never comes a second time (criterion 7dd35532).
	const listedNow = new Set(input.gaps.map((g) => stableId('coh', input.requestId, g.id)));
	const coming = input.requestFindings.filter((f) => (f.scope ?? 'request') === 'request' && !f.note && !f.risk && !listedNow.has(f.id));
	const gone = new Set(leaving.map((l) => l.findingId));
	const after: Gap[] = [
		...input.gaps.filter((g) => !gone.has(g.id)),
		...coming.map(
			(f): Gap => ({
				id: f.id,
				severity: SEVERITY_AS_GAP[f.severity],
				title: f.title,
				detail: '',
				sourceStep: 'evolution',
				blocking: f.severity === 'blocking',
				provenance: 'detected'
			})
		)
	];
	return {
		now: pickHeadline(coherenceHeadline(input.gaps)),
		after: pickHeadline(coherenceHeadline(after)),
		leaving,
		expectedToLeave,
		undecided,
		coming: coming.map((f) => ({ id: f.id, title: f.title }))
	};
}
