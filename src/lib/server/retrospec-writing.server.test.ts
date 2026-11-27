import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
// The sections are plain documents here: what a section's own save does is its own tests' business.
const sections = new Map<string, Record<string, unknown>>();
const sectionWrites: { section: string; body: Record<string, unknown> }[] = [];
let refuseSectionSave: string | null = null;
vi.mock('./section-write-specs.server', () => ({
	RETROSPEC_SECTION_WRITES: new Proxy({}, { get: (_t, section) => ({ section, parse: (body: unknown) => body }) }),
	loadRetrospecWriteSection: async (_services: unknown, section: string) => sections.get(section) ?? {}
}));
vi.mock('./section-save.server', () => ({
	writeSectionInProcess: async (_services: unknown, _projectId: string, spec: { section: string }, body: Record<string, unknown>) => {
		if (refuseSectionSave) return { ok: false, reason: refuseSectionSave };
		sectionWrites.push({ section: spec.section, body });
		sections.set(spec.section, body);
		return { ok: true };
	}
}));
vi.mock('./foundation-lock.server', () => ({ withFoundationLock: async (_s: unknown, _p: string, _section: string, run: () => unknown) => run() }));
vi.mock('./behavior-feature-access.server', () => ({ featureIdCollisions: async () => [] }));
vi.mock('./behavior-written.server', () => ({ behaviorWritten: () => {} }));

import type { AppServices } from '$composition/container.server';
import { RETROSPEC_SECTION, currentRun, parseRetrospecDocument, type ReportedChange, type RetrospecDocument, type RetrospecRun } from '$domain/retrospec';
import { reportedChangesRefusal, startWriting, validatedChangesRefusal, writingUnderWay } from './retrospec-writing.server';

const ann = { id: 'ann@example.test', name: 'Ann' };
const decided = { verdict: 'validated' as const, by: ann, at: '2026-11-24T09:00:00.000Z' };
const glossaryWrite = (id: string) => ({ section: 'glossary' as const, edits: [{ op: 'append', collection: 'terms', id, value: { id, term: id } }] });
const behaviorWrite = { featureId: 'feat-1', operations: [{ kind: 'add_action', name: 'Export' }] };
const change = (id: string, over: Partial<ReportedChange> = {}): ReportedChange => ({ id, kind: 'new', anchor: null, dock: 'feature:feat-1', title: id, proposed: 'p', code: '', where: '', writes: [glossaryWrite(id)], decision: decided, ...over });

function servicesWith(run: Partial<RetrospecRun>, batches: { ok: boolean; errors?: string[]; created?: unknown[] }[] = []) {
	let stored: unknown = { version: 1, comments: {}, runs: [{ id: 'r1', startedAt: 'a', startedBy: ann, verdicts: {}, publishedAt: 'b', baselineId: null }, { id: 'r2', startedAt: 'c', startedBy: ann, verdicts: {}, publishedAt: null, baselineId: null, holds: true, ...run }] };
	let revision = 1;
	const sent: { operations: unknown; dryRun?: boolean }[] = [];
	const services = {
		sectionDocuments: {
			load: async (_p: string, section: string) => (section === RETROSPEC_SECTION ? structuredClone(stored) : null),
			currentRevision: async () => revision,
			save: async (_p: string, _s: string, doc: unknown, expected: number) => {
				if (expected !== revision) return null;
				stored = structuredClone(doc);
				return ++revision;
			}
		},
		draftLock: { current: async () => 1 },
		loadFeaturesDraft: { execute: async () => ({ features: [{ id: 'feat-1' }] }) },
		authorBehavior: {
			execute: async (input: { operations: unknown; dryRun?: boolean }) => {
				sent.push(input);
				if (input.dryRun) return { available: true, batch: { ok: true, errors: [] }, warnings: [] };
				const next = batches.shift() ?? { ok: true };
				return { available: true, batch: { errors: [], ...next }, warnings: [] };
			}
		}
	} as unknown as AppServices;
	const doc = (): RetrospecDocument => parseRetrospecDocument(stored);
	return { services, sent, doc, run: () => currentRun(doc()) as RetrospecRun };
}

async function writingDone(projectId: string) {
	await vi.waitFor(() => expect(writingUnderWay(projectId)).toBe(false));
}

