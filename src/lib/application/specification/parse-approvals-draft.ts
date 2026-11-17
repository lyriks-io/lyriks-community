import { createEmptyApprovalsDraft, isApprovalStatus, type ApprovalItem, type ProjectApprovalsDraft } from '$domain/approvals';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Anti-corruption parse for the Approvals draft (residue-backed). */
export function parseApprovalsDraft(input: unknown, projectId: string): ProjectApprovalsDraft {
	const base = createEmptyApprovalsDraft(projectId);
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	const items: ApprovalItem[] = [];
	const seen = new Set<string>();
	if (Array.isArray(src.items)) {
		for (const item of src.items) {
			if (!item || typeof item !== 'object') continue;
			const value = item as Record<string, unknown>;
			if (typeof value.id !== 'string' || value.id.length === 0 || seen.has(value.id)) continue;
			seen.add(value.id);
			items.push({
				id: value.id,
				title: str(value.title),
				area: str(value.area) || 'Whole specification',
				reviewer: str(value.reviewer),
				status: isApprovalStatus(value.status) ? value.status : 'draft',
				deadline: str(value.deadline),
				note: str(value.note)
			});
		}
	}
	return { ...base, projectId, items };
}
