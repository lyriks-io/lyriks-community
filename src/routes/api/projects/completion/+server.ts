import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import { callerWorkspaceScope } from '$lib/server/workspace-scope.server';
import { mapLimit } from '$lib/shared/map-limit';
import type { RequestHandler } from './$types';

/**
 * Read-only portfolio audit. It deliberately returns compact summaries and
 * bounds concurrency because each whole-project assessment reads every gate.
 * Eight workers keep a typical existing portfolio below the MCP's 60-second
 * request timeout without opening an unbounded fan-out against PostgreSQL.
 */
export const GET: RequestHandler = async (event) => {
	const services = getServices();
	const [workspaceScope, domainScope] = await Promise.all([
		callerWorkspaceScope(event),
		callerAllowedDomains(event)
	]);
	const portfolio = await services.buildPortfolio.execute(
		workspaceScope,
		domainScope,
		event.locals.session?.email ?? null
	);
	const projects = [
		...portfolio.domains.flatMap((domain) => domain.projects),
		...portfolio.unassigned
	];
	const summaries = await mapLimit(projects, 8, async (project) => {
		const report = await services.assessProjectCompleteness.execute(project.id);
		return {
			projectId: project.id,
			name: project.name,
			status: report.status,
			score: report.score,
			canFinish: report.canFinish,
			auditFresh: report.auditFresh,
			blockerCount: report.issues.filter((issue) => issue.severity === 'blocking').length,
			blockers: report.issues
				.filter((issue) => issue.severity === 'blocking')
				.slice(0, 5)
				.map((issue) => issue.message)
		};
	});
	return json({
		projects: summaries,
		totals: {
			projects: summaries.length,
			completed: summaries.filter((summary) => summary.status === 'completed').length,
			ready: summaries.filter((summary) => summary.canFinish).length,
			blocked: summaries.filter((summary) => !summary.canFinish).length
		}
	});
};
