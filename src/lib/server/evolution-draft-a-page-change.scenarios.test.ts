import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import type { SectionDraft } from '$domain/evolution';
import { batchScene, claude, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Draft a change to another page of the specification (feat-30, action
 * 1c22fe25), every scenario through the real batch of operations and the
 * page's own guards. Not tested here: someone outside the workspace
 * (c771b5af), answered 404 by the route's access check, which the Enterprise
 * workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:1c22fe25:${id}]`;
const TERM = { op: 'append', collection: 'terms', value: { id: 't-saved-cart', term: 'Saved cart', definition: 'A cart kept for later, prices included.' } };
const change = (over: Partial<SectionDraft> = {}): SectionDraft => ({ id: 'section:s-1', page: 'glossary', summary: 'Names the saved cart', edits: [TERM] as SectionDraft['edits'], sourceIds: [], materialisedAt: null, ...over });
const draft = (fields: Record<string, unknown>) => s.run([{ op: 'add_section_draft', requestId: 'r', ...fields }], claude);

describe('Draft a change to another page of the specification', () => {
	beforeEach(() => s.show(requestAt('specification')));

	it(`the AI drafts a change to the Glossary, waiting for a person ${T('5842b0b2')}`, async () => {
		const result = await draft({ page: 'glossary', summary: 'Names the saved cart', edits: [TERM] });
		expect(result.results.filter((r) => !r.ok)).toEqual([]);
		expect(s.saved().sectionDrafts).toHaveLength(1);
		expect(s.saved().sectionDrafts[0]).toMatchObject({ page: 'glossary', summary: 'Names the saved cart' });
	});

	it(`Health is no page a change aims at ${T('920fdee6')}`, async () => {
		expect((await draft({ page: 'health', summary: 'x', edits: [TERM] })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a feature is changed by its own draft ${T('59ddbdaa')}`, async () => {
		expect((await draft({ page: 'features', summary: 'x', edits: [TERM] })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`an edit of what the page does not show is refused ${T('50e94550')}`, async () => {
		const result = await draft({ page: 'glossary', summary: 'x', edits: [{ op: 'set', path: 'internalNotes', value: 'x' }] });
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a change says what it changes ${T('3baf9455')}`, async () => {
		expect((await draft({ page: 'glossary', summary: '', edits: [TERM] })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a landed change is not taken out ${T('070d636a')}`, async () => {
		s.show(requestAt('specification', { drafts: [draftOn({ materialisedAt: '2026-11-19T00:00:00Z', materialisedAs: 'feat-1' })], sectionDrafts: [change({ materialisedAt: '2026-11-19T00:00:00Z' })] }));
		expect((await s.run([{ op: 'remove_section_draft', requestId: 'r', sectionDraftId: 'section:s-1' }], claude)).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a change to a page is taken out ${T('a4c4ccf8')}`, async () => {
		s.show(requestAt('specification', { sectionDrafts: [change()] }));
		expect((await s.run([{ op: 'remove_section_draft', requestId: 'r', sectionDraftId: 'section:s-1' }], claude)).ok).toBe(true);
		expect(s.saved().sectionDrafts).toEqual([]);
	});

	it(`a rework keeps its page ${T('3a6659ab')}`, async () => {
		s.show(requestAt('specification', { sectionDrafts: [change()] }));
		const result = await s.run([{ op: 'update_section_draft', requestId: 'r', sectionDraftId: 'section:s-1', page: 'users', summary: 'Moves the term' }], claude);
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a request in Approval drafts no change to a page ${T('d74ffe61')}`, async () => {
		s.show(requestAt('acceptance'));
		expect(s.summaryOf(await draft({ page: 'glossary', summary: 'Names the saved cart', edits: [TERM] }), 'add_section_draft')).toBe(
			'This request stands in Approval: what it proposes is no longer corrected. Open a new request to change it.'
		);
	});

	it(`in the Build the AI drafts a change to a page, opening version N+1 in correction ${T('2b166682')}`, async () => {
		s.show(requestAt('implementation'));
		const result = await draft({ page: 'glossary', summary: 'Names the saved cart', edits: [TERM] });
		expect(result.results.filter((r) => !r.ok)).toEqual([]);
		expect(s.saved().sectionDrafts).toHaveLength(1);
		expect(s.saved().correction?.of).toBe(1);
	});
});
