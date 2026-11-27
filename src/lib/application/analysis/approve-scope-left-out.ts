import type { ClockPort, SectionDraftRepositoryPort } from '../ports';
import { approveLeftOut, createEmptyScopeDraft, type ProjectScopeDraft, type ScopeApproval, type ScopeApprovalRefusal } from '$domain/scope';

/**
 * A person approves what the specification leaves out, as the list they were
 * shown stands (action Approve what the spec leaves out, criterion d16b352d).
 * Who and when come from the caller's session and the server's clock, never
 * from the request body. The approval is stored with the scope but leaves its
 * audit alone: it is not part of what the audit fingerprints.
 */
export class ApproveScopeLeftOutUseCase {
	constructor(
		private readonly scopes: SectionDraftRepositoryPort<ProjectScopeDraft>,
		private readonly clock: ClockPort
	) {}

	async execute(
		projectId: string,
		shown: string,
		by: string
	): Promise<{ ok: true; approval: ScopeApproval } | { ok: false; refusal: ScopeApprovalRefusal } | null> {
		const stored = (await this.scopes.load(projectId)) ?? createEmptyScopeDraft(projectId);
		const result = approveLeftOut(stored, shown, by, this.clock.nowIso());
		if (!result.ok) return result;
		const revision = await this.scopes.save(result.scope);
		return revision === null ? null : { ok: true, approval: result.approval };
	}
}
