import { describe, expect, it } from 'vitest';
import type { CallerReach } from '$application/portfolio/project-visibility';
import { assemblePortfolio, type ProjectCard } from '$domain/portfolio';
import type { CompletionIssue, ProjectCompletionReport } from '$domain/scope/completeness';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { GET } from './+server';

/**
 * The portfolio audit an AI client reads (assess every project at once): it
 * audits the projects the caller's portfolio shows, which is scoped by what
 * the caller reaches, and sums up each one by its blocking issues only.
 */

const card = (id: string, domainId: string | null): ProjectCard => ({
	id,
	name: id.toUpperCase(),
	description: '',
	domainId,
	stage: 'ideation',
	coverageScore: 0,
	maturityScore: 0,
	readinessScore: 0,
	coherenceScore: 100,
	openIncoherences: 0,
	featureCount: 0,
	evolutionsInProgress: 0,
	lastSavedAt: null,
	sourceMode: null
});

const issue = (severity: CompletionIssue['severity'], message: string): CompletionIssue => ({ code: message, severity, message, path: '' });

const report = (projectId: string, over: Partial<ProjectCompletionReport>): ProjectCompletionReport => ({
	projectId,
	status: 'blocked',
	score: 40,
	coverageScore: 40,
	canFinish: false,
	auditFresh: true,
	coverage: { totalCapabilities: 0, includedCapabilities: 0, resolvedCapabilities: 0, assessedSections: 0, totalSections: 0 },
	checks: [],
	issues: [],
	...over
});

const REACH: CallerReach = { email: 'ada@example.test', workspaces: new Map(), activeId: null };

function audit(reports: Record<string, ProjectCompletionReport>) {
	const portfolioReach: (CallerReach | null)[] = [];
	const assessed: string[] = [];
	const services = servicesWith({
		enterpriseHooks: { callerReach: async () => REACH },
		buildPortfolio: {
			execute: async (reach) => {
				portfolioReach.push(reach ?? null);
				return assemblePortfolio([{ id: 'fin', name: 'Finance', description: '', icon: '', createdAt: '', position: null }], [card('ledger', 'fin'), card('loose', null)]);
			}
		},
		assessProjectCompleteness: {
			execute: async (projectId) => {
				assessed.push(projectId);
				return reports[projectId];
			}
		}
	});
	const event = requestEvent({ path: '/api/projects/completion', authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
	return { answer: Promise.resolve(GET(event)).then((r) => r.json()), portfolioReach, assessed };
}

describe('the portfolio audit', () => {
	it('audits the projects of the portfolio the caller reaches, filed or not, and only those', async () => {
		const { answer, portfolioReach, assessed } = audit({
			ledger: report('ledger', {}),
			loose: report('loose', {})
		});
		await answer;
		expect(portfolioReach).toEqual([REACH]);
		expect(assessed.sort()).toEqual(['ledger', 'loose']);
	});

	it('sums each project up by its blocking issues alone, quoting the first five', async () => {
		const blocking = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((m) => issue('blocking', m));
		const { answer } = audit({
			ledger: report('ledger', { issues: [issue('warning', 'w1'), ...blocking, issue('warning', 'w2')] }),
			loose: report('loose', { status: 'completed', score: 100, canFinish: true })
		});
		const body = await answer;
		expect(body.projects).toContainEqual({ projectId: 'ledger', name: 'LEDGER', status: 'blocked', score: 40, canFinish: false, auditFresh: true, blockerCount: 6, blockers: ['b1', 'b2', 'b3', 'b4', 'b5'] });
		expect(body.projects).toContainEqual(expect.objectContaining({ projectId: 'loose', blockerCount: 0, blockers: [] }));
		expect(body.totals).toEqual({ projects: 2, completed: 1, ready: 1, blocked: 1 });
	});
});
