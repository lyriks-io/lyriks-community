import type { AddElaborationItem, ElaborationInput } from './report';
import { shortLabel } from './report';

/** Ask only about an observable omission or explicit unresolved disposition. */
export function elaborationQuestions(input: ElaborationInput, add: AddElaborationItem): void {
	const question = (code: string, section: string, path: string, observation: string, prompt: string, subjectId?: string) =>
		add(code, { kind: 'question', priority: 1, section, path, observation, prompt, subjectId, requiresUserDecision: true });
	if (input.foundation) {
		const { identity, definition } = input.foundation;
		if (!identity.brief.trim()) question('brief-missing', 'foundation', 'identity.brief', 'No project brief is recorded.', 'Who is this product for, what problem should it solve, and what should remain out of scope?');
		const objective = definition.businessObjective;
		if (!objective.expectedOutcome.trim()) question('outcome-missing', 'foundation', 'definition.businessObjective.expectedOutcome', 'The expected user or business outcome is not recorded.', 'What observable outcome would make this project worthwhile?');
		if (!objective.successCriteria.some(s => s.trim())) question('success-missing', 'foundation', 'definition.businessObjective.successCriteria', 'No success criterion is recorded.', 'What observable result will demonstrate success, and under which conditions?');
		if (!objective.failureCriteria.some(s => s.trim())) question('failure-missing', 'foundation', 'definition.businessObjective.failureCriteria', 'No failure criterion is recorded.', 'Which unacceptable outcome must the product prevent, including interruption or recovery?');
	}
	if (input.users && input.users.roles.length === 0) question('audience-missing', 'users', 'roles', 'No user role is recorded.', 'Who will use the product, and do any users need different permissions or workflows?');
	if (!input.scope) return;
	const scope = input.scope;
	if (scope.mode === 'unclassified') question('scope-mode', 'scope', 'mode', 'The authoring scope is unclassified.', 'Should this effort cover the full product, a selected scope, or a prototype? Preserve the requested scope; do not downgrade it to improve a score.');
	if (scope.capabilities.length === 0) question('scope-inventory', 'scope', 'capabilities', 'No external capability inventory is recorded.', 'Which capabilities are required by the brief or supplied sources, independently of what has already been modeled?');
	for (const capability of scope.capabilities) {
		const label = shortLabel(capability.name || capability.id);
		const path = `capabilities.${capability.id}`;
		if (capability.disposition === 'unresolved') question('scope-disposition', 'scope', path, `The disposition of "${label}" is unresolved.`, 'Should this capability be included, excluded, or deferred, and why?', capability.id);
		else if (['excluded', 'deferred'].includes(capability.disposition) && (scope.mode === 'full_product' || !capability.rationale.trim() || !capability.approvalId)) {
			question('scope-omission', 'scope', path, `"${label}" is ${capability.disposition} without a compatible, documented scope decision.`, 'Confirm the intended scope and record the rationale and required approval. Do not manufacture approval or change scope automatically.', capability.id);
		}
	}
}
