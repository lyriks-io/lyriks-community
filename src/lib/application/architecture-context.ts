import { architectureStage, type ProjectArchitectureDraft } from '$domain/architecture';
import { sourceAccess, type ProjectDocumentsDraft } from '$domain/documents';

/** Faithful projection of authored decisions. Never infers a stack or fetches source URLs. */
export function architectureContext(architecture: ProjectArchitectureDraft, documents: ProjectDocumentsDraft): string {
	const stage = architectureStage(architecture);
	const lines = [
		'## Architecture',
		'Stage: ' + stage,
		stage === 'logical'
			? 'Logical design only: technology selection is not settled.'
			: 'Implementation decisions: use accepted sources; unresolved references need a decision.'
	];
	const sourceIds = new Set(architecture.sourceIds);
	for (const component of architecture.techChoices) {
		lines.push('- [' + component.layer + '] ' + (component.name || '(unnamed)') + ': ' + component.role);
		if (component.description) lines.push('  ' + component.description);
		if (component.version) lines.push('  Authored version: ' + component.version);
		if (component.referenceDocId) sourceIds.add(component.referenceDocId);
		else lines.push('  No decision source linked.');
	}
	for (const id of sourceIds) {
		const source = documents.sources.find((row) => row.id === id);
		if (!source) {
			lines.push('### Unresolved source: ' + id);
			continue;
		}
		lines.push('### ' + (source.title || id) + ' [' + id + ']');
		lines.push('Decision: ' + (source.decision?.status ?? 'not specified') + '; access: ' + sourceAccess(source));
		if (source.url) lines.push('Reference (not fetched): ' + source.url);
		if (source.note) lines.push(source.note);
		if (!source.note) lines.push('No embedded decision content. Consult the reference before implementing.');
		if (source.evidence) {
			const e = source.evidence;
			lines.push('Reported test evidence (not independently verified): ' + e.kind + ' / ' + e.result,
				'Build: ' + e.buildId + '; artifact: ' + e.artifact,
				'Observed: ' + e.observedAt + '; provenance: ' + e.provenance,
				'Command: ' + e.command, 'Criteria: ' + e.criterionIds.join(', '));
		}
	}
	for (const c of architecture.constraints) lines.push('- Constraint: ' + c.title + ': ' + c.detail);
	return lines.join('\n');
}
