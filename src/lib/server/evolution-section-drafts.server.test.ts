import { describe, expect, it } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyDefinitionDraft } from '$domain/foundation';
import { createEmptyOperationsDraft } from '$domain/foundation';
import type { SectionDraft, SectionEdit } from '$domain/evolution';
import { checkSectionEdits, prepareSectionLanding, readSectionDrafts, sectionDraftHolds, writeSectionLandings } from './evolution-section-drafts.server';

/**
 * The pages of the spec a request changes, against the sections as they stand:
 * checked when drafted, read before and after, and written at the landing
 * through each section's own guards, parser and save
 * (ac-evo-draft-section, -section-read, -section-landing).
 */

function servicesWith(brief: string) {
	const foundation = {
		projectId: 'p',
		identity: { ...createEmptyIdentityDraft('p'), brief, lastSavedAt: '2026-10-01T00:00:00.000Z' },
		definition: createEmptyDefinitionDraft('p'),
		operations: createEmptyOperationsDraft('p')
	};
	const saved: unknown[] = [];
	const revisions = new Map<string, number>([['foundation', 4]]);
	const services = {
		foundationWrites: { withLock: async (_id: string, run: () => Promise<unknown>) => run() },
		loadFoundationDraft: { execute: async () => structuredClone(foundation), loadIdentity: async () => structuredClone(foundation.identity) },
		loadSpecLanguage: { generated: async () => 'en' },
		saveFoundationDraft: {
			execute: async (draft: unknown) => {
				saved.push(draft);
				return { ok: true };
			}
		},
		draftLock: {
			current: async (_p: string, section: string) => revisions.get(section) ?? 0,
			commit: async (_p: string, section: string, expected: number | null) => {
				const now = revisions.get(section) ?? 0;
				if (expected !== null && expected !== now) return null;
				revisions.set(section, now + 1);
				return now + 1;
			},
			rollback: async () => {}
		},
		sectionDocuments: { currentRevision: async () => 0 },
		scheduleBackSync: async () => {}
	} as unknown as AppServices;
	return { services, saved, revisions, foundation };
}

const reword: SectionEdit = { op: 'replace_text', path: 'identity.brief', find: 'shortens links', value: 'shortens links and counts their visits' };
const draftOf = (edits: SectionEdit[], summary = 'Say that Kutt counts visits'): SectionDraft => ({
	id: 'section:s1',
	page: 'glance',
	summary,
	edits,
	sourceIds: [],
	materialisedAt: null
});

describe('a section change is checked against the section as it stands [criterion:ac-leaf-ac-evo-draft-section]', () => {
	it('accepts an edit that finds its target and a section its guards accept, and names the one that does not', async () => {
		const { services } = servicesWith('Kutt shortens links.');
		expect(await checkSectionEdits(services, 'p', 'glance', [reword])).toBeNull();
		expect(await checkSectionEdits(services, 'p', 'glance', [{ ...reword, find: 'QR codes' }])).toBe(
			'Edit 1 (replace_text on identity.brief) does not apply to At a glance as it stands: the text to replace does not occur there.'
		);
	});
});

describe('a section change reads by its page, before and after [criterion:ac-leaf-ac-evo-draft-section-read]', () => {
	it('reads each value against the section as it stands, and says when the section moved away from it', async () => {
		const { services } = servicesWith('Kutt shortens links.');
		const [reading] = await readSectionDrafts(services, 'p', { sectionDrafts: [draftOf([reword])] });
		expect(reading).toMatchObject({ pageName: 'At a glance', editCount: 1, noLongerApplies: null });
		expect(reading.changes[0]).toMatchObject({ label: 'At a glance · Product summary', before: 'Kutt shortens links.', after: 'Kutt shortens links and counts their visits.' });
		const moved = servicesWith('Kutt makes short URLs.');
		const [stale] = await readSectionDrafts(moved.services, 'p', { sectionDrafts: [draftOf([reword])] });
		expect(stale.noLongerApplies).toMatch(/does not apply to At a glance as it stands/);
	});
});

describe('a section change lands through its section\'s own save [criterion:ac-leaf-ac-evo-draft-section-landing]', () => {
	it('writes the section with every change laid on it, under the revision read when it was laid', async () => {
		const { services, saved, revisions } = servicesWith('Kutt shortens links.');
		const prepared = await prepareSectionLanding(services, 'p', { sectionDrafts: [draftOf([reword]), { ...draftOf([{ op: 'add_to_set', path: 'identity.formFactors', value: 'api' }], 'An API too'), id: 'section:s2' }] });
		if (!prepared.ok) throw new Error(prepared.reason);
		expect(prepared.landings.map((l) => [l.section, l.expectedRevision, l.pages])).toEqual([['foundation', 4, ['At a glance']]]);
		expect(saved).toHaveLength(0);
		const written = await writeSectionLandings(services, 'p', prepared.landings, 'test');
		expect(written).toEqual({ ok: true });
		const draft = saved[0] as { identity: { brief: string; formFactors: string[] } };
		expect(draft.identity.brief).toBe('Kutt shortens links and counts their visits.');
		expect(draft.identity.formFactors).toContain('api');
		expect(revisions.get('foundation')).toBe(5);
	});

	it('holds the landing on a change the section moved away from, and writes nothing', async () => {
		const { services, saved } = servicesWith('Kutt makes short URLs.');
		const prepared = await prepareSectionLanding(services, 'p', { sectionDrafts: [draftOf([reword])] });
		expect(prepared.ok).toBe(false);
		expect(prepared.ok ? '' : prepared.reason).toMatch(/^The change "Say that Kutt counts visits" \(section:s1\): Edit 1 \(replace_text on identity\.brief\) does not apply/);
		expect(saved).toHaveLength(0);
	});

	it('refuses the write when someone saved the section after the change was laid on it', async () => {
		const { services, saved, revisions } = servicesWith('Kutt shortens links.');
		const prepared = await prepareSectionLanding(services, 'p', { sectionDrafts: [draftOf([reword])] });
		if (!prepared.ok) throw new Error(prepared.reason);
		revisions.set('foundation', 9);
		const written = await writeSectionLandings(services, 'p', prepared.landings, 'test');
		expect(written.ok).toBe(false);
		expect(written.ok ? '' : written.reason).toMatch(/^At a glance could not be written: This section was changed by someone else/);
		expect(saved).toHaveLength(0);
	});
});

describe('whether a landed section change is on its page', () => {
	const api: SectionEdit = { op: 'add_to_set', path: 'identity.formFactors', value: 'api' };

	it('holds when laying it again on the page as it stands changes nothing', async () => {
		const { services, foundation } = servicesWith('Kutt shortens links.');
		foundation.identity.formFactors = ['web_interface', 'api'];
		expect(await sectionDraftHolds(services, 'p', draftOf([api]))).toBe(true);
	});

	it('does not hold when the page still lacks it, or lacks one of its edits', async () => {
		const { services, foundation } = servicesWith('Kutt shortens links.');
		foundation.identity.formFactors = ['web_interface'];
		expect(await sectionDraftHolds(services, 'p', draftOf([api]))).toBe(false);
		foundation.identity.formFactors = ['web_interface', 'api'];
		expect(await sectionDraftHolds(services, 'p', draftOf([api, { ...api, value: 'cli' }]))).toBe(false);
	});
});
