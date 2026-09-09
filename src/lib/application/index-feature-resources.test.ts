import { describe, it, expect } from 'vitest';
import { indexFeatureResources } from './index-feature-resources';
import { dataModelFeatureId } from './projection/aux-feature-ids';
import { createEmptyDataDraft, type ProjectDataDraft } from '$domain/data';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

const projectSnap = (featureIds: string[]): UnspaProjectSnapshot =>
	({
		format: 'unspaghettit-project',
		version: 1,
		project: { id: 'p1', name: 'P', description: '', tags: [], featureIds, createdAt: '', updatedAt: '' }
	}) as unknown as UnspaProjectSnapshot;

const featureSnap = (feature: Record<string, unknown>): UnspaFeatureSnapshot => ({
	format: 'unspaghettit',
	version: 1,
	feature
});

const resource = (over: Record<string, unknown>) => ({
	id: 'res-x',
	name: 'A resource',
	description: '',
	kind: 'relational_db',
	provider: 'SQLite',
	scope: 'local',
	location: '',
	database: '',
	container: '',
	sensitivity: 'internal',
	containsPii: false,
	complianceTags: [],
	accessMode: 'read_write',
	authentication: 'none',
	encryptionAtRest: false,
	encryptionInTransit: false,
	retention: '',
	owner: '',
	...over
});

const draftWith = (over: Partial<ProjectDataDraft> = {}): ProjectDataDraft => ({
	...createEmptyDataDraft('p1'),
	...over
});

const database = (id: string, name: string) => ({
	id,
	hostId: 'h1',
	name,
	engine: 'postgres' as const,
	description: ''
});

const iface = (id: string, operation: string) => ({
	id,
	protocol: 'rest' as const,
	fromBrick: 'web',
	toBrick: 'api',
	operation,
	description: ''
});

describe('indexFeatureResources', () => {
	it('flags a resource declared on a leaf feature that the infra map never saw', () => {
		const model = indexFeatureResources(
			projectSnap(['f1']),
			[
				{
					featureId: 'f1',
					snapshot: featureSnap({
						id: 'f1',
						name: 'Browse rooms',
						resources: [
							resource({
								id: 'res-local-sqlite',
								name: 'Local SQLite database',
								location: 'Android device',
								containsPii: true,
								sensitivity: 'confidential'
							})
						]
					})
				}
			],
			draftWith()
		);

		expect(model.total).toBe(1);
		expect(model.onMap).toBe(0);
		expect(model.withPii).toBe(1);
		const [row] = model.resources;
		expect(row.onMap).toBe(false);
		expect(row.kindLabel).toBe('Relational DB');
		expect(row.scopeLabel).toBe('Local (browser/device)');
		expect(row.sensitivityLabel).toBe('Confidential');
		expect(row.ownership).toEqual({ kind: 'behavior' });
		expect(row.declaredBy).toEqual([{ featureId: 'f1', featureName: 'Browse rooms' }]);
	});

	it('counts a projected resource as on the map, so the panel never re-lists it', () => {
		const model = indexFeatureResources(
			projectSnap([dataModelFeatureId('p1')]),
			[
				{
					featureId: dataModelFeatureId('p1'),
					snapshot: featureSnap({
						name: 'Data Model',
						resources: [
							resource({ id: 'res-db-db-core', name: 'Atelier core' }),
							resource({ id: 'res-if-iface-web-api', name: 'POST /bookings', kind: 'http_api' })
						]
					})
				}
			],
			draftWith({
				databases: [database('db-core', 'Atelier core')],
				interfaces: [iface('iface-web-api', 'POST /bookings')]
			})
		);

		expect(model.total).toBe(2);
		expect(model.onMap).toBe(2);
		expect(model.resources.every((r) => r.onMap)).toBe(true);
		expect(model.resources.map((r) => r.ownership)).toEqual([
			{ kind: 'database', draftId: 'db-core' },
			{ kind: 'interface', draftId: 'iface-web-api' }
		]);
	});

	it('surfaces a projected resource whose map object was deleted', () => {
		const model = indexFeatureResources(
			projectSnap(['f1']),
			[
				{
					featureId: 'f1',
					snapshot: featureSnap({
						name: 'Leaf',
						resources: [resource({ id: 'res-db-deleted', name: 'Stale mirror' })]
					})
				}
			],
			draftWith()
		);

		expect(model.onMap).toBe(0);
		expect(model.resources[0].onMap).toBe(false);
		expect(model.resources[0].ownership).toEqual({ kind: 'database', draftId: 'deleted' });
	});

	it('dedupes a mirrored resource and keeps every feature that declares it', () => {
		const shared = resource({ id: 'res-db-core', name: 'Core' });
		const model = indexFeatureResources(
			projectSnap(['f1', 'f2', dataModelFeatureId('p1')]),
			[
				{ featureId: 'f1', snapshot: featureSnap({ name: 'One', resources: [shared] }) },
				{ featureId: 'f2', snapshot: featureSnap({ name: 'Two', resources: [shared] }) },
				{
					featureId: dataModelFeatureId('p1'),
					snapshot: featureSnap({ name: 'Data Model', resources: [shared] })
				}
			],
			draftWith({ databases: [database('core', 'Core')] })
		);

		expect(model.total).toBe(1);
		// Aux features sort last, so a reader sees the product features first.
		expect(model.resources[0].declaredBy.map((d) => d.featureName)).toEqual([
			'One',
			'Two',
			'Data Model'
		]);
	});

	it('sorts what the map cannot show first, then alphabetically', () => {
		const model = indexFeatureResources(
			projectSnap(['f1']),
			[
				{
					featureId: 'f1',
					snapshot: featureSnap({
						name: 'Leaf',
						resources: [
							resource({ id: 'res-db-known', name: 'Zeta mapped' }),
							resource({ id: 'res-engine-b', name: 'Beta engine' }),
							resource({ id: 'res-engine-a', name: 'Alpha engine' })
						]
					})
				}
			],
			draftWith({ databases: [database('known', 'Zeta mapped')] })
		);

		expect(model.resources.map((r) => r.name)).toEqual([
			'Alpha engine',
			'Beta engine',
			'Zeta mapped'
		]);
		expect(model.onMap).toBe(1);
	});

	it('shows an unknown code rather than swallowing it, and reports no project', () => {
		const model = indexFeatureResources(
			null,
			[
				{
					featureId: 'f1',
					snapshot: featureSnap({
						name: 'Leaf',
						resources: [resource({ id: 'res-odd', kind: 'quantum_blob', scope: '' })]
					})
				}
			],
			null
		);

		expect(model.hasProject).toBe(false);
		expect(model.resources[0].kindLabel).toBe('quantum blob');
		expect(model.resources[0].scopeLabel).toBe('');
	});
});
