import { describe, it, expect } from 'vitest';
import {
	buildDataProjection,
	dataDraftToBehaviorOps,
	dataResidueFromDraft
} from './data-projection';
import type { ProjectDataDraft } from '$domain/data';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { createEmptyFeaturesDraft } from '$domain/features';
import {
	createDataRead,
	createEmptyExperienceDraft,
	createJourney,
	createStep
} from '$domain/experience';

function sampleDraft(projectId: string): ProjectDataDraft {
	return {
		projectId,
		hosts: [
			{ id: 'h1', name: 'AWS eu', kind: 'cloud', provider: 'AWS', region: 'eu-west-3', description: '' }
		],
		databases: [{ id: 'db1', hostId: 'h1', name: 'Core DB', engine: 'postgres', description: 'main' }],
		entities: [
			{ id: 'e1', name: 'User', databaseId: 'db1', description: 'a user', derivedFrom: 'manual', sourceRefId: null },
			{ id: 'e2', name: 'Order', databaseId: 'db1', description: '', derivedFrom: 'journey', sourceRefId: 'step-x' },
			{ id: 'e3', name: 'Cache', databaseId: null, description: 'ephemeral', derivedFrom: 'manual', sourceRefId: null }
		],
		fields: [
			{ id: 'f1', entityId: 'e1', parentFieldId: null, name: 'id', type: 'uuid', isId: true, isUnique: true, isRequired: true, isList: false, defaultValue: '', relationTargetEntityId: null },
			{ id: 'f2', entityId: 'e1', parentFieldId: null, name: 'email', type: 'string', isId: false, isUnique: true, isRequired: true, isList: false, defaultValue: 'x@y.z', relationTargetEntityId: null },
			{ id: 'f3', entityId: 'e2', parentFieldId: null, name: 'owner', type: 'relation', isId: false, isUnique: false, isRequired: true, isList: false, defaultValue: '', relationTargetEntityId: 'e1' },
			// empty-name field, still being authored — must survive the round-trip
			{ id: 'f4', entityId: 'e2', parentFieldId: 'f3', name: '', type: 'string', isId: false, isUnique: false, isRequired: false, isList: false, defaultValue: '', relationTargetEntityId: null }
		],
		interfaces: [{ id: 'i1', protocol: 'rest', fromBrick: 'app', toBrick: 'stripe', operation: 'charge', description: '' }],
		derivedEntities: [],
		lastSavedAt: '2026-01-01T00:00:00.000Z'
	};
}

/** Apply the write ops into a kernel Data Model snapshot, as the port would. */
function kernelDataModel(draft: ProjectDataDraft): UnspaFeatureSnapshot {
	const ops = dataDraftToBehaviorOps(draft, {
		projectId: draft.projectId,
		definition: null,
		experience: null,
		features: null
	});
	const dm = ops.find((o) => o.kind === 'upsertDataModelFeature');
	if (!dm || dm.kind !== 'upsertDataModelFeature') throw new Error('no data-model op');
	return {
		format: 'unspaghettit',
		version: 1,
		feature: { id: dm.featureId, entities: dm.entities, resources: dm.resources }
	};
}

