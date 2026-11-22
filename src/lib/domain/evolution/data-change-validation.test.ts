import { describe, expect, it } from 'vitest';
import { dataChangeFingerprint, dataChangeKey, dataDraftOfKey, liveDataDrafts, type DataDraft } from './data-drafts';
import { specificationHold, specificationLeft } from './specification-hold';

const amend: DataDraft = {
	id: 'data:9192aa5a',
	kind: 'amend',
	entityId: 'entity-domain',
	name: '',
	description: 'A domain says whether an administrator added it.',
	addFields: [{ id: 'f1', name: 'addedByAdmin', type: 'boolean', required: true, list: false, relationTo: null }],
	changeFields: [],
	removeFields: [],
	materialisedAs: null,
	materialisedAt: null
};

describe('3.4 Datamap is validated like the rest of the Specification [criterion:3d4f23dd]', () => {
	it('validates each change to the data on a synthetic field of its own', () => {
		expect(dataChangeKey(amend)).toBe('element.data.9192aa5a');
		expect(dataDraftOfKey([amend], 'element.data.9192aa5a')).toBe(amend);
		expect(dataDraftOfKey([amend], 'element.data.other')).toBeUndefined();
	});

	it('records a validation against what the change says, so a change rewritten after it reads waiting again', () => {
		const rewritten = { ...amend, addFields: [...amend.addFields, { id: 'f2', name: 'addedAt', type: 'datetime' as const, required: false, list: false, relationTo: null }] };
		expect(dataChangeFingerprint(rewritten)).not.toBe(dataChangeFingerprint(amend));
		expect(dataChangeFingerprint({ ...amend })).toBe(dataChangeFingerprint(amend));
	});

	it('asks nothing of a change already written to the data model', () => {
		expect(liveDataDrafts([amend, { ...amend, id: 'data:landed', materialisedAt: '2026-10-28T10:00:00.000Z' }])).toEqual([amend]);
	});

	it('holds the Simulation until the data changes stand validated, by a person or by their AI in their name', () => {
		const answer = { validation: 'validated', humanValidated: true };
		expect(specificationLeft(specificationHold([answer, { validation: 'unvalidated' }]))).toBe(1);
		expect(specificationLeft(specificationHold([answer, { validation: 'refused' }]))).toBe(1);
		expect(specificationLeft(specificationHold([answer, { validation: 'validated' }]))).toBe(0);
	});
});
