import type { AddElaborationItem, ElaborationInput, ElaborationReport, ElaborationItem } from './report';
import { elaborationQuestions } from './questions';
import { elaborationFeatureActions } from './feature-actions';
import { fingerprint } from '../scope';

/** A prioritized elaboration aid, never a replacement for the completion gate. */
export function analyzeElaboration(input: ElaborationInput): ElaborationReport {
	const items = new Map<string, ElaborationItem>();
	const add: AddElaborationItem = (code, item) => {
		const id = `${code}:${item.section}:${item.path}`;
		items.set(id, { ...item, id, blockedBy: item.blockedBy ?? [], authority: 'proposal' });
	};
	for (const section of input.unavailable) add('reading-unavailable', {
		kind: 'action', priority: 1, section, path: '', requiresUserDecision: false,
		observation: 'This reading was unavailable; its content is unknown, not empty.',
		prompt: 'Retry this reading before concluding that the section is missing or complete.'
	});
	elaborationQuestions(input, add);
	elaborationFeatureActions(input, add);
	if (input.scope && input.features) {
		const featureIds = new Set(input.features.features.map(f => f.id));
		for (const capability of input.scope.capabilities.filter(c => c.disposition === 'included')) {
			if (!capability.featureIds.length || capability.featureIds.some(id => !featureIds.has(id))) add('scope-mapping', {
				kind: 'action', priority: 2, section: 'scope', subjectId: capability.id,
				path: `capabilities.${capability.id}.featureIds`, requiresUserDecision: false,
				observation: 'An included capability is not mapped exclusively to existing leaf features.',
				prompt: 'Author the missing feature or repair the capability mapping; do not remove the requirement to clear the gap.'
			});
		}
	}
	for (const issue of input.completion?.issues ?? []) {
		const covered: Record<string, string> = { 'scope-mode-unclassified': 'scope-mode:', 'scope-empty': 'scope-inventory:', 'capability-unresolved': 'scope-disposition:', 'full-product-omission': 'scope-omission:' };
		if (covered[issue.code] && [...items.values()].some(item => item.id.startsWith(covered[issue.code]) && item.path === issue.path)) continue;
		const prefix = issue.path.split('.')[0];
		const section = ['data', 'documents', 'experience', 'coherence'].includes(prefix) ? prefix : 'scope';
		add(`completion-${issue.code}-${fingerprint(issue.message)}`, {
			kind: 'action', priority: issue.code.startsWith('audit') ? 3 : issue.severity === 'blocking' ? 2 : 3,
			section, path: section === 'scope' ? issue.path : issue.path.slice(prefix.length).replace(/^\./, ''), observation: issue.message,
			prompt: 'Inspect this completion finding in assess_project_completeness and fix its source. Audit only after the underlying changes are complete.',
			requiresUserDecision: issue.code.includes('approv') || issue.code.includes('omission')
		});
	}
	const ordered = [...items.values()].sort((a, b) => a.priority - b.priority || Number(a.blockedBy.length > 0) - Number(b.blockedBy.length > 0) || a.id.localeCompare(b.id));
	return {
		items: ordered,
		counts: { questions: ordered.filter(i => i.kind === 'question').length, actions: ordered.filter(i => i.kind === 'action').length, awaitingDependencies: ordered.filter(i => i.blockedBy.length > 0).length },
		completion: input.completion ? { status: input.completion.status, canFinish: input.completion.canFinish, auditFresh: input.completion.auditFresh } : null,
		limitations: [
			'Deterministic checks of recorded structure, not semantic understanding of every sentence in the brief.',
			'Authored content is not proof of user confirmation. Recommendations remain proposals; never infer an approval or settle a decision automatically.',
			'An empty question list does not prove completeness. Full verification is optional and runtime acceptance tests are not run here.',
			'Feature dependencies use recorded workflow status, not a proof of implementation or runtime correctness.'
		]
	};
}
