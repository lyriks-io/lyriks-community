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

describe('the requirements document prints ONE list of criteria', () => {
	const leafIdOf = (env: SpecEnvelope) =>
		env.features.features.find((f) => f.name === 'Pay invoice')!.id;
	const docOf = (env: SpecEnvelope) =>
		composeArtifacts(env, analysis, '2026-07-15T00:00:00Z').find((a) => a.kind === 'requirements_doc')!;

	it('prints a criterion an AI client wrote, which the panel never held', () => {
		const env = envelope();
		const leafId = leafIdOf(env);
		env.features.leafMeta![leafId].acceptanceCriteria = [];
		env.acceptanceCriteriaByFeature = { [leafId]: ['A refused payment leaves the invoice overdue.'] };
		const doc = docOf(env);
		expect(doc.content).toContain('A refused payment leaves the invoice overdue.');
		expect(doc.content).toContain('Acceptance criteria');
	});

	it('does not print a projected criterion twice', () => {
		const env = envelope();
		const leafId = leafIdOf(env);
		env.acceptanceCriteriaByFeature = {
			[leafId]: ['Given an overdue invoice, when paid, then status is Paid.']
		};
		const doc = docOf(env);
		const printed = doc.content.split('- Given an overdue invoice, when paid, then status is Paid.').length - 1;
		expect(printed).toBe(1);
	});

	it('says nothing where the model holds nothing, rather than reprinting the draft', () => {
		const env = envelope();
		env.acceptanceCriteriaByFeature = { [leafIdOf(env)]: [] };
		expect(docOf(env).content).not.toContain('Given an overdue invoice, when paid');
	});

	it('falls back to the panel for a feature the model does not know', () => {
		const env = envelope();
		env.acceptanceCriteriaByFeature = {};
		expect(docOf(env).content).toContain('Given an overdue invoice, when paid, then status is Paid.');
	});
});

describe('the spec documents in a French spec', () => {
	const NB = ' ';
	const docsOf = (lang?: 'en' | 'fr') => {
		const env = envelope();
		env.identity.productName = 'Facturo';
		return composeArtifacts(env, analysis, '2026-07-15T00:00:00Z', lang);
	};

	it('writes every heading and fixed phrase in French, the authored text as written', () => {
		const docs = docsOf('fr');
		expect(docs.map((d) => d.title)).toEqual([
			'Spécification fonctionnelle',
			'Spécification technique',
			'Document des exigences produit',
			'Graphe de cohérence'
		]);
		const prd = docs.find((d) => d.kind === 'requirements_doc')!.content;
		expect(prd).toContain(`# Exigences produit${NB}: Facturo`);
		expect(prd).toContain('## Objectif');
		expect(prd).toContain('## Utilisateurs\n- (rien de déclaré)');
		expect(prd).toContain(`**Problème**${NB}: Cannot pay overdue invoices online.`);
		expect(prd).toContain("**Critères d'acceptation**\n- Given an overdue invoice, when paid, then status is Paid.");
		expect(prd).toContain(`**Dépend de**${NB}: Auth`);
		const functional = docs.find((d) => d.kind === 'functional_doc')!.content;
		expect(functional).toContain(`**Pay invoice**${NB}: Settle an overdue invoice.`);
		expect(functional).toContain('## Parcours utilisateur');
		expect(functional).toContain('## Règles et cas limites');
		const technical = docs.find((d) => d.kind === 'technical_doc')!.content;
		expect(technical).toContain('# Spécification technique');
		expect(technical).toContain('## Modèle de données');
		expect(technical).toContain('## Contraintes non négociables');
		expect(technical).not.toMatch(/Acceptance|Depends on|Given |none declared/);
	});

	it('keeps the English documents byte for byte by default', () => {
		const strip = (docs: ReturnType<typeof docsOf>) => docs.map(({ title, content }) => ({ title, content }));
		expect(strip(docsOf())).toEqual(strip(docsOf('en')));
		expect(docsOf().find((d) => d.kind === 'requirements_doc')!.content).toContain(
			'# Product requirements: Facturo'
		);
	});
});
