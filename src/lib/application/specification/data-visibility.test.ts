import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft, createEntity, createField, type ProjectDataDraft } from '$domain/data';
import { createDataRead, createEmptyExperienceDraft, type ProjectExperienceDraft } from '$domain/experience';
import { deriveDataVisibility } from './data-visibility';

const data: ProjectDataDraft = {
	...createEmptyDataDraft('p1'),
	entities: [createEntity({ id: 'e-order', name: 'Order' }), createEntity({ id: 'e-invoice', name: 'Invoice' }), createEntity({ id: 'e-audit', name: 'Audit log' })],
	fields: [
		createField('e-order', { id: 'f-total', name: 'Total' }),
		createField('e-order', { id: 'f-notes', name: 'Internal notes' }),
		createField('e-invoice', { id: 'f-number', name: 'Number' }),
		createField('e-audit', { id: 'f-actor', name: 'Actor' }),
		createField('e-gone', { id: 'f-orphan', name: 'Orphan' })
	]
};

const reading = (...reads: { entityName: string; fields?: string[] }[]): ProjectExperienceDraft => ({
	...createEmptyExperienceDraft('p1'),
	stepDataReads: reads.map((r, i) => createDataRead(`s${i}`, i, { entityName: r.entityName, fields: r.fields ?? [] }))
});

describe('the data the client experience surfaces', () => {
	it('shows a table a step reads, and every field of it when the step names none', () => {
		expect(deriveDataVisibility(data, reading({ entityName: 'Invoice' }))).toEqual({ entityIds: ['e-invoice'], fieldIds: ['f-number'] });
	});

	it('shows only the fields a step names, matched whatever their case and spacing', () => {
		const visible = deriveDataVisibility(data, reading({ entityName: ' order ', fields: ['  TOTAL', ''] }));
		expect(visible).toEqual({ entityIds: ['e-order'], fieldIds: ['f-total'] });
	});

	it('reads a field list holding only blanks as no list: the whole record shows', () => {
		expect(deriveDataVisibility(data, reading({ entityName: 'Order', fields: ['  ', ''] })).fieldIds).toEqual(['f-total', 'f-notes']);
	});

	it('shows no table and no field that no step reads, nor a field whose table is gone', () => {
		const visible = deriveDataVisibility(data, reading({ entityName: 'Order', fields: ['Total'] }, { entityName: '   ' }));
		expect(visible.entityIds).not.toContain('e-audit');
		expect(visible.fieldIds).not.toContain('f-actor');
		expect(visible.fieldIds).not.toContain('f-orphan');
		expect(deriveDataVisibility(data, createEmptyExperienceDraft('p1'))).toEqual({ entityIds: [], fieldIds: [] });
	});

	it('adds up the fields several steps name on one table', () => {
		const visible = deriveDataVisibility(data, reading({ entityName: 'Order', fields: ['Total'] }, { entityName: 'Order', fields: ['Internal notes'] }));
		expect(visible.fieldIds).toEqual(['f-total', 'f-notes']);
	});
});
