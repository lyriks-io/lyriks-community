import { describe, expect, it } from 'vitest';
import {
	contentHash,
	planReconciliation,
	stableStringify,
	type CandidateFolder
} from './reconciliation-plan';

const feat = (id: string, content: Record<string, unknown> = {}): { id: string; content: unknown } => ({
	id,
	content: { id, ...content }
});
const folder = (folderKey: string, featureIds: string[], features = featureIds.map((f) => feat(f))): CandidateFolder => ({
	folderKey,
	manifest: { projectId: folderKey, name: folderKey, featureIds },
	features
});

describe('stableStringify / contentHash', () => {
	it('is order-insensitive over object keys', () => {
		expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
		expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
	});
	it('distinguishes materially different content', () => {
		expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
	});
});

describe('planReconciliation', () => {
	it('marks a single already-canonical folder clean', () => {
		const plan = planReconciliation('proj', 'uuid', [folder('uuid', ['f1'])]);
		expect(plan.status).toBe('clean');
		expect(plan.quarantineActions).toHaveLength(0);
		expect(plan.canonicalManifest.featureIds).toEqual(['f1']);
	});

	it('adopts a non-overlapping feature from a twin and quarantines it', () => {
		const plan = planReconciliation('proj', 'uuid', [folder('uuid', ['f1']), folder('slug', ['f2'])]);
		expect(plan.status).toBe('auto-resolvable');
		expect(plan.mergedFeatures.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
		expect(plan.automaticActions).toContainEqual({ kind: 'adopt-feature', featureId: 'f2', fromFolderKey: 'slug' });
		expect(plan.quarantineActions).toEqual([{ folderKey: 'slug', reason: 'reconciled into uuid' }]);
		expect(plan.canonicalManifest.featureIds).toEqual(['f1', 'f2']);
	});

	it('dedups a byte/structurally identical feature across folders (key order ignored)', () => {
		const a = folder('uuid', ['f1'], [feat('f1', { x: 1, y: 2 })]);
		const b = folder('slug', ['f1'], [{ id: 'f1', content: { id: 'f1', y: 2, x: 1 } }]);
		const plan = planReconciliation('proj', 'uuid', [a, b]);
		expect(plan.status).toBe('auto-resolvable');
		expect(plan.conflicts).toHaveLength(0);
		expect(plan.mergedFeatures).toHaveLength(1);
		expect(plan.automaticActions).toContainEqual({ kind: 'keep-feature', featureId: 'f1', folderKey: 'uuid' });
		expect(plan.automaticActions).toContainEqual({ kind: 'dedup-feature', featureId: 'f1', duplicateFolderKeys: ['slug'] });
	});

	it('STOPS on a genuine conflict — never auto-picks, never latest-wins', () => {
		const a = folder('uuid', ['f1'], [feat('f1', { v: 1 })]);
		const b = folder('slug', ['f1'], [feat('f1', { v: 2 })]);
		const plan = planReconciliation('proj', 'uuid', [a, b]);
		expect(plan.status).toBe('conflicts');
		expect(plan.conflicts).toHaveLength(1);
		expect(plan.conflicts[0].featureId).toBe('f1');
		expect(plan.conflicts[0].versions).toHaveLength(2);
		// The conflicting feature is NOT merged.
		expect(plan.mergedFeatures.some((f) => f.id === 'f1')).toBe(false);
	});

	it('reports conflicts alongside auto-resolvable features in a mixed project', () => {
		const a = folder('uuid', ['f1', 'f2'], [feat('f1', { v: 1 }), feat('f2')]);
		const b = folder('slug', ['f1', 'f3'], [feat('f1', { v: 2 }), feat('f3')]);
		const plan = planReconciliation('proj', 'uuid', [a, b]);
		expect(plan.status).toBe('conflicts');
		expect(plan.conflicts.map((c) => c.featureId)).toEqual(['f1']);
		// f2 and f3 are still mergeable and reported.
		expect(plan.mergedFeatures.map((f) => f.id).sort()).toEqual(['f2', 'f3']);
	});

	it('handles a missing canonical folder by staging a fresh one from the twins', () => {
		// No folder named 'uuid' — canonical must be created; both twins are losers.
		const plan = planReconciliation('proj', 'uuid', [folder('slug-a', ['f1']), folder('slug-b', ['f2'])]);
		expect(plan.status).toBe('auto-resolvable');
		expect(plan.canonicalManifest.projectId).toBe('uuid');
		expect(plan.mergedFeatures.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
		expect(plan.quarantineActions.map((q) => q.folderKey).sort()).toEqual(['slug-a', 'slug-b']);
	});

	it('always names the canonical manifest id after the canonical key (on-disk invariant)', () => {
		const plan = planReconciliation('lyriks-proj', 'back-uuid', [folder('back-uuid', ['f1'])]);
		expect(plan.canonicalManifest.projectId).toBe('back-uuid');
	});
});
