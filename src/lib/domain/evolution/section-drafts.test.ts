import { describe, expect, it } from 'vitest';
import { addSectionDraftAct, removeSectionDraftAct, updateSectionDraftAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import {
	applySectionEdits,
	editsBySection,
	pageEditsRefusal,
	sectionChangeFingerprint,
	sectionChangeKey,
	sectionDraftChanges,
	sectionDraftCoherence,
	sectionDraftStartNodeIds,
	sectionEditsIssue,
	sectionEditsRefusal,
	type SectionEdit
} from './section-drafts';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { withSolutionValidated } from './solution-validated.fixture';

/**
 * The pages of the spec a request changes besides its features and its tables.
 * What these tests pin is ac-evo-draft-section and ac-evo-draft-section-read;
 * the landing is pinned on the server (evolution-section-drafts.server.test.ts).
 */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let n = 0;
const ctx: ActContext = { actor: ana, at: '2026-10-28T12:00:00.000Z', newId: () => `id${++n}`, soloWorkspace: true };
const ok = (o: ActOutcome): EvolutionRequest => {
	if (!o.ok) throw new Error(o.reason);
	return o.request;
};
const reason = (o: ActOutcome) => (o.ok ? '' : o.reason);
const fresh = () => withSolutionValidated({ ...createEvolutionRequest({ id: 'r1', title: 'Fix the problems', origin: 'technical_debt' }), stage: 'specification' as const });

const foundation = {
	identity: { brief: 'Kutt shortens links.', formFactors: ['web'] },
	definition: { security: { encryption: ['at_rest'] }, market: { regulations: [] }, framing: { notes: 'internal' } },
	operations: { quality: { browsers: 'Evergreen' } }
};
const architecture = { constraints: [{ id: 'c1', title: 'Postgres or SQLite', detail: '' }], techChoices: [] };

const encryption: SectionEdit = { op: 'add_to_set', path: 'definition.security.encryption', value: 'in_transit' };
const constraint: SectionEdit = { op: 'append', collection: 'constraints', id: 'c-https', value: { title: 'Encryption in transit', detail: 'HTTPS comes from the host proxy.' } };

describe('a section change aims at a page of the spec and what it shows [criterion:ac-leaf-ac-evo-draft-section]', () => {
	it('lands an edit on a place the page shows, by the section behind it', () => {
		expect(pageEditsRefusal('requirements', [encryption, constraint])).toBeNull();
		expect([...editsBySection('requirements', [encryption, constraint]).keys()]).toEqual(['foundation', 'architecture']);
		expect(pageEditsRefusal('glance', [{ op: 'replace_text', path: 'identity.brief', find: 'shortens', value: 'shortens and tracks' }])).toBeNull();
	});

	it('refuses an edit on what no page shows, saying nobody could read or validate it', () => {
		const refusal = pageEditsRefusal('requirements', [encryption, { op: 'set', path: 'definition.framing.notes', value: 'x' }]) ?? '';
		expect(refusal).toMatch(/^Edit 2 \(set on definition\.framing\.notes\) writes what the Requirements page does not show: nobody could read or validate it on the spec\./);
		expect(refusal).toContain('Encryption');
		// A parent of what the page shows writes what it does not show around it.
		expect(pageEditsRefusal('requirements', [{ op: 'set', path: 'definition.security', value: {} }])).not.toBeNull();
	});

	it('takes the patch_section vocabulary and checks the shape of every edit first', () => {
		expect(sectionEditsIssue([])).toBe('A section change needs at least one edit.');
		expect(sectionEditsIssue([{ op: 'rename', path: 'x' }])).toMatch(/^Edit 1: unknown operation/);
		expect(sectionEditsIssue([{ op: 'replace_text', path: 'identity.brief', value: 'x' }])).toBe('Edit 1: replace_text needs the text to find.');
		expect(sectionEditsIssue([{ op: 'set', path: '__proto__.x', value: 1 }])).toBe('Edit 1: a path segment is empty or unsafe.');
		expect(sectionEditsIssue([encryption, constraint])).toBeNull();
	});

	it('applies the edits on a copy, each with what it did, never on the section given', () => {
		const before = structuredClone(foundation);
		const { section, report } = applySectionEdits(foundation, [encryption, encryption, { op: 'replace_text', path: 'identity.brief', find: 'Kutt', value: 'Kutt' }]);
		expect((section.definition as { security: { encryption: string[] } }).security.encryption).toEqual(['at_rest', 'in_transit']);
		expect(report.changed).toEqual(['definition.security.encryption']);
		expect(report.unchanged).toHaveLength(2);
		expect(foundation).toEqual(before);
	});

	it('names the first edit that finds no target in the section as it stands', () => {
		const missing = applySectionEdits(foundation, [{ op: 'replace_text', path: 'identity.brief', find: 'QR codes', value: 'x' }]).report;
		expect(sectionEditsRefusal(missing, 'At a glance')).toBe(
			'Edit 1 (replace_text on identity.brief) does not apply to At a glance as it stands: the text to replace does not occur there.'
		);
		const twice = applySectionEdits({ identity: { brief: 'a link, a link' } }, [{ op: 'replace_text', path: 'identity.brief', find: 'a link', value: 'b' }]).report;
		expect(twice.notApplied[0].reason).toMatch(/occurs 2 times/);
		const noRow = applySectionEdits(architecture, [{ op: 'merge', collection: 'constraints', id: 'nope', value: { title: 'x' } }]).report;
		expect(noRow.notApplied[0].reason).toMatch(/append to "constraints"/);
	});

	it('is held on the request, refused on a page that keeps its own draft or is computed, and on a frozen request', () => {
		let request = ok(addSectionDraftAct(ctx, fresh(), { page: 'requirements', summary: 'Encryption in transit is the host\'s job', edits: [encryption, constraint] }, { refusal: null }));
		expect(request.sectionDrafts).toHaveLength(1);
		expect(request.sectionDrafts[0]).toMatchObject({ page: 'requirements', materialisedAt: null });
		expect(reason(addSectionDraftAct(ctx, fresh(), { page: 'features', summary: 's', edits: [encryption] }, { refusal: null }))).toBe('A feature is changed by a feature draft (add_draft_leaf).');
		expect(reason(addSectionDraftAct(ctx, fresh(), { page: 'health', summary: 's', edits: [encryption] }, { refusal: null }))).toBe('Health is computed from the spec: no request changes it.');
		expect(reason(addSectionDraftAct(ctx, fresh(), { page: 'foundation', summary: 's', edits: [encryption] }, { refusal: null }))).toMatch(/is not a page of the spec/);
		expect(reason(addSectionDraftAct(ctx, fresh(), { page: 'requirements', summary: ' ', edits: [encryption] }, { refusal: null }))).toBe('A section change says what it changes, in a summary.');
		expect(reason(addSectionDraftAct(ctx, fresh(), { page: 'requirements', summary: 's', edits: [encryption] }, { refusal: 'Requirements would refuse this change: x' }))).toBe('Requirements would refuse this change: x');
		expect(reason(addSectionDraftAct(ctx, { ...fresh(), frozen: true, specVersion: 1 }, { page: 'requirements', summary: 's', edits: [encryption] }, { refusal: null }))).toMatch(/frozen as version 1/);

		const id = request.sectionDrafts[0].id;
		request = ok(updateSectionDraftAct(ctx, request, id, { summary: 'HTTPS comes from the host' }, { refusal: null }));
		expect(request.sectionDrafts[0].summary).toBe('HTTPS comes from the host');
		expect(reason(updateSectionDraftAct(ctx, request, id, { page: 'glance' }, { refusal: null }))).toBe('A section change keeps its page.');
		// Read back from the store as it was written.
		const stored = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request] })), 'p');
		expect(stored.requests[0].sectionDrafts).toEqual(request.sectionDrafts);
		request = ok(removeSectionDraftAct(ctx, request, id));
		expect(request.sectionDrafts).toEqual([]);
	});
});

