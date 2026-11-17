import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClockPort, PortfolioRepositoryPort, ProjectCatalogPort, ProjectPortabilityStorePort } from '$application/ports';
import { ExportProjectUseCase } from '$application/use-cases/portability/export-project';
import { ImportProjectUseCase } from '$application/use-cases/portability/import-project';
import { DetectFeatureIdCollisionUseCase } from '$application/specification/detect-feature-id-collision';
import { emptyRowSnapshot, readBundle, stableJson, type ProjectRowSnapshot, type ProjectSnapshot } from '$domain/portability';
import { copySnapshotFixture } from '$domain/portability/copy-snapshot.fixture';
import { FsReconciliationStore } from '../behavior/fs-reconciliation-store.server';
import { FsProjectLock } from '../behavior/fs-project-lock.server';
import { LocalFsBehaviorRepository } from '../behavior/local-fs-behavior-repository.server';
import { UnspaEngineClient } from '../unspaghettit/unspa-engine-client.server';
import { ZipArchiveCodec } from './zip-archive-codec.server';

const roots: string[] = [];
const engines: UnspaEngineClient[] = [];
afterEach(async () => {
	await Promise.all(engines.splice(0).map(engine => engine.connected?.close()));
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const clock = { nowIso: () => '2026-11-12T00:00:00.000Z' } as ClockPort;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function inventory(dir: string): Record<string, string> {
	return Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
		const path = join(e.parentPath, e.name);
		return [path.slice(dir.length + 1), hash(readFileSync(path))];
	}).sort(([a], [b]) => a.localeCompare(b)));
}

async function harness(snapshot = copySnapshotFixture()) {
	const root = mkdtempSync(join(tmpdir(), 'lyriks-copy-'));
	roots.push(root);
	const kernel = new FsReconciliationStore(root);
	const behavior = new LocalFsBehaviorRepository(root);
	const archive = new ZipArchiveCodec();
	const stored = new Map<string, ProjectRowSnapshot>([[snapshot.projectId, structuredClone(snapshot.rows)]]);
	let failRows = false;
	const rows: ProjectPortabilityStorePort = {
		read: async id => structuredClone(stored.get(id) ?? emptyRowSnapshot()),
		exists: async id => stored.has(id),
		write: async (id, value) => {
			if (failRows) throw new Error('Rows unavailable');
			stored.set(id, structuredClone(value));
		}
	};
	const portfolio = { listDomains: async () => snapshot.domain ? [{ ...snapshot.domain, createdAt: clock.nowIso() }] : [], saveDomain: async () => {} } as unknown as PortfolioRepositoryPort;
	const catalog = { remove: async (id: string) => { stored.delete(id); } } as unknown as ProjectCatalogPort;
	let next = 1;
	const exporter = new ExportProjectUseCase(rows, kernel, portfolio, archive, clock, hash, 'test');
	const importer = new ImportProjectUseCase(rows, kernel, behavior, catalog, portfolio, new FsProjectLock(root), archive, clock, () => String(next++).padStart(6, '0'));
	await kernel.promoteCanonical({ canonicalKernelId: snapshot.projectId, project: snapshot.kernel.project!, features: snapshot.kernel.features.map(f => f.feature), artifacts: snapshot.kernel.artifacts ?? [], quarantineStamp: 'seed' });
	async function load(id: string) {
		const exported = await exporter.execute(id);
		expect(exported).not.toBeNull();
		const parsed = readBundle(archive.decode(exported!.bytes));
		if (!parsed.ok) throw new Error(parsed.error);
		return parsed.snapshot;
	}
	return { root, kernel, behavior, exporter, importer, load, stored, failRows: () => { failRows = true; } };
}