describe('data-projection', () => {
	it('round-trips entities, fields and infra topology through kernel + residue', () => {
		const draft = sampleDraft('p1');
		const back = buildDataProjection('p1', kernelDataModel(draft), dataResidueFromDraft(draft));

		expect(back.entities).toEqual(draft.entities);
		expect(back.fields).toEqual(draft.fields);
		expect(back.hosts).toEqual(draft.hosts);
		expect(back.databases).toEqual(draft.databases);
		expect(back.interfaces).toEqual(draft.interfaces);
		expect(back.lastSavedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	// Criterion 7d63b0a6 of feat-data-model: the mark lived on the write and was gone on the next read.
	it('keeps a table marked standalone across the save, and only that one', () => {
		const draft = sampleDraft('p1');
		const [first, ...rest] = draft.entities;
		const marked = { ...draft, entities: [{ ...first, standalone: true as const }, ...rest] };
		const back = buildDataProjection('p1', kernelDataModel(marked), dataResidueFromDraft(marked));
		expect(back.entities[0].standalone).toBe(true);
		expect(back.entities.slice(1).every((e) => e.standalone === undefined)).toBe(true);
	});

	it('keeps the sources a table cites across the save, and none on a table that cites nothing [criterion:3918b2ea]', () => {
		const draft = sampleDraft('p1');
		const [first, ...rest] = draft.entities;
		const cited = { ...draft, entities: [{ ...first, sourceIds: ['src-model-user', 'src-migration'] }, ...rest] };
		const back = buildDataProjection('p1', kernelDataModel(cited), dataResidueFromDraft(cited));
		expect(back.entities[0].sourceIds).toEqual(['src-model-user', 'src-migration']);
		expect(back.entities.slice(1).every((e) => e.sourceIds === undefined)).toBe(true);
	});

	it('keeps the values of a choice field, and tells the engine its kind and its values', () => {
		const draft = sampleDraft('p1');
		draft.fields.push({ id: 'f5', entityId: 'e2', parentFieldId: null, name: 'status', type: 'enum', isId: false, isUnique: false, isRequired: true, isList: false, defaultValue: 'draft', relationTargetEntityId: null, enumValues: ['draft', 'paid', 'shipped'] });
		const kernel = kernelDataModel(draft);
		const order = (kernel.feature.entities as { id: string; fields: Record<string, unknown>[] }[]).find((e) => e.id === 'ent-e2')!;
		expect(order.fields.find((f) => f.id === 'fld-f5')).toMatchObject({ type: 'enum', required: true, enumValues: ['draft', 'paid', 'shipped'] });
		const back = buildDataProjection('p1', kernel, dataResidueFromDraft(draft));
		expect(back.fields.find((f) => f.id === 'f5')!.enumValues).toEqual(['draft', 'paid', 'shipped']);
		// Without the residue (an engine-only read), the values come back from the engine.
		expect(buildDataProjection('p1', kernel, null).fields.find((f) => f.id === 'f5')!.enumValues).toEqual(['draft', 'paid', 'shipped']);
	});

	it('derives databaseId from the kernel resource ref (null when unhosted)', () => {
		const draft = sampleDraft('p1');
		const back = buildDataProjection('p1', kernelDataModel(draft), dataResidueFromDraft(draft));
		expect(back.entities.find((e) => e.id === 'e1')!.databaseId).toBe('db1');
		expect(back.entities.find((e) => e.id === 'e3')!.databaseId).toBeNull();
	});

	it('preserves empty-name fields and field nesting on the round-trip', () => {
		const draft = sampleDraft('p1');
		const back = buildDataProjection('p1', kernelDataModel(draft), dataResidueFromDraft(draft));
		const f4 = back.fields.find((f) => f.id === 'f4')!;
		expect(f4.name).toBe('');
		expect(f4.parentFieldId).toBe('f3');
	});

	it('falls back to a best-effort type when a kernel field has no residue attrs', () => {
		const draft = sampleDraft('p1');
		// A kernel entity authored directly (e.g. via the dashboard), no residue.
		const snap: UnspaFeatureSnapshot = {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'p1__data_model',
				entities: [
					{ id: 'ent-x', namespace: 'Widget', description: '', fields: [{ id: 'fld-a', name: 'count', type: 'number', description: '' }] }
				],
				resources: []
			}
		};
		void draft;
		const back = buildDataProjection('p1', snap, null);
		const w = back.entities.find((e) => e.id === 'x')!;
		expect(w.name).toBe('Widget');
		expect(back.fields.find((f) => f.id === 'a')!.type).toBe('int');
	});

	it('sends a JSON or object field to the engine with its own kind, not as text', () => {
		const draft = sampleDraft('p1');
		draft.fields.push(
			{ id: 'f5', entityId: 'e1', parentFieldId: null, name: 'coordinates', type: 'json', isId: false, isUnique: false, isRequired: true, isList: false, defaultValue: '', relationTargetEntityId: null },
			{ id: 'f6', entityId: 'e1', parentFieldId: null, name: 'profile', type: 'object', isId: false, isUnique: false, isRequired: false, isList: false, defaultValue: '', relationTargetEntityId: null }
		);
		const kernel = kernelDataModel(draft);
		const fields = (kernel.feature.entities as { fields: { name: string; type: string }[] }[]).flatMap((e) => e.fields);
		expect(fields.find((f) => f.name === 'coordinates')!.type).toBe('json');
		expect(fields.find((f) => f.name === 'profile')!.type).toBe('object');

		// Without residue attrs, the engine's kind still comes back as the same field type.
		const back = buildDataProjection('p1', kernel, null);
		expect(back.fields.find((f) => f.name === 'coordinates')!.type).toBe('json');
		expect(back.fields.find((f) => f.name === 'profile')!.type).toBe('object');
	});

	it('keeps exact engine-authored entity and field ids on the inverse write', () => {
		const snap: UnspaFeatureSnapshot = {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'p1__data_model',
				entities: [
					{
						id: '9c8b7a6d',
						namespace: 'Invoice',
						description: '',
						fields: [{ id: 'a1b2c3d4', name: 'total', type: 'number', description: '' }]
					}
				],
				resources: []
			}
		};
		const draft = buildDataProjection('p1', snap, null);
		const roundTrip = kernelDataModel(draft).feature as {
			entities: Array<{ id: string; fields: Array<{ id: string }> }>;
		};
		expect(roundTrip.entities[0].id).toBe('9c8b7a6d');
		expect(roundTrip.entities[0].fields[0].id).toBe('a1b2c3d4');
	});

	it('writes the Data Model op + ensures it is listed in the project', () => {
		const draft = sampleDraft('p1');
		const ops = dataDraftToBehaviorOps(draft, { projectId: 'p1', definition: null, experience: null, features: null });
		const dm = ops.find((o) => o.kind === 'upsertDataModelFeature');
		expect(dm && dm.kind === 'upsertDataModelFeature' && dm.featureId).toBe('p1__data_model');
		expect(ops.some((o) => o.kind === 'ensureProjectFeatureId' && o.featureId === 'p1__data_model')).toBe(true);
	});

	it('emits a Core-bridge mirror op for a leaf whose Core consumes an entity', () => {
		const draft = sampleDraft('p1');
		const features = createEmptyFeaturesDraft('p1');
		features.cores = [{ id: 'coreA', name: 'Core A', description: '', tone: 'custom' }];
		features.features = [
			{ id: 'leaf1', name: 'L1', coreId: 'coreA', parentFamilyId: null, description: '', unspaghettitFeatureId: 'leaf1' }
		];
		const exp = createEmptyExperienceDraft('p1');
		exp.journeys = [createJourney('coreA', 0, { id: 'J1' })];
		exp.steps = [createStep('J1', 0, { id: 'S1' })];
		exp.stepDataReads = [createDataRead('S1', 0, { entityName: 'User' })];

		const ops = dataDraftToBehaviorOps(draft, { projectId: 'p1', definition: null, experience: exp, features });
		const mirror = ops.find((o) => o.kind === 'mirrorFeatureData');
		expect(mirror && mirror.kind === 'mirrorFeatureData' && mirror.featureId).toBe('leaf1');
		expect(mirror && mirror.kind === 'mirrorFeatureData' && (mirror.entities[0] as { namespace?: string }).namespace).toBe('User');
	});

	it('emits an EMPTY mirror op for a leaf that consumes nothing, so stale mirrors prune', () => {
		const draft = sampleDraft('p1');
		const features = createEmptyFeaturesDraft('p1');
		features.cores = [{ id: 'coreA', name: 'Core A', description: '', tone: 'custom' }];
		features.features = [
			{ id: 'leaf1', name: 'L1', coreId: 'coreA', parentFamilyId: null, description: '', unspaghettitFeatureId: 'leaf1' }
		];
		const exp = createEmptyExperienceDraft('p1');

		const ops = dataDraftToBehaviorOps(draft, { projectId: 'p1', definition: null, experience: exp, features });
		const mirror = ops.find((o) => o.kind === 'mirrorFeatureData');
		expect(mirror && mirror.kind === 'mirrorFeatureData' && mirror.featureId).toBe('leaf1');
		expect(mirror && mirror.kind === 'mirrorFeatureData' && mirror.entities).toEqual([]);
		expect(mirror && mirror.kind === 'mirrorFeatureData' && mirror.resources).toEqual([]);
	});
});

/**
 * The security posture declared once in Foundation decorates every database
 * resource. It must state what the project actually declared, and nothing more:
 * an over-claimed control reads as a guarantee nobody made.
 */
describe('definitionEnrichment (via the database resource it decorates)', () => {
	const dbResource = (definition: unknown) => {
		const ops = dataDraftToBehaviorOps(sampleDraft('p1'), {
			projectId: 'p1',
			definition: definition as never,
			experience: null,
			features: null
		});
		const dm = ops.find((o) => o.kind === 'upsertDataModelFeature');
		if (!dm || dm.kind !== 'upsertDataModelFeature') throw new Error('no data-model op');
		return dm.resources.find((r) => String((r as { id?: unknown }).id).startsWith('res-db-')) as Record<
			string,
			unknown
		>;
	};

	const definitionWith = (security: Record<string, unknown>, regulations: string[] = []) => ({
		market: { regulations },
		security: { expectedCertifications: [], dataRetention: [], ...security }
	});

	it('does not claim encryption at rest when only transport encryption is declared', () => {
		const r = dbResource(definitionWith({ encryption: ['in_transit'] }));
		expect(r.encryptionInTransit).toBe(true);
		expect(r.encryptionAtRest).toBe(false);
	});

	it('does not claim encryption in transit for a product that transmits nothing', () => {
		// Verbatim shape of a real authored draft: the field is typed as a closed
		// enum but the write path does not validate it, so prose lands here.
		const r = dbResource(
			definitionWith({
				encryption: [
					"Relies on Android's own full-disk encryption for the application sandbox. No additional application-level encryption, because no data is transmitted."
				]
			})
		);
		expect(r.encryptionInTransit).toBe(false);
	});

	it('reads end-to-end as covering both scopes', () => {
		const r = dbResource(definitionWith({ encryption: ['end_to_end'] }));
		expect(r.encryptionAtRest).toBe(true);
		expect(r.encryptionInTransit).toBe(true);
	});

	it('claims nothing when no encryption is declared', () => {
		const r = dbResource(definitionWith({ encryption: [] }));
		expect(r.encryptionAtRest).toBe(false);
		expect(r.encryptionInTransit).toBe(false);
	});

	it('publishes real compliance codes and drops prose that is not a tag', () => {
		const r = dbResource(
			definitionWith({ encryption: [] }, [
				'GDPR',
				'PCI DSS',
				'No personal data leaves the device, so no processor agreement and no cross-border transfer arise.'
			])
		);
		expect(r.complianceTags).toEqual(['gdpr', 'pci_dss']);
	});

	it('reads a retention duration from either the typed rule or a bare sentence', () => {
		expect(
			dbResource(
				definitionWith({
					encryption: [],
					dataRetention: [{ dataType: 'orders', duration: '7 years', actionAfter: 'delete' }]
				})
			).retention
		).toBe('7 years');
		expect(
			dbResource(
				definitionWith({ encryption: [], dataRetention: ['Retained locally until the resident deletes it.'] })
			).retention
		).toBe('Retained locally until the resident deletes it.');
	});
});

describe('data-projection in the spec language', () => {
	const NB = ' ';
	type Res = { id: string; description: string };
	type Ent = { namespace: string; fields: { name: string; description: string }[] };
	const dataModelOf = (lang?: 'en' | 'fr') => {
		const ops = dataDraftToBehaviorOps(sampleDraft('p1'), {
			projectId: 'p1',
			definition: null,
			experience: null,
			features: null,
			...(lang ? { lang } : {})
		});
		const dm = ops.find((o) => o.kind === 'upsertDataModelFeature');
		if (dm?.kind !== 'upsertDataModelFeature') throw new Error('unreachable');
		return dm;
	};

	it('writes the generated descriptions in French, names kept as they are', () => {
		const dm = dataModelOf('fr');
		expect(dm.name).toBe('Data Model');
		expect(dm.description).toContain(`Données et architecture${NB}:`);
		const iface = (dm.resources as Res[]).find((r) => r.id === 'res-if-i1')!;
		expect(iface.description).toBe('Interface REST app → stripe.');
		const entities = dm.entities as Ent[];
		expect(entities.find((e) => e.namespace === 'User')!.fields[1].description).toBe(
			'unique, obligatoire, valeur par défaut x@y.z'
		);
		expect(entities.find((e) => e.namespace === 'Order')!.fields[0].description).toBe(
			`obligatoire, → «${NB}User${NB}» (clé étrangère)`
		);
		expect(entities.find((e) => e.namespace === 'Order')!.fields[1].description).toBe('champ de type string');
	});

	it('keeps the English descriptions byte for byte by default, and every id across languages', () => {
		const en = dataModelOf();
		expect(dataModelOf('en')).toEqual(en);
		expect((en.resources as Res[]).find((r) => r.id === 'res-if-i1')!.description).toBe(
			'REST interface app → stripe.'
		);
		const ids = (dm: ReturnType<typeof dataModelOf>) => [
			(dm.resources as Res[]).map((r) => r.id),
			(dm.entities as { id: string }[]).map((e) => e.id)
		];
		expect(ids(dataModelOf('fr'))).toEqual(ids(en));
	});
});

describe('a relation keeps what deleting its target does across the save [criterion:99e7cc77]', () => {
	it('round-trips onDelete on the relation that states it, and on no other field', () => {
		const draft = sampleDraft('p1');
		draft.fields = draft.fields.map((f) => (f.id === 'f3' ? { ...f, onDelete: 'cascade' as const } : f));
		const back = buildDataProjection('p1', kernelDataModel(draft), dataResidueFromDraft(draft));
		expect(back.fields.find((f) => f.id === 'f3')?.onDelete).toBe('cascade');
		expect(back.fields.filter((f) => f.id !== 'f3').every((f) => f.onDelete === undefined)).toBe(true);
	});
});
