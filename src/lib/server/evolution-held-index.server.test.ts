import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLDINGS_NOT_REREAD } from '$domain/evolution';
import type { AppServices } from '$composition/container.server';

const engine = vi.hoisted(() => ({ answers: true }));
vi.mock('./evolution-graph.server', () => ({
	// The engine answers that the draft's model makes nothing more than its criteria, or does not answer at all.
	readDraftFeature: async () => (engine.answers ? { status: 'none' } : { status: 'unanswered' }),
	readStoredFeature: async () => ({ status: 'read', feature: null })
}));

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

function servicesWithRevisions(saves: (number | null)[], held: Record<string, unknown> = {}) {
	const saved: unknown[] = [];
	let revision = 10;
	const services = {
		loadEvolutionDraft: { execute: async () => ({ requests: [{ ...structuredClone(request), heldImplementation: structuredClone(held) }] }) },
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

beforeEach(() => {
	engine.answers = true;
});

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

describe('a sync keeps a request\'s holdings when its drafts cannot be read [criterion:39c8df88]', () => {
	const kept = { 'criterion:ac-leaf-c1': { status: 'implemented', file: 'a.ts', line: 1, signature: 'x' }, 'rule:r9': { status: 'implemented', file: 'b.ts', line: 2, signature: 'y' } };

	it('neither releases nor holds again what the request holds, and says why', async () => {
		engine.answers = false;
		const { services, saved } = servicesWithRevisions([12], kept);
		// The index now resolves rule:r9 elsewhere: with the drafts read, it would be released as landed.
		const out = await holdDraftEntries(services, 'p', { ...index, 'rule:r9': kept['rule:r9'] } as never, answer as never);
		expect(saved).toHaveLength(0);
		expect(out.heldForEvolution).toBeUndefined();
		expect(out.holdingsNotReread).toEqual([{ requestId: 'req-1', title: 'Community scope', reason: HOLDINGS_NOT_REREAD }]);
		// What it would have held stays an orphan meanwhile.
		expect(out.orphans).toEqual(answer.orphans);
		expect(out.ok).toBe(false);
	});

	it('releases what landed once the engine answers again', async () => {
		const { services, saved } = servicesWithRevisions([12], kept);
		const out = await holdDraftEntries(services, 'p', { ...index, 'rule:r9': kept['rule:r9'] } as never, answer as never);
		const held = (saved[0] as { requests: { heldImplementation: Record<string, unknown> }[] }).requests[0].heldImplementation;
		expect(Object.keys(held)).toEqual(['criterion:ac-leaf-c1']);
		expect(out.holdingsNotReread).toBeUndefined();
	});
});
