import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';

vi.mock('./evolution-graph.server', () => ({ draftFeature: async () => null }));

const { holdDraftEntries } = await import('./evolution-held-index.server');

const request = {
	id: 'req-1',
	title: 'Community scope',
	status: 'open',
	stage: 'implementation',
	deployment: null,
	heldImplementation: {},
	drafts: [{ id: 'draft:d1', kind: 'amend', baseLeafId: 'feat-1', materialisedAs: null, materialisedAt: null, acceptanceCriteria: [{ id: 'c1', text: 'A rule' }] }]
};

function servicesWithRevisions(saves: (number | null)[]) {
	const saved: unknown[] = [];
	let revision = 10;
	const services = {
		loadEvolutionDraft: { execute: async () => ({ requests: [structuredClone(request)] }) },
		sectionDocuments: { currentRevision: async () => revision++ },
		loadFeaturesDraft: { execute: async () => ({ leafMeta: {} }) },
		readBehaviorFeature: { execute: async () => null },
		saveEvolutionDraft: {
			execute: async (draft: unknown) => {
				const next = saves.shift() ?? null;
				if (next !== null) saved.push(draft);
				return next === null ? null : { savedAt: 'now', revision: next };
			}
		}
	} as unknown as AppServices;
	return { services, saved };
}

const index = { 'criterion:ac-leaf-c1': { status: 'implemented', file: 'a.ts', line: 1, signature: 'x' } };
const answer = { ok: false, orphans: { total: 1, entries: [{ key: 'criterion:ac-leaf-c1' }] } };

describe('index entries held on an Evolution request (ac-evo-impl-held)', () => {
	it('reads the dossier again and holds the entries when the first save is refused on its revision', async () => {
		const { services, saved } = servicesWithRevisions([null, 12]);
		const out = await holdDraftEntries(services, 'p', index as never, answer as never);
		expect(saved).toHaveLength(1);
		const held = (saved[0] as { requests: { heldImplementation: Record<string, unknown> }[] }).requests[0].heldImplementation;
		expect(Object.keys(held)).toEqual(['criterion:ac-leaf-c1']);
		expect(out.heldForEvolution).toEqual([{ requestId: 'req-1', title: 'Community scope', keys: ['criterion:ac-leaf-c1'] }]);
	});

	it('says the sync failed instead of reporting entries held that were never written', async () => {
		const { services } = servicesWithRevisions([null, null, null, null, null]);
		await expect(holdDraftEntries(services, 'p', index as never, answer as never)).rejects.toThrow(/could not be held/);
	});
});
