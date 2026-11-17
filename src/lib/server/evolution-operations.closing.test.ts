import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, requestSourceId, type EvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEntity, createField } from '$domain/data';

const scene = vi.hoisted(() => ({ view: null as unknown }));

vi.mock('./evolution-view.server', async (original) => ({
	...(await original<typeof import('./evolution-view.server')>()),
	loadEvolutionView: async () => scene.view
}));
vi.mock('./sync-bus.server', async (original) => ({
	...(await original<typeof import('./sync-bus.server')>()),
	publishSectionChange: vi.fn()
}));

import { applyEvolutionOperations } from './evolution-operations.server';

const PROJECT = 'p1';
const TABLE = '10051d05-6a08-46e0-8ce0-e31e089418ee';
const saves = {
	data: vi.fn(async (..._args: unknown[]) => ({})),
	documents: vi.fn(async (..._args: unknown[]) => ({})),
	dossier: vi.fn(async (..._args: unknown[]) => ({ revision: 8, savedAt: '2026-11-17T00:00:00.000Z' }))
};
let revisions: Record<string, number>;

const services = {
	clock: { nowIso: () => '2026-11-17T00:00:00.000Z' },
	draftLock: {
		current: async (_project: string, section: string) => revisions[section] ?? 0,
		commit: async (_project: string, section: string) => {
			revisions[section] = (revisions[section] ?? 0) + 1;
			return revisions[section];
		},
		rollback: async () => {}
	},
	sectionDocuments: { currentRevision: async () => 7 },
	loadDocumentRegister: { execute: async () => ({ projectId: PROJECT, sources: [], lastSavedAt: null }) },
	saveDocumentsDraft: { execute: saves.documents },
	saveDataDraft: { execute: saves.data },
	saveFeaturesDraft: { execute: vi.fn(async () => ({})) },
	saveEvolutionDraft: { execute: saves.dossier },
	implementationCoverage: { invalidate: () => {} },
	captureBaseline: { execute: async () => null },
	scheduleBackSync: async () => {}
} as unknown as AppServices;

/** An approved request adding the table "Active project", in a project whose Data section may hold it already. */
function approved(overrides: Partial<EvolutionRequest>, tables: ReturnType<typeof createEntity>[] = []) {
	const request = createEvolutionRequest({
		title: 'One active project',
		stage: 'delivered',
		dataDrafts: [
			{
				id: `data:${TABLE}`,
				kind: 'add',
				entityId: null,
				name: 'Active project',
				description: 'Which project a Community installation reads and writes.',
				addFields: [{ id: 'f-project', name: 'projectId', type: 'relation', required: false, list: false, relationTo: 'ent-project' }],
				changeFields: [],
				removeFields: [],
				materialisedAs: null,
				materialisedAt: null
			}
		],
		...overrides
	} as never);
	scene.view = {
		projectId: PROJECT,
		draft: { projectId: PROJECT, requests: [request] },
		features: createEmptyFeaturesDraft(PROJECT),
		data: { projectId: PROJECT, entities: tables, fields: tables.flatMap((t) => [createField(t.id, { id: `${t.id}-id`, name: 'id', isId: true })]) },
		leaves: [],
		sources: [],
		glossaryTerms: [],
		members: [],
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 7,
		language: 'en'
	};
	return request;
}

const run = (operations: unknown[]) =>
	applyEvolutionOperations(services, {
		projectId: PROJECT,
		operations,
		actor: { kind: 'person', id: 'ada@example.com', role: 'owner', channel: 'page' } as never,
		origin: null
	});

describe('closing a request through the write door (issue 85)', () => {
	beforeEach(() => {
		revisions = {};
		Object.values(saves).forEach((s) => s.mockClear());
	});

	it.each(['close_request', 'declare_deployment'])('refuses %s on a deleted request and writes nothing into the specification', async (op) => {
		const request = approved({ status: 'deleted' });
		const outcome = await run([{ op, requestId: request.id }]);
		expect(outcome.ok).toBe(false);
		expect(JSON.stringify(outcome)).toContain('This request is deleted.');
		expect(saves.data).not.toHaveBeenCalled();
		expect(saves.dossier).not.toHaveBeenCalled();
	});

	it('refuses to declare a closed request live again, keeping who declared it and when', async () => {
		const request = approved({ status: 'closed', deployment: { releaseId: null, note: '', declaredBy: 'ana@example.com', declaredAt: '2026-11-16T00:00:00.000Z' } });
		const outcome = await run([{ op: 'declare_deployment', requestId: request.id }]);
		expect(outcome.ok).toBe(false);
		expect(JSON.stringify(outcome)).toContain('This request is closed.');
		expect(saves.dossier).not.toHaveBeenCalled();
	});
});

describe('the landing writes a table once, and says where it comes from', () => {
	beforeEach(() => {
		revisions = {};
		Object.values(saves).forEach((s) => s.mockClear());
	});

	it('merges a table whose id the Data section already holds, and cites the request registered as a source', async () => {
		const held = createEntity({ id: TABLE, name: 'Active project', derivedFrom: 'feature' });
		const request = approved({}, [held, { ...held }]);
		const outcome = await run([{ op: 'declare_deployment', requestId: request.id }]);
		expect(outcome.ok).toBe(true);
		const data = saves.data.mock.calls[0]?.[0] as { entities: { id: string; sourceIds?: string[] }[]; fields: { id: string }[] };
		expect(data.entities.filter((e) => e.id === TABLE)).toHaveLength(1);
		expect(data.entities.find((e) => e.id === TABLE)?.sourceIds).toEqual([requestSourceId(request.id)]);
		expect(data.fields.filter((f) => f.id === `${TABLE}-id`)).toHaveLength(1);
		const register = saves.documents.mock.calls[0]?.[0] as { sources: { id: string; note: string }[] };
		expect(register.sources.map((s) => s.id)).toEqual([requestSourceId(request.id)]);
	});
});
