import { fingerprint } from './fingerprint';
import type { ProjectScopeDraft, ScopeApproval, ScopeCapability } from './draft';

/**
 * Where the approval of what the specification leaves out stands (criterion
 * d16b352d): `none` while nobody approved it, `current` while the list is the
 * one a person approved, `changed` once it moved since.
 */
export type ScopeApprovalState = 'none' | 'current' | 'changed';

/** The answer an AI client gets: only a person approves what an AI left out. */
export const SCOPE_APPROVAL_AI_REFUSAL =
	'Only a person approves what the specification leaves out: ask them to open the out of scope link on the Overview.';

/** Why an approval is refused once the caller may give one (rules 3b446bde, d7123798, 366e1c69). */
export const SCOPE_APPROVAL_REFUSALS = {
	nothing: 'Nothing is left out: there is nothing to approve.',
	already: 'Already approved as it stands.',
	changed: 'The list changed since you opened it. Read it again, then approve it.'
} as const;

export type ScopeApprovalRefusal = keyof typeof SCOPE_APPROVAL_REFUSALS;

const isLeftOut = (c: ScopeCapability) => c.disposition === 'excluded' || c.disposition === 'deferred';

/** The capabilities the scope leaves out; full-product mode leaves none out. */
export function leftOutCapabilities(scope: ProjectScopeDraft): ScopeCapability[] {
	return scope.mode === 'full_product' ? [] : scope.capabilities.filter(isLeftOut);
}

/**
 * The fingerprint of what a person approves: each capability left out, its
 * disposition and its reason. Its group, the group summaries, the covers
 * sentence and the decision are how the list reads, not what it decides, so
 * they leave it as it is.
 */
export function leftOutFingerprint(scope: ProjectScopeDraft): string {
	return fingerprint(
		leftOutCapabilities(scope)
			.map((c) => [c.id, c.disposition, c.rationale.trim()])
			.sort((a, b) => a[0].localeCompare(b[0]))
	);
}

export function scopeApprovalState(scope: ProjectScopeDraft): ScopeApprovalState {
	const approval = scope.boundary.approval;
	if (!approval) return 'none';
	return approval.leftOut === leftOutFingerprint(scope) ? 'current' : 'changed';
}

/**
 * A person approves the list they were shown (`shown`, its fingerprint as the
 * drawer read it). Refused when nothing is left out, when it is approved as it
 * stands already, or when the list moved since the drawer opened.
 */
export function approveLeftOut(
	scope: ProjectScopeDraft,
	shown: string,
	by: string,
	at: string
): { ok: true; scope: ProjectScopeDraft; approval: ScopeApproval } | { ok: false; refusal: ScopeApprovalRefusal } {
	if (leftOutCapabilities(scope).length === 0) return { ok: false, refusal: 'nothing' };
	if (scopeApprovalState(scope) === 'current') return { ok: false, refusal: 'already' };
	const leftOut = leftOutFingerprint(scope);
	if (shown !== leftOut) return { ok: false, refusal: 'changed' };
	const approval: ScopeApproval = { by, at, leftOut };
	return { ok: true, approval, scope: { ...scope, boundary: { ...scope.boundary, approval } } };
}