/** Compare every stored value after undoing only the copy's new global identities. */
function assertFaithful(original: ProjectSnapshot, copy: ProjectSnapshot) {
	const records = new Map<string, string>([[copy.projectId, original.projectId]]);
	const originalLeaves = original.kernel.features.filter(f => !f.id.startsWith(`${original.projectId}__`)).map(f => f.id).sort();
	for (const [i, id] of originalLeaves.entries()) records.set(`feat-${copy.projectId}-${i + 1}`, id);
	for (const suffix of ['__experience', '__data_model']) records.set(`${copy.projectId}${suffix}`, `${original.projectId}${suffix}`);
	const sourceIds = original.kernel.artifacts!.filter(a => a.kind === 'source').map(a => a.id).sort();
	for (const [i, id] of sourceIds.entries()) records.set(`src-${copy.projectId}-${i + 1}`, id);
	const token = (s: string): string => records.get(s) ?? s.split('::').map(part => records.get(part) ?? part.split(':').map(p => records.get(p) ?? p).join(':')).join('::');
	function normalize(value: unknown): unknown {
		if (typeof value === 'string') return token(value);
		if (Array.isArray(value)) return value.map(normalize);
		if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [token(k), normalize(v)]));
		return value;
	}
	const sorted = (rows: readonly { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
	expect(stableJson(sorted(normalize(copy.kernel.features) as typeof copy.kernel.features))).toBe(stableJson(sorted(original.kernel.features)));
	expect(normalize(copy.kernel.project)).toEqual(original.kernel.project);
	expect(normalize(copy.rows.sectionDocuments)).toEqual(original.rows.sectionDocuments);
	expect(normalize(copy.rows.legacyDocuments)).toEqual(original.rows.legacyDocuments);
	expect(normalize(copy.rows.residue)).toEqual(Object.fromEntries(Object.entries(original.rows.residue).filter(([key]) => !key.startsWith('cache:') || key === 'cache:score-history')));
	const artifacts = (snapshot: ProjectSnapshot) => [...snapshot.kernel.artifacts!].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
	expect(stableJson(artifacts({ ...copy, kernel: { ...copy.kernel, artifacts: normalize(copy.kernel.artifacts) as typeof copy.kernel.artifacts } }))).toBe(stableJson(artifacts(original)));
	// Compare source bodies verbatim apart from their explicitly changed identity slots.
	for (const artifact of copy.kernel.artifacts!.filter(a => a.kind === 'source')) {
		const originalId = records.get(artifact.id)!;
		const prior = original.kernel.artifacts!.find(a => a.kind === 'source' && a.id === originalId)!;
		const body = artifact.document.source as Record<string, unknown>;
		const { id: _id, projectId: _project, supersedes: _supersedes, ...content } = body;
		const { id: _oldId, projectId: _oldProject, supersedes: _oldSupersedes, ...oldContent } = prior.document.source as Record<string, unknown>;
		expect(content).toEqual(oldContent);
		expect(body.projectId).toBe(copy.projectId);
	}
	const oldIds = new Set([...original.kernel.features.map(f => f.id), ...sourceIds]);
	expect([...copy.kernel.features.map(f => f.id), ...copy.kernel.artifacts!.filter(a => a.kind === 'source').map(a => a.id)].filter(id => oldIds.has(id))).toEqual([]);
}

describe('project duplication through real archive and filesystem adapters', () => {
	it('copies the complete specification and evidence twice with no shared ids or source writes [criterion:85dc60c8]', async () => {
		const h = await harness();
		const original = await h.load('original-123456');
		const before = inventory(join(h.root, original.projectId));
		const exported = await h.exporter.execute(original.projectId);
		const first = await h.importer.execute({ bytes: exported!.bytes, mode: 'copy' });
		expect(first).toMatchObject({ ok: true, warnings: [] });
		if (!first.ok) return;
		const copied = await h.load(first.projectId);
		assertFaithful(original, copied);
		const copiedBefore = inventory(join(h.root, first.projectId));
		const copyArchive = await h.exporter.execute(first.projectId);
		const second = await h.importer.execute({ bytes: copyArchive!.bytes, mode: 'copy' });
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		assertFaithful(copied, await h.load(second.projectId));
		const detector = new DetectFeatureIdCollisionUseCase(h.behavior);
		for (const snapshot of [original, copied, await h.load(second.projectId)]) {
			for (const feature of snapshot.kernel.features) expect(await detector.execute(snapshot.projectId, feature.id)).toEqual([]);
		}
		await h.behavior.deleteProject(second.projectId);
		expect(inventory(join(h.root, original.projectId))).toEqual(before);
		expect(inventory(join(h.root, first.projectId))).toEqual(copiedBefore);
	});

	it('refuses corrupt evidence before replacing any existing models or evidence', async () => {
		const h = await harness();
		const snapshot = copySnapshotFixture();
		const before = inventory(join(h.root, snapshot.projectId));
		await expect(h.kernel.promoteCanonical({ canonicalKernelId: snapshot.projectId, project: snapshot.kernel.project!, features: [], artifacts: [{ ...snapshot.kernel.artifacts![0], id: '../outside' }], quarantineStamp: 'invalid' })).rejects.toThrow('Invalid project evidence');
		expect(inventory(join(h.root, snapshot.projectId))).toEqual(before);
		expect(existsSync(join(h.root, '.quarantine'))).toBe(false);
	});

	it('rolls back every newly copied evidence file when the rows cannot be saved', async () => {
		const h = await harness();
		const before = inventory(join(h.root, 'original-123456'));
		const exported = await h.exporter.execute('original-123456');
		h.failRows();
		const result = await h.importer.execute({ bytes: exported!.bytes, mode: 'copy' });
		expect(result).toEqual({ ok: false, error: 'Import failed: Rows unavailable' });
		expect(existsSync(join(h.root, 'example-000001'))).toBe(false);
		expect([...h.stored.keys()]).toEqual(['original-123456']);
		expect(inventory(join(h.root, 'original-123456'))).toEqual(before);
	});

	it('preserves evidence on a model-only reconciliation and clears it only on explicit replacement', async () => {
		const h = await harness();
		const [folder] = await h.kernel.loadCandidates(['original-123456']);
		const input = { canonicalKernelId: folder.folderKey, project: folder.project!, features: folder.features.map(f => f.feature), quarantineStamp: 'reconciled' };
		const before = inventory(join(h.root, folder.folderKey));
		await h.kernel.promoteCanonical(input);
		expect(inventory(join(h.root, folder.folderKey))).toEqual(before);
		await h.kernel.promoteCanonical({ ...input, quarantineStamp: 'restored', artifacts: [] });
		const [replaced] = await h.kernel.loadCandidates([folder.folderKey], { includeArtifacts: true });
		expect(replaced.artifacts).toEqual([]);
	});
});

const realFixture = process.env.LYRIKS_COPY_FIXTURE;
describe.runIf(!!realFixture)('production-sized copy regression (isolated local storage)', () => {
	it('retains every model and evidence record and edits source and copies independently in the real engine [criterion:85dc60c8] [criterion:3aef75c5] [criterion:496bdd57]', async () => {
		const source = JSON.parse(readFileSync(realFixture!, 'utf8')) as ProjectSnapshot;
		const h = await harness(source);
		const original = await h.load(source.projectId);
		const before = inventory(join(h.root, source.projectId));
		const exported = await h.exporter.execute(source.projectId);
		const first = await h.importer.execute({ bytes: exported!.bytes, mode: 'copy' });
		expect(first).toMatchObject({ ok: true, warnings: [] });
		if (!first.ok) throw new Error(first.error);
		const copy = await h.load(first.projectId);
		assertFaithful(original, copy);
		const secondArchive = await h.exporter.execute(first.projectId);
		const second = await h.importer.execute({ bytes: secondArchive!.bytes, mode: 'copy' });
		if (!second.ok) throw new Error(second.error);
		assertFaithful(copy, await h.load(second.projectId));
		const firstProjectId = first.projectId;
		const secondProjectId = second.projectId;
		const signIn = original.kernel.features.find(f => f.id === 'feat-lk26-sign-in')!;
		expect(signIn).toBeDefined();
		const position = original.kernel.features.filter(f => !f.id.startsWith(`${original.projectId}__`)).map(f => f.id).sort().indexOf(signIn.id) + 1;
		const copiedFeatureId = `feat-${first.projectId}-${position}`;
		const secondFeatureId = `feat-${second.projectId}-${copy.kernel.features.filter(f => !f.id.startsWith(`${copy.projectId}__`)).map(f => f.id).sort().indexOf(copiedFeatureId) + 1}`;
		const detector = new DetectFeatureIdCollisionUseCase(h.behavior);
		for (const [projectId, featureId] of [[source.projectId, signIn.id], [first.projectId, copiedFeatureId], [second.projectId, secondFeatureId]]) expect(await detector.execute(projectId, featureId)).toEqual([]);
		const engine = new UnspaEngineClient({ snapshotsRoot: h.root, mcpBinPath: resolve('node_modules/unspaghettit/mcp-server/bin.cjs'), proofs: false }, 'copy-integrity-test');
		engines.push(engine);
		const originalSourceCount = original.kernel.artifacts!.filter(a => a.kind === 'source').length;
		expect(await engine.callJson('list_sources', { projectId: firstProjectId })).toMatchObject({ projectId: firstProjectId, count: originalSourceCount });
		expect(await engine.callJson('get_provenance', { featureId: copiedFeatureId })).toMatchObject({ featureId: copiedFeatureId, spanCount: (copy.kernel.artifacts!.find(a => a.kind === 'provenance' && a.id === copiedFeatureId)!.document.provenance as { spans: unknown[] }).spans.length });
		expect(await engine.callJson('get_implementation_status', { featureId: copiedFeatureId })).toMatchObject({ featureId: copiedFeatureId });
		const surfaces = signIn.feature.surfaces as { id: string }[];
		async function edit(featureId: string, description: string) {
			const response = await engine.callJsonOrError('apply_batch', { featureId, operations: [{ kind: 'update_surface', surfaceId: surfaces[0].id, description }] });
			expect(response).toMatchObject({ ok: true, value: { ok: true } });
			const [folder] = await h.kernel.loadCandidates(featureId === signIn.id ? [source.projectId] : featureId === copiedFeatureId ? [firstProjectId] : [secondProjectId]);
			expect(folder.features.find(f => f.id === featureId)!.feature.surfaces).toEqual(expect.arrayContaining([expect.objectContaining({ id: surfaces[0].id, description })]));
		}
		const secondBefore = inventory(join(h.root, second.projectId));
		await edit(copiedFeatureId, 'Edited only in the first local copy');
		expect(inventory(join(h.root, source.projectId))).toEqual(before);
		expect(inventory(join(h.root, second.projectId))).toEqual(secondBefore);
		const firstAfterEdit = inventory(join(h.root, first.projectId));
		await edit(signIn.id, 'Edited only in the local original');
		expect(inventory(join(h.root, first.projectId))).toEqual(firstAfterEdit);
		expect(inventory(join(h.root, second.projectId))).toEqual(secondBefore);
		await edit(secondFeatureId, 'Edited only in the second local copy');
		expect(inventory(join(h.root, first.projectId))).toEqual(firstAfterEdit);
		if (process.env.LYRIKS_COPY_REPORT) writeFileSync(process.env.LYRIKS_COPY_REPORT, JSON.stringify({ passed: true, sourceProjectId: source.projectId, localCopyIds: [first.projectId, second.projectId], models: original.kernel.features.length, evidence: original.kernel.artifacts!.length, sourceFiles: original.kernel.artifacts!.filter(a => a.kind === 'source').length, provenanceFiles: original.kernel.artifacts!.filter(a => a.kind === 'provenance').length, implementationFiles: original.kernel.artifacts!.filter(a => a.kind === 'implementation').length, archiveBytes: exported!.bytes.length, independentEngineEdits: 3, originalUnchangedByCopy: true, completedAt: new Date().toISOString() }, null, 2));
	}, 120_000);
});
