import { describe, expect, it } from 'vitest';
import { createDocumentSource } from '$domain/documents';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { EMPTY_BEHAVIOR_TOTALS, type BehaviorOverview } from './summarize-behavior';
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
