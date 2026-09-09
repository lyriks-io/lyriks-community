import { describe, it, expect } from 'vitest';
import { composeArtifacts, type SpecEnvelope } from './compose-specs';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyDefinitionDraft } from '$domain/foundation';
import { createEmptyUsersDraft } from '$domain/users';
import { createEmptyFeaturesDraft, createCore, createFeature } from '$domain/features';
import { createEmptyExperienceDraft } from '$domain/experience';
import { createEmptyRulesDraft } from '$domain/rules';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createDocumentSource, createEmptyDocumentsDraft } from '$domain/documents';
import type { CoherenceAnalysis } from '$domain/coherence';

const PID = 'proj';
const analysis: CoherenceAnalysis = { dimensions: [], gaps: [], readinessScore: 90 };

function envelope(): SpecEnvelope {
	const features = createEmptyFeaturesDraft(PID);
	const core = createCore({ name: 'Payments' });
	const dep = createFeature(core.id, null, { name: 'Auth' });
	const leaf = createFeature(core.id, null, { name: 'Pay invoice', description: 'Settle an overdue invoice.' });
	features.cores = [core];
	features.features = [dep, leaf];
	features.leafMeta = {
		[leaf.id]: {
			problem: 'Cannot pay overdue invoices online.',
			acceptanceCriteria: [{ id: 'ac1', text: 'Given an overdue invoice, when paid, then status is Paid.' }],
			dependsOn: [dep.id],
			sourceIds: ['source-1'],
			sourceLink: 'Stakeholder note'
		}
	};
	const documents = createEmptyDocumentsDraft(PID);
	documents.sources = [
		createDocumentSource({
			id: 'source-1',
			title: 'Customer interview',
			url: 'https://example.com/interview'
		})
	];
	return {
		identity: createEmptyIdentityDraft(PID),
		definition: createEmptyDefinitionDraft(PID),
		users: createEmptyUsersDraft(PID),
		documents,
		features,
		experience: createEmptyExperienceDraft(PID),
		rules: createEmptyRulesDraft(PID),
		data: createEmptyDataDraft(PID),
		architecture: createEmptyArchitectureDraft(PID)
	};
}

describe('composeArtifacts — requirements document', () => {
	it('emits a requirements_doc artifact', () => {
		const arts = composeArtifacts(envelope(), analysis, '2026-07-15T00:00:00Z');
		expect(arts.map((a) => a.kind)).toContain('requirements_doc');
	});

	it('folds in the leaf metadata (acceptance criteria, dependency name, source)', () => {
		const doc = composeArtifacts(envelope(), analysis, '2026-07-15T00:00:00Z').find(
			(a) => a.kind === 'requirements_doc'
		)!;
		expect(doc.content).toContain('Pay invoice');
		expect(doc.content).toContain('Acceptance criteria');
		expect(doc.content).toContain('Given an overdue invoice, when paid, then status is Paid.');
		// Dependency renders by feature NAME, not id.
		expect(doc.content).toContain('**Depends on**: Auth');
		expect(doc.content).toContain('https://example.com/interview');
		expect(doc.content).toContain('Customer interview');
		expect(doc.content).toContain('Stakeholder note');
	});
});
