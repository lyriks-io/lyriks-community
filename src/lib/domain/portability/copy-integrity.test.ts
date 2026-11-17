import { describe, expect, it } from 'vitest';
import { buildBundle } from './build-bundle';
import { readBundle } from './read-bundle';
import { rehomeSnapshot } from './rehome-snapshot';
import { KERNEL_ARTIFACTS_PATH, MANIFEST_PATH } from './bundle';
import { kernelArtifactPath } from './kernel-artifacts';
import { copySnapshotFixture } from './copy-snapshot.fixture';
import { copyReferences } from './copy-references';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function files() {
	return new Map(buildBundle({ snapshot: copySnapshotFixture(), exportedAt: '2026-11-12T00:00:00Z', appVersion: 'test', hash: bytes => String(bytes.length) }).map(e => [e.path, e.bytes]));
}

describe('a complete and independent project copy', () => {
	it('round-trips evidence envelopes without changing source text, spans or test results [criterion:46650eb1] [criterion:496bdd57]', () => {
		const source = copySnapshotFixture();
		const parsed = readBundle(files());
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.warnings).toEqual([]);
		expect(parsed.snapshot.kernel.artifacts).toEqual(source.kernel.artifacts);
		expect(new TextDecoder().decode(files().get(KERNEL_ARTIFACTS_PATH))).toContain('data:text/plain;base64,');
	});

	it('rewires record ownership, source links, keyed permissions and dependencies while preserving literals [criterion:7e7d5506]', () => {
		const source = copySnapshotFixture();
		const before = structuredClone(source);
		const copy = rehomeSnapshot(source, { projectId: 'copy-abcdef' });
		const leaf = copy.kernel.features[0];
		const attached = copy.kernel.artifacts!.filter(a => a.kind === 'source');
		const sourceId = attached[0].id;
		expect(leaf.id).not.toBe(source.kernel.features[0].id);
		expect(leaf.feature.id).toBe(leaf.id);
		expect(copy.kernel.project!.featureIds).toEqual(copy.kernel.features.map(f => f.id));
		expect(leaf.feature.dependsOn).toEqual(['copy-abcdef__experience']);
		expect(copy.rows.sectionDocuments.scope.document).toEqual({ capabilities: [{ featureIds: [leaf.id] }] });
		expect(copy.rows.sectionDocuments.documents.document).toEqual({ sources: [{ id: 'catalog-source', stored: { id: sourceId, hash: 'unchanged-hash' } }] });
		expect(copy.rows.residue.features).toEqual({ leafMeta: { [leaf.id]: { sourceIds: [sourceId] } } });
		expect(copy.rows.residue.users).toEqual({ permissions: { [`action:${leaf.id}:action-submit`]: 'allowed' }, assignments: { [`${leaf.id}::action-submit`]: 'owner' } });
		expect(copy.rows.residue).not.toHaveProperty('cache:project-health');
		expect(copy.rows.residue['cache:score-history']).toEqual([{ score: 42 }]);
		// The same opaque string is a source id in source slots and a local action id elsewhere.
		expect(sourceId).not.toBe('action-submit');
		expect(leaf.feature).toMatchObject({ description: 'feat-sign-in', stateVariables: [{ defaultValue: 'feat-sign-in' }], surfaces: [{ actions: [{ id: 'action-submit', scenarios: [{ parameterOverrides: [{ value: 'feat-sign-in' }] }] }] }] });
		expect(attached[0].document.source).toMatchObject({ id: sourceId, projectId: copy.projectId, name: 'feat-sign-in', content: (source.kernel.artifacts![0].document.source as Record<string, unknown>).content, supersedes: attached[1].id });
		expect(copy.kernel.artifacts![2].document.provenance).toMatchObject({ featureId: leaf.id, sourceIds: [sourceId], spans: [{ elementId: 'action-submit', sourceId, snippet: source.projectId, startOffset: 2, endOffset: 10 }], candidates: [{ span: { sourceId, snippet: 'feat-sign-in' }, decision: 'accepted' }] });
		expect(copy.kernel.artifacts![3].document.status).toMatchObject({ featureId: leaf.id, actions: [{ actionId: 'action-submit', sourceId, path: 'feat-sign-in', code: source.projectId, capturedFields: { featureId: 'feat-sign-in' } }], criteria: [{ lastResult: { status: 'passed', message: 'feat-sign-in' } }] });
		expect(source).toEqual(before);
	});

	it('uses the typed source namespace even when a feature has the same old id', () => {
		const ids = { records: new Map([['same', 'copied-feature']]), sources: new Map([['same', 'copied-source']]) };
		expect(copyReferences({ featureId: 'same', sources: [{ id: 'same', stored: { id: 'same', hash: 'same' } }] }, ids)).toEqual({ featureId: 'copied-feature', sources: [{ id: 'copied-source', stored: { id: 'copied-source', hash: 'same' } }] });
	});

	it('can copy a copy without reusing any globally addressed identity', () => {
		const original = copySnapshotFixture();
		const copy = rehomeSnapshot(original, { projectId: 'copy-abcdef' });
		const second = rehomeSnapshot(copy, { projectId: 'second-abcdef' });
		for (const other of [original, copy]) {
			const ids = new Set([...other.kernel.features.map(f => f.id), ...other.kernel.artifacts!.filter(a => a.kind === 'source').map(a => a.id)]);
			expect([...second.kernel.features.map(f => f.id), ...second.kernel.artifacts!.filter(a => a.kind === 'source').map(a => a.id)].some(id => ids.has(id))).toBe(false);
		}
		expect(second.kernel.artifacts![0].document.source).toMatchObject({ contentHash: 'unchanged-hash' });
	});

	it('retains all identities and evidence when restoring to the original project', () => {
		const source = copySnapshotFixture();
		expect(rehomeSnapshot(source, { projectId: source.projectId })).toStrictEqual(source);
	});
});

