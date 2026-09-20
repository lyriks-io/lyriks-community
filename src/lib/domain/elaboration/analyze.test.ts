import { describe, expect, it } from 'vitest';
import { createEmptyIdentityDraft, createEmptyDefinitionDraft, createEmptyOperationsDraft } from '../foundation';
import { createEmptyFeaturesDraft, createFeature } from '../features';
import { createEmptyScopeDraft, createScopeCapability } from '../scope';
import { createEmptyUsersDraft } from '../users';
import { analyzeElaboration } from './analyze';
import type { ElaborationInput } from './report';
import type { ProjectCompletionReport } from '../scope';

function input(): ElaborationInput {
	return { foundation: { projectId: 'p', identity: createEmptyIdentityDraft('p'), definition: createEmptyDefinitionDraft('p'), operations: createEmptyOperationsDraft('p') }, scope: createEmptyScopeDraft('p'), users: createEmptyUsersDraft('p'), features: createEmptyFeaturesDraft('p'), completion: null, acceptanceCriteriaByFeature: null, unavailable: [] };
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
		const report = analyzeElaboration({ foundation: null, scope: null, users: null, features: null, completion: null, acceptanceCriteriaByFeature: null, unavailable: ['foundation'] });
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
		data.features!.leafMeta = { a: { status: 'in-progress' }, b: { status: 'in-progress', dependsOn: ['a'] } };
		const work = analyzeElaboration(data).items.filter(i => i.id.startsWith('feature-work'));
		expect(work.map(i => i.subjectId)).toEqual(['a', 'b']);
		expect(work[1].blockedBy).toEqual(['a']);
		data.features!.leafMeta.a.status = 'done';
		expect(analyzeElaboration(data).items.find(i => i.subjectId === 'b' && i.kind === 'action')?.blockedBy).toEqual([]);
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