describe('a section change reads by its page, each value before and after [criterion:ac-leaf-ac-evo-draft-section-read]', () => {
	it('names each value as its page does, never by the section behind it', () => {
		const changes = sectionDraftChanges({ foundation, architecture }, 'requirements', [encryption, constraint]);
		expect(changes.map((c) => c.label)).toEqual(['Requirements · Encryption', 'Requirements · Technical constraints']);
		expect(changes[0]).toMatchObject({ before: 'at_rest', after: 'at_rest, in_transit' });
		expect(changes[1]).toMatchObject({ before: '', after: 'Encryption in transit · HTTPS comes from the host proxy.' });
		for (const c of changes) expect(c.label).not.toMatch(/foundation|brief/i);
	});

	it('says a choice by the label its page shows, never the code stored behind it', () => {
		const labels: Record<string, string> = { at_rest: 'At rest', in_transit: 'In transit' };
		const changes = sectionDraftChanges({ foundation, architecture }, 'requirements', [encryption, constraint], (place, value) =>
			place.path === 'definition.security.encryption' ? (labels[value] ?? value) : value
		);
		expect(changes[0]).toMatchObject({ before: 'At rest', after: 'At rest, In transit' });
		expect(changes[1].after).toBe('Encryption in transit · HTTPS comes from the host proxy.');
	});

	it('is validated on a synthetic field that goes stale when an edit changes', () => {
		const request = ok(addSectionDraftAct(ctx, fresh(), { page: 'requirements', summary: 's', edits: [encryption] }, { refusal: null }));
		const draft = request.sectionDrafts[0];
		expect(sectionChangeKey(draft)).toMatch(/^element\.section\./);
		expect(sectionChangeFingerprint(draft)).not.toBe(sectionChangeFingerprint({ ...draft, edits: [constraint] }));
	});

	it('reports a word the glossary bans and a change the section moved away from, by the page', () => {
		const request = ok(
			addSectionDraftAct(ctx, fresh(), { page: 'glance', summary: 'Say tokens', edits: [{ op: 'append_text', path: 'identity.brief', value: 'Every token is stored.' }] }, { refusal: null })
		);
		const findings = sectionDraftCoherence({
			request,
			bannedWords: [{ avoid: 'token', prefer: 'API key' }],
			noLongerApplies: { [request.sectionDrafts[0].id]: 'Edit 1 (append_text on identity.brief) does not apply' }
		});
		expect(findings.map((f) => [f.severity, f.title])).toEqual([
			['blocking', 'The change on At a glance no longer applies: Edit 1 (append_text on identity.brief) does not apply'],
			['major', 'The change on At a glance writes "token", which the glossary asks to be called "API key"']
		]);
	});
});

describe('the impact walks from a section change [criterion:ac-leaf-ac-evo-draft-section-impact]', () => {
	it('starts from each element of the product an edit touches, and from nothing for a value no element holds', () => {
		const request = ok(
			addSectionDraftAct(
				ctx,
				fresh(),
				{ page: 'requirements', summary: 's', edits: [encryption, { op: 'replace_text', collection: 'constraints', id: 'c1', path: 'title', find: 'Postgres', value: 'PostgreSQL' }] },
				{ refusal: null }
			)
		);
		expect(sectionDraftStartNodeIds(request.sectionDrafts)).toEqual([{ nodeId: 'constraint:c1', changeId: request.sectionDrafts[0].id }]);
	});
});
