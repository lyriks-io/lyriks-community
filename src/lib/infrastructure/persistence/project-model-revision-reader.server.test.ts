import { describe, expect, it, vi } from 'vitest';
import type { DraftLockPort, SectionDocumentStorePort } from '$application/ports';
import { ProjectModelRevisionReader } from './project-model-revision-reader.server';

const SECTIONS = ['features', 'users', 'data'];

const documentRevisions = new Map([
	['features', 4],
	['data', 2]
]);
const legacyRevisions = new Map([
	['features', 7],
	['users', 1]
]);

/** A document store that answers one section at a time only. */
function perSectionDocuments(): SectionDocumentStorePort & { reads: number } {
	const store = {
		reads: 0,
		load: async () => null,
		save: async () => null,
		currentRevision: async (_projectId: string, section: string) => {
			store.reads += 1;
			return documentRevisions.get(section) ?? 0;
		}
	};
	return store;
}

/** The same store, able to hand every revision back in one read. */
function batchedDocuments(): SectionDocumentStorePort & { reads: number } {
	const store = {
		...perSectionDocuments(),
		currentRevisions: async () => {
			store.reads += 1;
			return documentRevisions;
		}
	};
	return store;
}

function perSectionLocks(): DraftLockPort & { reads: number } {
	const locks = {
		reads: 0,
		current: async (_projectId: string, section: string) => {
			locks.reads += 1;
			return legacyRevisions.get(section) ?? 0;
		},
		commit: async () => null,
		rollback: async () => {}
	};
	return locks;
}

function batchedLocks(): DraftLockPort & { reads: number } {
	const locks = {
		...perSectionLocks(),
		currentRevisions: async () => {
			locks.reads += 1;
			return legacyRevisions;
		}
	};
	return locks;
}

describe('ProjectModelRevisionReader', () => {
	it('fingerprints the same model identically whether the stores batch or not', async () => {
		const slow = new ProjectModelRevisionReader(SECTIONS, perSectionDocuments(), perSectionLocks());
		const fast = new ProjectModelRevisionReader(SECTIONS, batchedDocuments(), batchedLocks());

		expect(await fast.fingerprint('p1')).toBe(await slow.fingerprint('p1'));
	});

	it('reads each store once when it can batch, once per section otherwise', async () => {
		const documents = batchedDocuments();
		const locks = perSectionLocks();
		await new ProjectModelRevisionReader(SECTIONS, documents, locks).fingerprint('p1');

		expect(documents.reads).toBe(1);
		expect(locks.reads).toBe(SECTIONS.length);
	});

	it('moves when any section revision moves, in either channel', async () => {
		const documents = batchedDocuments();
		const locks = batchedLocks();
		const reader = new ProjectModelRevisionReader(SECTIONS, documents, locks);
		const before = await reader.fingerprint('p1');

		documents.currentRevisions = vi.fn(async () => new Map([...documentRevisions, ['data', 3]]));
		const afterDocument = await reader.fingerprint('p1');
		expect(afterDocument).not.toBe(before);

		locks.currentRevisions = vi.fn(async () => new Map([...legacyRevisions, ['users', 2]]));
		const afterLegacy = await reader.fingerprint('p1');
		expect(afterLegacy).not.toBe(afterDocument);
	});

	it('ignores sections the reader was not given, so an unrelated table row cannot move the key', async () => {
		const documents = batchedDocuments();
		documents.currentRevisions = async () => new Map([...documentRevisions, ['scope', 99]]);
		const reader = new ProjectModelRevisionReader(SECTIONS, documents, batchedLocks());
		const plain = new ProjectModelRevisionReader(SECTIONS, batchedDocuments(), batchedLocks());

		expect(await reader.fingerprint('p1')).toBe(await plain.fingerprint('p1'));
	});
});
