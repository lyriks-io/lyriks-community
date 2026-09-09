import {
	createEdgeCase,
	createEmptyRulesDraft,
	createIssue,
	EDGE_OUTCOMES,
	isIssueKind,
	ISSUE_SEVERITIES,
	ISSUE_STATUSES,
	type ProjectRulesDraft
} from '$domain/rules';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 06 payloads. Same shape as the
 * sibling parsers: merge over defaults, pin projectId. `inventory` is NOT
 * trusted from the client — it is a read-only mirror recomputed server-side on
 * load — so we drop whatever arrives and let the load use-case refill it.
 */
export function parseRulesDraft(input: unknown, projectId: string): ProjectRulesDraft {
	const base = createEmptyRulesDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const str = (value: unknown): string => (typeof value === 'string' ? value : '');
	const nullable = (value: unknown): string | null =>
		typeof value === 'string' ? value : null;
	const strings = (value: unknown): string[] =>
		Array.isArray(value)
			? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
			: [];
	const issues = parseStableRecords(src.issues, 'issue', (record, id) =>
		createIssue({
			id,
			kind: isIssueKind(record.kind) ? record.kind : 'contradiction',
			title: str(record.title),
			detail: str(record.detail),
			severity: ISSUE_SEVERITIES.some((severity) => severity.code === record.severity)
				? (record.severity as ProjectRulesDraft['issues'][number]['severity'])
				: 'major',
			status: ISSUE_STATUSES.some((status) => status.code === record.status)
				? (record.status as ProjectRulesDraft['issues'][number]['status'])
				: 'open',
			ownerRoleId: nullable(record.ownerRoleId),
			resolutionNote: str(record.resolutionNote),
			relatedRuleIds: strings(record.relatedRuleIds),
			relatedFeatureId: nullable(record.relatedFeatureId),
			relatedJourneyId: nullable(record.relatedJourneyId),
			autoDetected: record.autoDetected === true,
			sourceIds: strings(record.sourceIds)
		})
	);
	const issueIds = new Set(issues.map((issue) => issue.id));
	const scenarios = parseStableRecords(src.scenarios, 'edge-case', (record, id) =>
		createEdgeCase({
			id,
			title: str(record.title),
			given: str(record.given),
			whenText: str(record.whenText),
			then: str(record.then),
			expectedOutcome: EDGE_OUTCOMES.some((outcome) => outcome.code === record.expectedOutcome)
				? (record.expectedOutcome as ProjectRulesDraft['scenarios'][number]['expectedOutcome'])
				: 'success',
			relatedIssueId:
				typeof record.relatedIssueId === 'string' && issueIds.has(record.relatedIssueId)
					? record.relatedIssueId
					: null,
			relatedJourneyId: nullable(record.relatedJourneyId),
			covered: record.covered === true,
			sourceIds: strings(record.sourceIds)
		})
	);

	return {
		...base,
		projectId,
		issues,
		scenarios,
		inventory: [] // refilled by LoadRulesDraftUseCase
	};
}
