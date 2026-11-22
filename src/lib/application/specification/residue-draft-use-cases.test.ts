import { describe, expect, it } from 'vitest';
import type { SectionDraftRepositoryPort } from '../ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase, type ResidueDraft } from './residue-draft-use-cases';

interface Notes extends ResidueDraft {
	text: string;
}
const empty = (projectId: string): Notes => ({ projectId, text: '', lastSavedAt: null });

/** One section of one project, its next save answering `revision` (null: changed elsewhere). */
class Section implements SectionDraftRepositoryPort<Notes> {
	saved: Notes[] = [];
	constructor(
		private stored: Notes | null,
		private readonly revision: number | null = 3
	) {}
	async load() {
		return this.stored;
	}
	async save(draft: Notes) {
		if (this.revision === null) return null;
		this.saved.push(draft);
		this.stored = draft;
		return this.revision;
	}
	async currentRevision() {
		return 2;
	}
}

describe('a section only Lyriks keeps', () => {
	it('loads what was saved, or an empty draft for the project', async () => {
		expect(await new LoadResidueDraftUseCase(new Section({ ...empty('p'), text: 'kept' }), empty).execute('p')).toMatchObject({ text: 'kept' });
		expect(await new LoadResidueDraftUseCase(new Section(null), empty).execute('p')).toEqual(empty('p'));
	});

	it('saves the draft stamped and answers the new revision, or nothing when it changed elsewhere', async () => {
		const section = new Section(null);
		const clock = { nowIso: () => '2026-11-18T09:00:00.000Z' };
		expect(await new SaveResidueDraftUseCase(section, clock).execute({ ...empty('p'), text: 'v1' })).toEqual({ savedAt: '2026-11-18T09:00:00.000Z', revision: 3 });
		expect(section.saved).toEqual([{ projectId: 'p', text: 'v1', lastSavedAt: '2026-11-18T09:00:00.000Z' }]);
		expect(await new SaveResidueDraftUseCase(new Section(null, null), clock).execute(empty('p'))).toBeNull();
	});
});
