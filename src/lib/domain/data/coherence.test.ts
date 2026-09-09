import { describe, expect, it } from 'vitest';
import { computeDataCoherence, unrelatedEntities } from './coherence';
import {
	createDatabase,
	createEmptyDataDraft,
	createEntity,
	createHost,
	type EntityField
} from './draft';

function field(
	overrides: Partial<EntityField> & Pick<EntityField, 'id' | 'entityId' | 'name'>
): EntityField {
	return {
		type: 'string',
		isId: false,
		isUnique: false,
		isRequired: false,
		isList: false,
		defaultValue: '',
		relationTargetEntityId: null,
		parentFieldId: null,
		...overrides
	};
}

/** Invoice, Invoice line and Setting on one database; the line relates to its invoice only when asked. */
function modelWith(lineRelatesToInvoice: boolean) {
	const draft = createEmptyDataDraft('p1');
	draft.hosts.push(createHost({ id: 'host-1', name: 'Host' }));
	draft.databases.push(createDatabase('host-1', { id: 'db-1', name: 'Core' }));
	draft.entities.push(
		createEntity({ id: 'e-invoice', name: 'Invoice', databaseId: 'db-1' }),
		createEntity({ id: 'e-line', name: 'Invoice line', databaseId: 'db-1' }),
		createEntity({ id: 'e-setting', name: 'Setting', databaseId: 'db-1' })
	);
	draft.fields.push(
		field({ id: 'f1', entityId: 'e-invoice', name: 'number' }),
		field({ id: 'f2', entityId: 'e-line', name: 'amount' }),
		field({ id: 'f3', entityId: 'e-setting', name: 'key' })
	);
	if (lineRelatesToInvoice) {
		draft.fields.push(
			field({
				id: 'f4',
				entityId: 'e-line',
				name: 'Invoice',
				type: 'relation',
				relationTargetEntityId: 'e-invoice'
			})
		);
	}
	return draft;
}

describe('unrelatedEntities', () => {
	it('names every entity that neither points at another entity nor is pointed at', () => {
		expect(unrelatedEntities(modelWith(true)).map((e) => e.name)).toEqual(['Setting']);
		expect(unrelatedEntities(modelWith(false)).map((e) => e.name)).toEqual([
			'Invoice',
			'Invoice line',
			'Setting'
		]);
	});

	it('counts neither a self-relation nor a relation that points nowhere as a connection', () => {
		const draft = modelWith(false);
		draft.fields.push(
			field({
				id: 'f5',
				entityId: 'e-setting',
				name: 'Parent',
				type: 'relation',
				relationTargetEntityId: 'e-setting'
			}),
			field({
				id: 'f6',
				entityId: 'e-invoice',
				name: 'Ghost',
				type: 'relation',
				relationTargetEntityId: 'e-nowhere'
			})
		);
		expect(unrelatedEntities(draft).map((e) => e.name)).toEqual([
			'Invoice',
			'Invoice line',
			'Setting'
		]);
	});
});

describe('computeDataCoherence relational connectivity', () => {
	it('scores 100 only when every relation resolves and every table takes part in one', () => {
		const draft = modelWith(true);
		draft.fields.push(
			field({
				id: 'f7',
				entityId: 'e-setting',
				name: 'Invoice',
				type: 'relation',
				relationTargetEntityId: 'e-invoice'
			})
		);
		const result = computeDataCoherence(draft);
		expect(result.issues).toEqual([]);
		expect(result.score).toBe(100);
	});

	it('names the orphan tables and docks the connectivity points', () => {
		const result = computeDataCoherence(modelWith(true));
		const issue = result.issues.find((i) => i.code === 'unrelated-entity');
		expect(issue?.message).toContain('Setting');
		expect(issue?.message).not.toContain('Invoice line');
		// 10 connectivity points, 2 of 3 tables connected.
		expect(result.score).toBe(97);
	});

	it('treats several tables with no relation at all as an issue, not a free pass', () => {
		const result = computeDataCoherence(modelWith(false));
		expect(result.issues.map((i) => i.code)).toEqual(['unrelated-entity']);
		expect(result.score).toBe(90);
	});

	it('leaves a single table alone: it has nothing to relate to', () => {
		const draft = createEmptyDataDraft('p1');
		draft.hosts.push(createHost({ id: 'h', name: 'H' }));
		draft.databases.push(createDatabase('h', { id: 'd', name: 'D' }));
		draft.entities.push(createEntity({ id: 'e', name: 'Only', databaseId: 'd' }));
		draft.fields.push(field({ id: 'f', entityId: 'e', name: 'name' }));
		const result = computeDataCoherence(draft);
		expect(result.issues).toEqual([]);
		expect(result.score).toBe(100);
	});
});
