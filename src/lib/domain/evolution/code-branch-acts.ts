import type { ActContext, ActOutcome } from './acts';
import type { EvolutionRequest, HistoryEntry } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';
import { record } from './history';
import { canCloseRequest } from './lifecycle';
import {
	codeReportRefusal,
	codeReportSummary,
	deploymentBranchRefusal,
	mergeRefusal,
	shortSha,
	validationRefusal,
	bringsCode,
	withCodeReport,
	withMerge,
	withValidatedCommit,
	type CodeReport,
	type MergeReport
} from './code-branch';

/**
 * The acts of feat-evo-code-branch on a request: what the person's AI reports
 * of git, the commit a validation fixes, and the merge that declares the change
 * live. Each one is refused with the sentence the spec wrote.
 */

const stamp = (ctx: ActContext, request: EvolutionRequest, type: HistoryEntry['type'], summary: string): EvolutionRequest =>
	record(request, { id: ctx.newId(), type, summary, actor: ctx.actor, at: ctx.at });

/** A person names or changes the project's deployment branch (ac-evo-branch-setting). */
export function deploymentBranchAllowed(ctx: ActContext, branch: string): Guarded {
	return firstRefusal(
		guard(ctx.actor.kind !== 'person', 'Only a person sets the deployment branch.', 'Where the project deploys from is a decision on the project.'),
		guard(ctx.actor.role === 'viewer', 'Only who may edit the project sets its deployment branch.', 'Changing where the project deploys from changes every request\'s branch.'),
		deploymentBranchRefusal(branch)
	);
}

/** The AI reports where the request's code stands at an index sync (ac-evo-branch-state, ac-evo-branch-derived). */
export function reportCodeStateAct(ctx: ActContext, request: EvolutionRequest, deploymentBranch: string, expectedBranch: string, report: CodeReport): ActOutcome {
	const allowed = codeReportRefusal(request, deploymentBranch, expectedBranch, report);
	if (!allowed.ok) return allowed;
	const moved = withCodeReport(request.code, report, ctx.at);
	const said = codeReportSummary(moved.code, request.code, deploymentBranch, moved);
	const next = { ...request, code: moved.code };
	return { ok: true, request: said ? stamp(ctx, next, 'code_commit', said) : next, summary: said ?? `${report.branch} at ${shortSha(report.codeHead)}: nothing moved` };
}

/** Whether the verification can be validated, read on the code (ac-evo-branch-validate). */
export const verificationCodeRefusal = (request: EvolutionRequest, deploymentBranch: string): Guarded => validationRefusal(request.code, deploymentBranch, bringsCode(request));

/** The crossing that validated the verification fixes the commit it validated, and says so on the timeline. */
export function withValidation(ctx: ActContext, request: EvolutionRequest): EvolutionRequest {
	if (!request.code) return request;
	const code = withValidatedCommit(request.code, ctx.actor.id, ctx.at);
	return stamp(ctx, { ...request, code }, 'code_commit', `Verification validated on ${code.branch}@${shortSha(code.codeHead)}`);
}

/**
 * The merge of the validated commit into the deployment branch declares the
 * change live (ac-evo-branch-merge): the caller lands the drafts first, then
 * this closes the request with its deployment, at the same moment, keeping the
 * code the branch brought as the new reference (ac-evo-branch-not-outside).
 */
export function declareByMergeAct(
	ctx: ActContext,
	request: EvolutionRequest,
	deploymentBranch: string,
	merge: MergeReport,
	brought: Readonly<Record<string, string>> = {}
): ActOutcome {
	const allowed = firstRefusal(mergeRefusal(request, deploymentBranch, merge), canCloseRequest(request));
	if (!allowed.ok) return allowed;
	const code = withMerge(request.code!, merge, ctx.at, brought);
	const summary = `Declared live by its merge into ${merge.into}@${shortSha(merge.mergeCommit)} (validated ${shortSha(code.validated?.commit)})`;
	return {
		ok: true,
		request: stamp(
			ctx,
			{ ...request, code, status: 'closed', deployment: { releaseId: null, note: summary, declaredBy: ctx.actor.id, declaredAt: ctx.at } },
			'stage_crossing',
			summary
		),
		summary
	};
}
