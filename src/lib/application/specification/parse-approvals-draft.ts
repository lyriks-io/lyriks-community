import { createEmptyApprovalsDraft, isApprovalStatus, type ApprovalDecider, type ApprovalItem, type ProjectApprovalsDraft } from '$domain/approvals';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A stamp as the server stored it: the person of the session that moved the status, and when. */
function storedDecider(v: unknown): ApprovalDecider | null {
	if (!v || typeof v !== 'object') return null;
	const { id, name } = v as Record<string, unknown>;
	return typeof id === 'string' && id.length > 0 && typeof name === 'string' ? { id, name } : null;
}

/**
 * Anti-corruption parse for the Approvals draft a caller sends (PUT /api/draft/approvals, MCP): who set a status
 * and when are never taken from it (criterion 1f20ef7c); the server stamps them on save (stampDecisions).
 */
export function parseApprovalsDraft(input: unknown, projectId: string): ProjectApprovalsDraft {
	return parse(input, projectId, false);
}

/**
 * The Approvals draft read back from storage: the stamps the server wrote are kept, so a card still reads who set
 * its status and when after a reload, and the next save copies them for the rows it does not move (criterion f89af5b5).
 */
export function parseStoredApprovalsDraft(input: unknown, projectId: string): ProjectApprovalsDraft {
	return parse(input, projectId, true);
}

function parse(input: unknown, projectId: string, keepStamps: boolean): ProjectApprovalsDraft {
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
				note: str(value.note),
				// Stamped by the server on save (stampDecisions): kept from storage, never taken from a caller.
				decidedBy: keepStamps ? storedDecider(value.decidedBy) : null,
				decidedAt: keepStamps && typeof value.decidedAt === 'string' && value.decidedAt ? value.decidedAt : null
			});
		}
	}
	return { ...base, projectId, items };
}
