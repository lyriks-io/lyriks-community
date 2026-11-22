import { describe, expect, it } from 'vitest';
import { createEmptyIdentityDraft, createEmptyDefinitionDraft, createEmptyOperationsDraft } from '../foundation';
import { createEmptyFeaturesDraft, createFeature } from '../features';
import { createEmptyScopeDraft, createScopeCapability } from '../scope';
import { createEmptyUsersDraft } from '../users';
import { analyzeElaboration } from './analyze';
import type { ElaborationInput } from './report';
import type { ProjectCompletionReport } from '../scope';

function input(): ElaborationInput {
	return { foundation: { projectId: 'p', identity: createEmptyIdentityDraft('p'), definition: createEmptyDefinitionDraft('p'), operations: createEmptyOperationsDraft('p') }, scope: createEmptyScopeDraft('p'), users: createEmptyUsersDraft('p'), features: createEmptyFeaturesDraft('p'), completion: null, acceptanceCriteriaByFeature: null, buildStatusByFeature: {}, unavailable: [] };
}

describe('project elaboration', () => {
	it('keeps multiple completion findings at the same path and routes them to their owner', () => {
		const data = input();
		data.completion = { status: 'blocked', canFinish: false, auditFresh: false, issues: [
			{ code: 'data-entity-unrelated', path: 'data.entities', severity: 'warning', message: 'Entity A has no relation' },
			{ code: 'data-entity-unrelated', path: 'data.entities', severity: 'warning', message: 'Entity B has no relation' },
			{ code: 'scope-mode-unclassified', path: 'mode', severity: 'blocking', message: 'Choose scope' }
		] } as ProjectCompletionReport;
		const report = analyzeElaboration(data);
		expect(report.items.filter(i => i.section === 'data')).toHaveLength(2);
		expect(report.items.filter(i => i.section === 'data').every(i => i.path === 'entities')).toBe(true);
		expect(report.items.filter(i => i.path === 'mode')).toHaveLength(1);
	});

	it('gives a completion finding the same id whatever language its message reads in', () => {
		const withMessages = (a: string, b: string) => {
			const data = input();
			data.completion = { status: 'blocked', canFinish: false, auditFresh: false, issues: [
				{ code: 'data-entity-unrelated', path: 'data.entities', severity: 'warning', message: a },
				{ code: 'data-entity-unrelated', path: 'data.entities', severity: 'warning', message: b }
			] } as ProjectCompletionReport;
			return analyzeElaboration(data).items.filter(i => i.section === 'data').map(i => i.id);
		};
		const english = withMessages('Entity A has no relation', 'Entity B has no relation');
		const french = withMessages("L'entité A n'a aucune relation", "L'entité B n'a aucune relation");
		expect(new Set(english).size).toBe(2);
		expect(french).toEqual(english);
	});

	it('prioritizes unanswered product decisions with exact paths and proposal authority', () => {
		const report = analyzeElaboration(input());
		expect(report.items.find(i => i.id.startsWith('brief-missing'))).toMatchObject({ kind: 'question', priority: 1, section: 'foundation', path: 'identity.brief', requiresUserDecision: true, authority: 'proposal' });
		expect(report.completion).toBeNull();
		expect(report.counts.questions).toBe(7);
	});
	it('does not repeat questions for recorded answers or claim those answers were human-approved', () => {
		const data = input();
		data.foundation!.identity.brief = 'A document editor';
		data.foundation!.definition.businessObjective.expectedOutcome = 'Publish a readable document';
		const report = analyzeElaboration(data);
		expect(report.items.some(i => i.id.startsWith('brief-missing') || i.id.startsWith('outcome-missing'))).toBe(false);
		expect(report.limitations.join(' ')).toContain('not proof of user confirmation');
	});
	it('treats unavailable readings as unknown, not missing data', () => {
		const report = analyzeElaboration({ foundation: null, scope: null, users: null, features: null, completion: null, acceptanceCriteriaByFeature: null, buildStatusByFeature: null, unavailable: ['foundation'] });
		expect(report.items).toHaveLength(1);
		expect(report.items[0]).toMatchObject({ kind: 'action', requiresUserDecision: false });
		expect(report.items[0].observation).toContain('unknown, not empty');
	});
	it('flags full-product omissions without downgrading the requested scope', () => {
		const data = input();
		data.scope!.mode = 'full_product';
		data.scope!.capabilities.push(createScopeCapability('cap', { name: 'Export', disposition: 'deferred', rationale: 'Later', approvalId: 'approval' }));
		const before = structuredClone(data);
		expect(analyzeElaboration(data).items.find(i => i.id.startsWith('scope-omission'))?.requiresUserDecision).toBe(true);
		expect(data).toEqual(before);
	});
	it('identifies missing feature mappings and acceptance criteria independently', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'f', name: 'Export' }));
		data.scope!.capabilities.push(createScopeCapability('cap', { disposition: 'included', featureIds: ['missing'] }));
		const report = analyzeElaboration(data);
		expect(report.items.some(i => i.id.startsWith('scope-mapping'))).toBe(true);
		expect(report.items.find(i => i.id.startsWith('feature-acceptance'))?.path).toBe('leafMeta.f.acceptanceCriteria');
	});
	it('stops asking for a criterion once the model holds one, whoever wrote it', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'f', name: 'Export' }));
		// Nothing in the panel, one criterion an AI client wrote through the model.
		data.acceptanceCriteriaByFeature = { f: 1 };
		const report = analyzeElaboration(data);
		expect(report.items.some(i => i.id.startsWith('feature-acceptance'))).toBe(false);
	});
	it('asks again when the model knows the feature and it holds no criterion', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'f', name: 'Export' }));
		data.features!.leafMeta = { f: { acceptanceCriteria: [{ id: 'x', text: 'Stale, deleted since' }] } };
		data.acceptanceCriteriaByFeature = { f: 0 };
		const report = analyzeElaboration(data);
		expect(report.items.find(i => i.id.startsWith('feature-acceptance'))?.path).toBe('leafMeta.f.acceptanceCriteria');
	});
	it('falls back to the panel for a feature the model does not know yet', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'f', name: 'Export' }));
		data.features!.leafMeta = { f: { acceptanceCriteria: [{ id: 'x', text: 'Written here, never saved' }] } };
		data.acceptanceCriteriaByFeature = {};
		const report = analyzeElaboration(data);
		expect(report.items.some(i => i.id.startsWith('feature-acceptance'))).toBe(false);
	});
	it('keeps dependent implementation work blocked while independent work can proceed', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'a', name: 'Import' }), createFeature('core', null, { id: 'b', name: 'Export' }));
		data.features!.leafMeta = { b: { dependsOn: ['a'] } };
		data.buildStatusByFeature = { a: 'in-progress', b: 'in-progress' };
		const work = analyzeElaboration(data).items.filter(i => i.id.startsWith('feature-work'));
		expect(work.map(i => i.subjectId)).toEqual(['a', 'b']);
		expect(work[1].blockedBy).toEqual(['a']);
		// The code holds all of a: it asks no work and blocks nothing any more.
		data.buildStatusByFeature = { a: 'done', b: 'in-progress' };
		const after = analyzeElaboration(data).items.filter(i => i.id.startsWith('feature-work'));
		expect(after.map(i => i.subjectId)).toEqual(['b']);
		expect(after[0].blockedBy).toEqual([]);
	});
	it('claims no work when the code coverage could not be read', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'a', name: 'Import' }));
		data.buildStatusByFeature = null;
		expect(analyzeElaboration(data).items.some(i => i.id.startsWith('feature-work'))).toBe(false);
	});
	it('flags invalid and self dependencies without manufacturing completion evidence', () => {
		const data = input();
		data.features!.features.push(createFeature('core', null, { id: 'a' }));
		data.features!.leafMeta = { a: { dependsOn: ['a', 'unknown'] } };
		const report = analyzeElaboration(data);
		expect(report.items.filter(i => i.id.startsWith('feature-dependency'))).toHaveLength(2);
		expect(report.completion).toBeNull();
	});
	it('has stable ordering and never edits the input', () => {
		const data = input();
		const before = structuredClone(data);
		expect(analyzeElaboration(data)).toEqual(analyzeElaboration(data));
		expect(data).toEqual(before);
	});
});