describe('what a later run reports is checked against the specification as it stands [criterion:0b2dafb0]', () => {
	it('takes writes that apply, laid one after the other', async () => {
		sections.clear();
		const { services } = servicesWith({});
		expect(await reportedChangesRefusal(services, 'p', [change('c1'), change('c2')])).toBeNull();
	});

	it('refuses, naming the change and why, a section edit that does not apply', async () => {
		sections.clear();
		sections.set('glossary', { terms: [] });
		const { services } = servicesWith({});
		const replace = { section: 'glossary' as const, edits: [{ op: 'replace_text', collection: 'terms', id: 'gone', path: 'definition', find: 'x', value: 'y' }] };
		expect(await reportedChangesRefusal(services, 'p', [change('c1', { writes: [replace] })])).toMatch(/^The change c1 cannot be written as it is: Edit 1 \(replace_text on terms\[gone\]\.definition\) does not apply to the glossary section/);
	});

	it('refuses a batch the engine refuses, a feature of another project and disabling', async () => {
		sections.clear();
		const { services } = servicesWith({});
		(services.authorBehavior as { execute: unknown }).execute = async () => ({ available: true, batch: { ok: false, errors: ['rule r9 does not exist'] }, warnings: [] });
		expect(await reportedChangesRefusal(services, 'p', [change('c1', { writes: [behaviorWrite] })])).toBe('The change c1 cannot be written as it is: feat-1: rule r9 does not exist');
		expect(await reportedChangesRefusal(services, 'p', [change('c1', { writes: [{ featureId: 'feat-9', operations: [{ kind: 'add_action' }] }] })])).toBe('The change c1 cannot be written as it is: the feature feat-9 is not in this project.');
		expect(await reportedChangesRefusal(services, 'p', [change('c1', { writes: [{ featureId: 'feat-1', operations: [{ kind: 'disable_element' }] }] })])).toMatch(/removes an element rather than disabling it/);
	});
});

describe('Lyriks writes what a person validated, and nothing else [criterion:c3f9ddbb]', () => {
	it('checks every validated change before writing any [criterion:65bba346]', async () => {
		sections.clear();
		const { services, run } = servicesWith({ report: { c1: change('c1', { writes: [] }) } });
		expect(await validatedChangesRefusal(services, 'p', run())).toBe('The change “c1” no longer applies to the specification: it carries no writes. Reject it so your AI reports it again, or revert it.');
	});

	it('writes each validated change in the order of the report, records it, and leaves a reverted one out', async () => {
		sections.clear();
		sectionWrites.length = 0;
		const report = { c1: change('c1', { writes: [glossaryWrite('c1'), behaviorWrite] }), c2: change('c2', { decision: { ...decided, verdict: 'reverted' } }), c3: change('c3') };
		const { services, sent, run, doc } = servicesWith({ report, writingOpenedAt: '2026-11-24T10:00:00.000Z' }, [{ ok: true, created: [{ kind: 'action', id: 'a9' }] }]);
		expect(startWriting(services, 'p-write', null)).toBe(true);
		expect(startWriting(services, 'p-write', null)).toBe(false);
		await writingDone('p-write');
		expect(sectionWrites.map((w) => (w.body.terms as { id: string }[]).map((t) => t.id))).toEqual([['c1'], ['c1', 'c3']]);
		expect(sent.filter((s) => !s.dryRun)).toHaveLength(1);
		expect(run().written).toEqual({ c1: 2, c3: 1 });
		// What it became reads validated by who validated it (criterion 114be880).
		expect(run().verdicts['action:feat-1:a9']).toMatchObject({ validatedBy: [{ person: ann }] });
		expect(run().verdicts['term:c3']).toMatchObject({ validatedBy: [{ person: ann }] });
		expect(doc().history?.filter((h) => h.action === 'change_written').map((h) => [h.subject, h.by.name])).toEqual([
			['c1', 'Lyriks'],
			['c3', 'Lyriks']
		]);
	});

	it('stops at a write the specification refuses, keeps what it wrote, and never writes a write twice [criterion:5aec3583]', async () => {
		sections.clear();
		sectionWrites.length = 0;
		const report = { c1: change('c1', { writes: [glossaryWrite('c1'), behaviorWrite] }) };
		const { services, sent, run } = servicesWith({ report, writingOpenedAt: '2026-11-24T10:00:00.000Z' }, [{ ok: false, errors: ['the feature moved'] }, { ok: true }]);
		startWriting(services, 'p-stop', null);
		await writingDone('p-stop');
		expect(run().written).toEqual({ c1: 1 });
		expect(run().writeStop).toMatchObject({ change: 'c1', reason: 'feat-1: the feature moved' });
		startWriting(services, 'p-stop', null);
		await writingDone('p-stop');
		expect(sectionWrites).toHaveLength(1);
		expect(sent.filter((s) => !s.dryRun)).toHaveLength(2);
		expect(run().written).toEqual({ c1: 2 });
		expect(run().writeStop).toBeNull();
	});

	it('names the section that refused its save', async () => {
		sections.clear();
		refuseSectionSave = 'This section was changed by someone else.';
		const { services, run } = servicesWith({ report: { c1: change('c1') }, writingOpenedAt: '2026-11-24T10:00:00.000Z' });
		startWriting(services, 'p-refused', null);
		await writingDone('p-refused');
		refuseSectionSave = null;
		expect(run().writeStop?.reason).toBe('the glossary section could not be written: This section was changed by someone else.');
	});
});
