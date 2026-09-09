import { describe, it, expect } from 'vitest';
import type {
	BehaviorRepositoryPort,
	ProjectResidueRepositoryPort,
	RulesDraftRepositoryPort
} from '$application/ports';
import { createEmptyRulesDraft, createIssue, createEdgeCase, type ProjectRulesDraft } from '$domain/rules';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { LocalBehaviorPort } from '$infrastructure/behavior/local-behavior-port.server';
import { ResidueRulesDraftRepository } from './residue-rules-draft-repository.server';

class MemResidue implements ProjectResidueRepositoryPort {
	store = new Map<string, unknown>();
	async load(projectId: string, section: string) {
		return this.store.get(`${projectId}/${section}`) ?? null;
	}
	async save(projectId: string, section: string, payload: unknown) {
		this.store.set(`${projectId}/${section}`, payload);
	}
}

class MemRepo implements BehaviorRepositoryPort {
	projects = new Map<string, UnspaProjectSnapshot>();
	features = new Map<string, UnspaFeatureSnapshot>();
	async loadProject(id: string) {
		return this.projects.get(id) ?? null;
	}
	async saveProject(s: UnspaProjectSnapshot) {
		this.projects.set(s.project.id, s);
	}
	async loadFeature(pid: string, fid: string) {
		return this.features.get(`${pid}/${fid}`) ?? null;
	}
	async saveFeature(pid: string, s: UnspaFeatureSnapshot) {
		this.features.set(`${pid}/${(s.feature as { id: string }).id}`, s);
	}
	async deleteProject() {}
	workspaceRoot() {
		return '/mem';
	}
}

const legacyOf = (draft: ProjectRulesDraft | null): RulesDraftRepositoryPort => ({
	load: async () => draft,
	save: async () => {}
});

function makeRepo(legacy: ProjectRulesDraft | null = null) {
	const mem = new MemRepo();
	const port = new LocalBehaviorPort(mem, { nowIso: () => '2026-01-01T00:00:00.000Z' });
	const residue = new MemResidue();
	return { mem, residue, repo: new ResidueRulesDraftRepository(residue, port, legacyOf(legacy)) };
}

function sampleDraft(projectId: string): ProjectRulesDraft {
	const d = createEmptyRulesDraft(projectId);
	d.issues = [createIssue({ id: 'i1', title: 'Contradiction', severity: 'critical' })];
	d.scenarios = [
		createEdgeCase({
			id: 'ec1',
			title: 'Refund after ship',
			given: 'order is shipped',
			whenText: 'user requests a refund',
			then: 'refund is blocked',
			expectedOutcome: 'blocked',
			relatedJourneyId: 'J7'
		})
	];
	// inventory is derived — should NOT be persisted/round-tripped by this adapter.
	d.inventory = [{ id: 'r1', label: 'x', category: 'business', source: 'definition_rule', sourceRefId: 's', statement: 'y', mandatory: true }];
	d.lastSavedAt = '2026-01-01T00:00:00.000Z';
	return d;
}

/** Seed a `<pid>__experience` feature so the acceptance mirror has a target. */
function seedExperienceFeature(mem: MemRepo, pid: string, extra: Record<string, unknown> = {}) {
	mem.features.set(`${pid}/${pid}__experience`, {
		format: 'unspaghettit',
		version: 1,
		feature: { id: `${pid}__experience`, name: 'Experience', surfaces: [], personas: [], events: [], ...extra }
	} as UnspaFeatureSnapshot);
}

describe('ResidueRulesDraftRepository (Phase 3 Rules flip + Phase 4 acceptance fold-in)', () => {
	it('round-trips the authored draft through the residue (inventory dropped)', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const back = (await repo.load('p1'))!;

		expect(back.issues.map((i) => i.id)).toEqual(['i1']);
		expect(back.scenarios.map((s) => s.id)).toEqual(['ec1']);
		expect(back.lastSavedAt).toBe('2026-01-01T00:00:00.000Z');
		expect(back.inventory).toEqual([]); // derived, recomputed by the load use-case
	});

	it('backfills from the legacy SQLite draft on first read', async () => {
		const { residue, repo } = makeRepo(sampleDraft('p1'));
		expect(residue.store.size).toBe(0); // residue empty before read
		const back = (await repo.load('p1'))!;
		expect(back.issues.map((i) => i.id)).toEqual(['i1']);
		expect(residue.store.get('p1/rules')).toBeTruthy(); // seeded
	});

	it('returns null when nothing is authored yet', async () => {
		const { repo } = makeRepo();
		expect(await repo.load('p1')).toBeNull();
	});

	it('does not backfill an empty legacy draft', async () => {
		const { repo } = makeRepo(createEmptyRulesDraft('p1'));
		expect(await repo.load('p1')).toBeNull();
	});

	it('projects edge cases as acceptance criteria onto the Experience feature', async () => {
		const { mem, repo } = makeRepo();
		seedExperienceFeature(mem, 'p1');
		await repo.save(sampleDraft('p1'));

		const ac = (mem.features.get('p1/p1__experience')!.feature as { acceptanceCriteria: Record<string, unknown>[] })
			.acceptanceCriteria;
		expect(ac).toHaveLength(1);
		expect(ac[0]).toMatchObject({
			id: 'ac-edge-ec1',
			title: 'Refund after ship',
			given: 'order is shipped',
			when: 'user requests a refund',
			then: 'refund is blocked',
			expectedOutcome: 'blocked', // Rules 'blocked' → unspa 'blocked'
			relatedSurfaceId: 'srf-J7'
		});
	});

	it('is a no-op when the Experience feature does not exist yet', async () => {
		const { mem, repo } = makeRepo();
		await repo.save(sampleDraft('p1')); // no experience feature seeded
		expect(mem.features.get('p1/p1__experience')).toBeUndefined();
	});

	it('replaces ac-edge-* rows but preserves dashboard-authored criteria', async () => {
		const { mem, repo } = makeRepo();
		seedExperienceFeature(mem, 'p1', {
			acceptanceCriteria: [
				{ id: 'ac-dashboard-1', title: 'Hand-authored', given: '', when: '', then: '', expectedOutcome: 'success' },
				{ id: 'ac-edge-stale', title: 'Old projected row', given: '', when: '', then: '', expectedOutcome: 'success' }
			]
		});
		await repo.save(sampleDraft('p1'));

		const ac = (mem.features.get('p1/p1__experience')!.feature as { acceptanceCriteria: { id: string }[] })
			.acceptanceCriteria;
		expect(ac.map((c) => c.id).sort()).toEqual(['ac-dashboard-1', 'ac-edge-ec1']); // stale ac-edge dropped, dashboard kept
	});

	it('clears projected rows when the last edge case is deleted', async () => {
		const { mem, repo } = makeRepo();
		seedExperienceFeature(mem, 'p1');
		await repo.save(sampleDraft('p1'));
		const noEdges = { ...sampleDraft('p1'), scenarios: [] };
		await repo.save(noEdges);

		const ac = (mem.features.get('p1/p1__experience')!.feature as { acceptanceCriteria: unknown[] }).acceptanceCriteria;
		expect(ac).toEqual([]);
	});
});
