import { describe, expect, it } from 'vitest';
import type { SectionDocumentStorePort } from '../ports/section-documents';
import { PlaceMapTablesUseCase } from './place-map-tables';

/** A store whose first save loses to another writer, as two people moving tables at once. */
function racingStore(): SectionDocumentStorePort & { doc: unknown } {
	let revision = 1;
	let lost = false;
	const store = {
		doc: { tables: { link: { x: 0, y: 0 } } } as unknown,
		async load() {
			return store.doc;
		},
		async currentRevision() {
			return revision;
		},
		async save(_p: string, _s: string, document: unknown, expected: number | null) {
			if (!lost) {
				lost = true;
				store.doc = { tables: { link: { x: 0, y: 0 }, user: { x: 50, y: 50 } } };
				revision++;
				return null;
			}
			if (expected !== revision) return null;
			store.doc = document;
			return ++revision;
		}
	};
	return store;
}

describe('a move is kept for the project, apart from the spec [criterion:7f5769bb]', () => {
	it('replays a move on what another writer saved meanwhile', async () => {
		const store = racingStore();
		const result = await new PlaceMapTablesUseCase(store, 'data-map-placements').execute('p', { kind: 'move', tableId: 'visit', x: 10, y: 20 }, null);
		expect(result.ok).toBe(true);
		expect(store.doc).toEqual({ tables: { link: { x: 0, y: 0 }, user: { x: 50, y: 50 }, visit: { x: 10, y: 20 } } });
	});
});