describe('archive evidence validation', () => {
	it('recovers legacy version 1 specifications with a visible evidence warning [criterion:18786a22]', () => {
		const legacy = files();
		const manifest = JSON.parse(new TextDecoder().decode(legacy.get(MANIFEST_PATH)));
		manifest.bundleVersion = 1;
		delete manifest.counts.evidence;
		legacy.set(MANIFEST_PATH, encode(manifest));
		legacy.delete(KERNEL_ARTIFACTS_PATH);
		const result = readBundle(legacy);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings.join(' ')).toContain('no attached sources');
		expect(result.snapshot.kernel.features).toHaveLength(2);
	});

	it.each(['missing', 'malformed', 'duplicate', 'traversal', 'wrong-owner', 'count'])(
		'refuses %s evidence before any import can write', kind => {
			const archive = files();
			const artifacts = structuredClone(copySnapshotFixture().kernel.artifacts!);
			if (kind === 'missing') archive.delete(KERNEL_ARTIFACTS_PATH);
			if (kind === 'malformed') archive.set(KERNEL_ARTIFACTS_PATH, encode({}));
			if (kind === 'duplicate') archive.set(KERNEL_ARTIFACTS_PATH, encode([...artifacts, artifacts[0]]));
			if (kind === 'traversal') archive.set(KERNEL_ARTIFACTS_PATH, encode([{ ...artifacts[0], id: '../outside' }]));
			if (kind === 'wrong-owner') archive.set(KERNEL_ARTIFACTS_PATH, encode(artifacts.map(a => a.kind === 'provenance' ? { ...a, id: 'unrelated-feature', document: { ...a.document, provenance: { featureId: 'unrelated-feature' } } } : a)));
			if (kind === 'count') archive.set(KERNEL_ARTIFACTS_PATH, encode(artifacts.slice(1)));
			expect(readBundle(archive).ok).toBe(false);
		}
	);

	it('never lets an evidence envelope name a file outside its project', () => {
		const artifact = copySnapshotFixture().kernel.artifacts![0];
		expect(() => kernelArtifactPath({ ...artifact, id: '../outside' })).toThrow();
	});
});
