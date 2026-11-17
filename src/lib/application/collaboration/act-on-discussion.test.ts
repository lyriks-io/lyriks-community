import { describe, expect, it } from 'vitest';
import type { SectionDocumentStorePort } from '../ports/section-documents';
import { ActOnDiscussionUseCase } from './act-on-discussion';
import { LoadDiscussionsUseCase } from './load-discussions';

const SECTION = 'spec-discussions';
const author = { email: 'carmen@acme.test', name: 'Carmen R.' };

/** An in-memory store with the optimistic revision protocol; `interleave` writes once before the next save. */
function memoryStore() {
	const rows = new Map<string, { document: unknown; revision: number }>();
	const published: string[] = [];
	let interleave: (() => void) | null = null;
	const key = (p: string, s: string) => `${p}|${s}`;
	const store: SectionDocumentStorePort = {
		async load(p, s) {
			return rows.get(key(p, s))?.document ?? null;
		},
		async currentRevision(p, s) {
			return rows.get(key(p, s))?.revision ?? 0;
		},
		async save(p, s, document, expected, origin) {
			if (interleave) {
				const write = interleave;
				interleave = null;
				write();
			}
			const current = rows.get(key(p, s))?.revision ?? 0;
			if (expected !== null && expected !== current) return null;
			rows.set(key(p, s), { document: JSON.parse(JSON.stringify(document)), revision: current + 1 });
			published.push(`${s}@${origin ?? 'internal'}`);
			return current + 1;
		}
	};
	return { store, published, rows, setInterleave: (fn: () => void) => (interleave = fn) };
}

const clock = { nowIso: () => '2026-10-26T10:00:00.000Z' };

describe('acting on a discussion', () => {
	it('opens a thread, saves it under the internal section and publishes the change', async () => {
		const { store, published } = memoryStore();
		let id = 0;
		const act = new ActOnDiscussionUseCase(store, SECTION, clock, () => `id-${++id}`);
		const out = await act.execute('p1', { kind: 'open', anchor: 'problem', anchorTitle: 'Current situation', text: 'Hi', notify: [] }, author, 'tab-1');
		expect(out).toMatchObject({ ok: true, revision: 1 });
		expect(published).toEqual(['spec-discussions@tab-1']);
		const loaded = await new LoadDiscussionsUseCase(store, SECTION).execute('p1');
		expect(loaded.revision).toBe(1);
		expect(loaded.document.threads[0]).toMatchObject({ id: 'id-1', anchor: 'problem', state: 'open' });
	});

	it('replays the act on a newer document when someone wrote in between', async () => {
		const { store, rows, setInterleave } = memoryStore();
		let id = 0;
		const act = new ActOnDiscussionUseCase(store, SECTION, clock, () => `id-${++id}`);
		await act.execute('p1', { kind: 'open', anchor: 'problem', anchorTitle: '', text: 'First', notify: [] }, author, null);
		// Another tab opens a thread between our read and our save.
		setInterleave(() => {
			const row = rows.get(`p1|${SECTION}`)!;
			const doc = row.document as { threads: unknown[] };
			rows.set(`p1|${SECTION}`, {
				revision: row.revision + 1,
				document: { ...doc, threads: [...doc.threads, { id: 'other', anchor: 'target', anchorTitle: '', state: 'open', notify: [], messages: [{ id: 'mx', author, at: 'x', text: 'Other' }], rulings: [] }] }
			});
		});
		const out = await act.execute('p1', { kind: 'open', anchor: 'term:t-1', anchorTitle: 'Term', text: 'Second', notify: [] }, author, null);
		expect(out.ok).toBe(true);
		const loaded = await new LoadDiscussionsUseCase(store, SECTION).execute('p1');
		expect(loaded.document.threads.map((t) => t.messages[0].text)).toEqual(['First', 'Other', 'Second']);
	});

	it('answers a refusal without writing', async () => {
		const { store, published } = memoryStore();
		const act = new ActOnDiscussionUseCase(store, SECTION, clock, () => 'x');
		const out = await act.execute('p1', { kind: 'reply', threadId: 'missing', text: 'Hi' }, author, null);
		expect(out).toEqual({ ok: false, refusal: 'This discussion no longer exists.', conflict: false });
		expect(published).toEqual([]);
	});
});
