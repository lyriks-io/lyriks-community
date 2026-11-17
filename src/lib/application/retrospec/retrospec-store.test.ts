import { describe, expect, it } from 'vitest';
import type { DraftLockPort, SectionDocumentStorePort } from '../ports';
import { loadRetrospecDocument, readSectionRevisions, saveRetrospecActs } from './retrospec-store';
import { parseRetrospecActs } from './parse-retrospec-acts';
import { RETROSPEC_SECTION, currentRun } from '$domain/retrospec';

/** An in-memory store whose next save can lose the race to another writer. */
function memoryStore(): SectionDocumentStorePort & { raceOnce: (doc: unknown) => void } {
	const docs = new Map<string, { doc: unknown; revision: number }>();
	let race: unknown = undefined;
	const key = (p: string, s: string) => `${p}|${s}`;
	return {
		raceOnce: (doc) => (race = doc),
		async load(p, s) {
			return docs.get(key(p, s))?.doc ?? null;
		},
		async currentRevision(p, s) {
			return docs.get(key(p, s))?.revision ?? 0;
		},
		async currentRevisions(p) {
			return new Map([...docs].filter(([k]) => k.startsWith(`${p}|`)).map(([k, v]) => [k.split('|')[1], v.revision]));
		},
		async save(p, s, doc, expected) {
			const current = docs.get(key(p, s))?.revision ?? 0;
			if (race !== undefined) {
				// Someone else saves first: the caller's expected revision is now stale.
				docs.set(key(p, s), { doc: race, revision: current + 1 });
				race = undefined;
				return null;
			}
			if (expected !== null && expected !== current) return null;
			docs.set(key(p, s), { doc, revision: current + 1 });
			return current + 1;
		}
	};
}

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const ctx = (actor = ana) => ({ actor, now: '2026-10-26T10:00:00.000Z' });

describe('saving acts on the retrospecification', () => {
	it('applies acts again on the document another person saved first', async () => {
		const store = memoryStore();
		await saveRetrospecActs(store, 'p', [{ op: 'start_review', total: 2 }], ctx(), null);
		const { doc: before } = await loadRetrospecDocument(store, 'p');
		// Bob validates "a" while Ana's save is on its way.
		const bobs = structuredClone(before) as unknown as { runs: { verdicts: Record<string, unknown> }[] };
		bobs.runs[0].verdicts.a = { title: 'A', tab: 'data', validatedBy: [{ person: bob, at: '2026-10-26T09:59:00.000Z' }], flag: null };
		store.raceOnce(bobs);
		const outcome = await saveRetrospecActs(store, 'p', [{ op: 'validate', itemId: 'b', title: 'B', tab: 'data' }], ctx(), null);
		expect(outcome.ok).toBe(true);
		const run = currentRun((await loadRetrospecDocument(store, 'p')).doc)!;
		expect(Object.keys(run.verdicts).sort()).toEqual(['a', 'b']);
	});

	it('answers the refusal of an act and saves nothing', async () => {
		const store = memoryStore();
		const outcome = await saveRetrospecActs(store, 'p', [{ op: 'publish', baselineId: null }], ctx(), null);
		expect(outcome).toMatchObject({ ok: false });
		expect(await store.currentRevision('p', RETROSPEC_SECTION)).toBe(0);
	});

	it('reads the revisions of both stores summed per key, its own document aside', async () => {
		const store = memoryStore();
		await saveRetrospecActs(store, 'p', [{ op: 'start_review', total: 1 }], ctx(), null);
		await store.save('p', 'glossary', {}, null, null);
		const locks: DraftLockPort = {
			current: async () => 0,
			currentRevisions: async () => new Map([['features', 4], ['glossary', 1]]),
			commit: async () => 1,
			rollback: async () => {}
		};
		expect(await readSectionRevisions(store, locks, 'p', ['features', 'glossary'])).toEqual({ features: 4, glossary: 2 });
	});
});

describe('reading the acts a page sends', () => {
	it('keeps what the server owns out of the body', () => {
		const parsed = parseRetrospecActs({ acts: [{ op: 'start', mode: 'docs', baseline: { features: 99 } }, { op: 'publish', baselineId: 'forged' }] });
		expect(parsed).toEqual({ ok: true, acts: [{ op: 'start', mode: 'docs' }, { op: 'publish' }] });
	});

	it('refuses a body it cannot read whole', () => {
		expect(parseRetrospecActs({ acts: [] })).toMatchObject({ ok: false });
		expect(parseRetrospecActs({ acts: [{ op: 'validate' }] })).toMatchObject({ ok: false, reason: 'itemId is required.' });
		expect(parseRetrospecActs({ acts: [{ op: 'share', itemId: 'x' }] })).toMatchObject({ ok: false });
		expect(parseRetrospecActs({ acts: [{ op: 'drop_table' }] })).toMatchObject({ ok: false });
		expect(parseRetrospecActs({ acts: [{ op: 'validate', itemId: 'x', title: 'X', tab: 'data', total: 12.4 }] })).toEqual({
			ok: true,
			acts: [{ op: 'validate', itemId: 'x', title: 'X', tab: 'data', total: 12 }]
		});
	});
});