describe('project elaboration in French (spec language)', () => {
	const NB = ' ';
	it('asks its questions in French, quoting names, with ids and paths unchanged', () => {
		const data = input();
		data.scope!.capabilities.push(createScopeCapability('cap-1', { name: 'Export', disposition: 'unresolved' }));
		const report = analyzeElaboration(data, 'fr');
		expect(report.items.find(i => i.id.startsWith('brief-missing'))).toMatchObject({
			path: 'identity.brief',
			observation: "Aucun brief du projet n'est enregistré.",
			prompt: `À qui ce produit s'adresse-t-il, quel problème doit-il résoudre et qu'est-ce qui doit rester hors du périmètre${NB}?`
		});
		expect(report.items.find(i => i.id.startsWith('scope-disposition'))!.observation).toBe(
			`Le sort de la capacité «${NB}Export${NB}» n'est pas tranché.`
		);
		expect(report.limitations[0]).toMatch(/^Des vérifications déterministes/);
	});

	it('writes the feature actions in French', () => {
		const data = input();
		data.features!.features.push(createFeature('', null, { id: 'f1', name: 'Invoices' }));
		const report = analyzeElaboration(data, 'fr');
		expect(report.items.find(i => i.id.startsWith('feature-acceptance'))!.observation).toBe(
			`La fonctionnalité «${NB}Invoices${NB}» n'a aucun critère d'acceptation enregistré.`
		);
		expect(report.items.find(i => i.id.startsWith('feature-work'))!.observation).toBe(
			`La fonctionnalité «${NB}Invoices${NB}» est non commencée.`
		);
	});

	it('keeps English byte-identical when no language is given', () => {
		expect(analyzeElaboration(input())).toEqual(analyzeElaboration(input(), 'en'));
	});
});
