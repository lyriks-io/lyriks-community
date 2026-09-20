import { describe, expect, it } from 'vitest';
import { createDocumentSource } from '$domain/documents';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import {
	EMPTY_BEHAVIOR_TOTALS,
	type BehaviorFeatureSummary,
	type BehaviorOverview
} from './summarize-behavior';
import { buildTraceability } from './build-traceability';

const behavior: BehaviorOverview = {
	hasProject: false,
	features: [],
	shared: [],
	totals: { ...EMPTY_BEHAVIOR_TOTALS },
	attention: { unauthored: 0, overCap: 0 }
};

describe('buildTraceability — registered evidence', () => {
	it('counts valid and legacy sources while exposing broken stable references', () => {
		const features = createEmptyFeaturesDraft('p');
		const core = createCore({ id: 'core', name: 'Core' });
		const feature = createFeature(core.id, null, { id: 'feature', name: 'Requirement' });
		features.cores = [core];
		features.features = [feature];
		features.leafMeta = {
			[feature.id]: {
				sourceIds: ['source-1', 'deleted-source'],
				sourceLink: 'Workshop notes'
			}
		};

		const traceability = buildTraceability(features, behavior, [
			createDocumentSource({ id: 'source-1', title: 'Interview' })
		]);

		expect(traceability.rows[0]).toMatchObject({
			hasSource: true,
			sourceCount: 2,
			missingSourceCount: 1
		});
		expect(traceability.rows[0].gaps).toContain('1 broken source reference');
		expect(traceability.summary.withSource).toBe(1);
	});
});

describe('buildTraceability counts one list of criteria', () => {
	function featuresWith(criteria: { id: string; text: string }[]) {
		const features = createEmptyFeaturesDraft('p');
		const core = createCore({ id: 'core', name: 'Core' });
		const feature = createFeature(core.id, null, { id: 'feature', name: 'Requirement' });
		features.cores = [core];
		features.features = [feature];
		features.leafMeta = { [feature.id]: { acceptanceCriteria: criteria } };
		return features;
	}
	const withModelCriteria = (acceptanceCriteria: BehaviorFeatureSummary['acceptanceCriteria']): BehaviorOverview => ({
		...behavior,
		features: [
			{
				featureId: 'feature',
				name: 'Requirement',
				surfaceCount: 0, actionCount: 0, ruleCount: 0, invariantCount: 0, effectCount: 0,
				stateCount: 0, scenarioCount: 0, eventCount: 0, entityCount: 0, personaCount: 0,
				maturity: 0, authored: false, overCap: false,
				acceptanceCriteria
			}
		]
	});

	it('counts a criterion an AI client wrote, which the panel never held', () => {
		const traceability = buildTraceability(
			featuresWith([]),
			withModelCriteria([{ id: '7f4b930b', title: 'A batch refuses a stale write', supersededBy: [] }])
		);
		expect(traceability.rows[0].acceptanceCount).toBe(1);
		expect(traceability.rows[0].gaps).not.toContain('acceptance criteria');
		expect(traceability.summary.withAcceptance).toBe(1);
	});

	it('does not count a projected criterion twice', () => {
		const traceability = buildTraceability(
			featuresWith([{ id: 'x1', text: 'Paid invoices leave the dunning run' }]),
			withModelCriteria([{ id: 'ac-leaf-x1', title: 'Paid invoices leave the dunning run', supersededBy: [], wizardId: 'x1' }])
		);
		expect(traceability.rows[0].acceptanceCount).toBe(1);
	});

	it('falls back to the panel before the section has ever been saved', () => {
		const traceability = buildTraceability(
			featuresWith([{ id: 'x1', text: 'Written here, never saved' }]),
			behavior
		);
		expect(traceability.rows[0].acceptanceCount).toBe(1);
	});
});
