import { leftOutCapabilities, leftOutFingerprint, scopeApprovalState, type ProjectScopeDraft, type ScopeApprovalState, type ScopeCapability } from '$domain/scope';

/** The group a left-out capability that names none reads under. */
export const OTHER_GROUP = 'Other';

export interface LeftOutCapability {
	id: string;
	name: string;
	/** Deferred rather than excluded: it reads "later". */
	later: boolean;
	/** Its own reason; empty when the group's shared reason says it. */
	reason: string;
}

export interface LeftOutGroup {
	name: string;
	summary: string;
	/** The reason every capability of the group gives, read once under the group; null when they differ. */
	sharedReason: string | null;
	items: LeftOutCapability[];
}

export interface ScopeBoundaryView {
	covers: string;
	/** How many capabilities the specification covers (included). */
	coveredCount: number;
	/** Full-product mode allows no exclusion: the frame says it leaves nothing out. */
	fullProduct: boolean;
	leftOut: LeftOutGroup[];
	leftOutCount: number;
	decision: string;
	decidedAt: string | null;
	/** Where the person's approval of the list stands (criterion d16b352d); who gave it last and when. */
	approval: { state: ScopeApprovalState; by: string; at: string } | null;
	/** The fingerprint of the list as shown: an approval sends it back, so a list rewritten meanwhile is refused. */
	shown: string;
}

/**
 * Where the specification stops, as the Scope drawer reads
 * it (criteria 3b04797c, 9424a65d): the boundary sentence and how many
 * capabilities are covered, then what is left out by group, the largest first
 * and Other last, each capability with its reason unless the whole group shares
 * one. Null when nothing is classified yet: the frame is then left out.
 */
export function scopeBoundaryView(scope: ProjectScopeDraft): ScopeBoundaryView | null {
	const { boundary, capabilities, mode } = scope;
	if (mode === 'unclassified' && capabilities.length === 0 && !boundary.covers) return null;
	const fullProduct = mode === 'full_product';
	const out = leftOutCapabilities(scope);
	const summaries = new Map(boundary.groups.map((g) => [g.name, g.summary]));
	const byGroup = new Map<string, ScopeCapability[]>();
	for (const capability of out) {
		const name = capability.group || OTHER_GROUP;
		byGroup.set(name, [...(byGroup.get(name) ?? []), capability]);
	}
	const groups = [...byGroup.entries()].map(([name, members]): LeftOutGroup => {
		const reasons = new Set(members.map((c) => c.rationale.trim()));
		const shared = reasons.size === 1 ? [...reasons][0] : '';
		return {
			name,
			summary: summaries.get(name) ?? '',
			sharedReason: shared || null,
			items: members.map((c) => ({ id: c.id, name: c.name || c.id, later: c.disposition === 'deferred', reason: shared ? '' : c.rationale.trim() }))
		};
	});
	groups.sort((a, b) => Number(a.name === OTHER_GROUP) - Number(b.name === OTHER_GROUP) || b.items.length - a.items.length || a.name.localeCompare(b.name));
	return {
		covers: boundary.covers,
		coveredCount: capabilities.filter((c) => c.disposition === 'included').length,
		fullProduct,
		leftOut: groups,
		leftOutCount: out.length,
		decision: boundary.decision,
		decidedAt: boundary.decidedAt,
		approval: approvalOf(scope, out.length),
		shown: leftOutFingerprint(scope)
	};
}

/** Nothing to approve when nothing is left out; otherwise its state, with who approved it last. */
function approvalOf(scope: ProjectScopeDraft, leftOutCount: number): ScopeBoundaryView['approval'] {
	if (leftOutCount === 0) return null;
	const given = scope.boundary.approval;
	return { state: scopeApprovalState(scope), by: given?.by ?? '', at: given?.at ?? '' };
}
