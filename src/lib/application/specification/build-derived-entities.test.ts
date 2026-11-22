import { describe, expect, it } from 'vitest';
import { createDataRead, createEmptyExperienceDraft } from '$domain/experience';
import { buildDerivedEntities } from './build-derived-entities';

describe('the tables the journeys owe the data model', () => {
	it('owes one table per entity a step reads, with every field the steps name, trimmed and once', () => {
		const experience = {
			...createEmptyExperienceDraft('p'),
			stepDataReads: [
				createDataRead('s1', 0, { entityName: ' Order ', fields: ['total', ' status '] }),
				createDataRead('s2', 0, { entityName: 'Order', fields: ['total', ''] }),
				createDataRead('s3', 0, { entityName: 'Customer', fields: [] }),
				createDataRead('s4', 0, { entityName: '  ', fields: ['ghost'] })
			]
		};
		expect(buildDerivedEntities(experience)).toEqual([
			{ name: 'Order', fields: ['total', 'status'] },
			{ name: 'Customer', fields: [] }
		]);
	});

	it('owes nothing before the Experience section exists', () => {
		expect(buildDerivedEntities(null)).toEqual([]);
	});
});
