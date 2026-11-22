import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionDocumentStorePort } from '$application/ports';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { RETROSPEC_SECTION, applyRetrospecActs, emptyRetrospecDocument, specValidationBoard, validationLead, type RetrospecDocument } from '$domain/retrospec';
import { servicesWith } from './request-event.fixture';
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./spec-validation.server', () => ({ readSpecValidationBoard: read }));
vi.mock('./spec-code-drift.server', () => ({ readCodeFacts: async () => [], readCodeChanges: async () => ({ changes: [{ key: 'known', code: 'new-code', featureName: 'Feature', elementLabel: 'Rule', what: 'Changed' }] }) }));
const { applySpecValidationActs } = await import('./spec-validation-acts.server');

const lead = { id: 'lead@company.test', name: 'Lead' };
const reviewer = { id: 'reviewer@company.test', name: 'Reviewer' };
const elements = [{ id: 'stack:a', title: 'Stack', owner: 'tech' as const }];
const team = [{ person: lead, jobIds: ['product'] }, { person: reviewer, jobIds: [] }];

/** The Reverse-Specification document as the section store keeps it, revision by revision. */
let documents: Map<string, { doc: unknown; revision: number }>;
const sectionDocuments = {
	load: async (projectId, section) => documents.get(`${projectId}/${section}`)?.doc ?? null,
	save: async (projectId, section, doc, expected) => {
		const now = documents.get(`${projectId}/${section}`)?.revision ?? 0;
		if (expected !== null && expected !== now) return null;
		documents.set(`${projectId}/${section}`, { doc, revision: now + 1 });
		return now + 1;
	},
	currentRevision: async (projectId, section) => documents.get(`${projectId}/${section}`)?.revision ?? 0
} satisfies SectionDocumentStorePort;
const services = servicesWith({ sectionDocuments, loadFoundationDraft: { loadIdentity: async () => ({ ...createEmptyIdentityDraft('p'), productName: 'Product' }) } });

/** The document in store and the board read from it, for a team. */
function useDoc(doc: RetrospecDocument, members = team) {
	documents.set(`p/${RETROSPEC_SECTION}`, { doc, revision: 1 });
	read.mockResolvedValue({ doc, elements, team: members, baselines: [], board: specValidationBoard({ doc, elements, team: members, viewer: lead, baselines: [] }) });
}
function requestedDoc() {
	const result = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'request_validation', itemId: 'stack:a', title: 'Stack', to: reviewer }], { actor: lead, now: '2026-11-13T00:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
/** Who the element still waits on, read from the stored document. */
async function stillWaitingOn(members = team) {
	const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
	return specValidationBoard({ doc, elements, team: members, viewer: lead, baselines: [] }).standings['stack:a'].missing.map((p) => p.id);
}
const stored = async () => (await sectionDocuments.currentRevision('p', RETROSPEC_SECTION));

describe('server question review capability', () => {
	beforeEach(() => { documents = new Map(); read.mockReset(); useDoc(requestedDoc()); });
	const submit = (acts: Parameters<typeof applySpecValidationActs>[2], canWrite = false) => applySpecValidationActs(services, 'p', acts, reviewer, null, { canWrite });

	it('records the own approval of a reader the element waits on [criterion:1a489659]', async () => {
		expect(await stillWaitingOn()).toContain(reviewer.id);
		await submit([{ op: 'validate', itemId: 'stack:a' }]);
		expect(await stillWaitingOn()).not.toContain(reviewer.id);
	});

	it('refuses a writer the element does not wait on, and lets them withdraw [criterion:d1703bb6]', async () => {
		const writer = { id: 'writer@company.test', name: 'Writer' };
		await expect(applySpecValidationActs(services, 'p', [{ op: 'validate', itemId: 'stack:a' }], writer, null, { canWrite: true })).rejects.toMatchObject({ status: 403, body: { message: 'This question does not require your validation.' } });
		expect(await stored()).toBe(1);
		await expect(applySpecValidationActs(services, 'p', [{ op: 'withdraw', itemId: 'stack:a' }], writer, null, { canWrite: true })).resolves.toBeDefined();
	});

	it('does not turn a reader into a lead when no run exists [criterion:787a9fec]', async () => {
		useDoc(emptyRetrospecDocument());
		await expect(submit([{ op: 'validate', itemId: 'stack:a' }])).rejects.toMatchObject({ status: 403 });
		expect(await stored()).toBe(1);
	});

	it('never makes a reader the lead by validating what their job owns before anyone started [criterion:787a9fec]', async () => {
		const engineers = [{ person: lead, jobIds: ['product'] }, { person: reviewer, jobIds: ['tech'] }];
		useDoc(emptyRetrospecDocument(), engineers);
		await submit([{ op: 'validate', itemId: 'stack:a' }]);
		const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
		expect(validationLead(doc, null)).toBeNull();
		expect(await stillWaitingOn(engineers)).not.toContain(reviewer.id);
	});

	it.each(['reject', 'request_validation', 'cancel_validation_request', 'finalize', 'remind'] as const)('does not grant %s rights to a requested reader [criterion:1a489659]', async (op) => {
		await expect(submit([{ op, itemId: 'stack:a', to: lead.id } as never])).rejects.toMatchObject({ status: 403 });
		expect(await stored()).toBe(1);
	});

	it('resolves a requested person from the current project roster [unspa:2e49df91:a2418cea:f082d9fb]', async () => {
		useDoc(emptyRetrospecDocument());
		await submit([{ op: 'request_validation', itemId: 'stack:a', to: reviewer.id.toUpperCase() }], true);
		const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
		expect(doc.validationRequests?.['stack:a']?.map((r) => r.to)).toEqual([reviewer]);
	});

	it('refuses people outside project reach before storing a request [unspa:2e49df91:a2418cea:bc5af207]', async () => {
		await expect(submit([{ op: 'request_validation', itemId: 'stack:a', to: 'outsider@company.test' }], true)).rejects.toMatchObject({ status: 400 });
		expect(await stored()).toBe(1);
	});

	it('can cancel an unavailable explicit reviewer without deleting role defaults [criterion:3b1c77a6]', async () => {
		useDoc(requestedDoc(), [team[0]]);
		await submit([{ op: 'cancel_validation_request', itemId: 'stack:a', to: reviewer.id }], true);
		const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
		expect(doc.validationRequests?.['stack:a'] ?? []).toEqual([]);
		expect(await stillWaitingOn([team[0]])).not.toContain(reviewer.id);
	});

	it.each([
		['request_validation', 'cancel_validation_request'],
		['cancel_validation_request', 'request_validation']
	] as const)('applies %s then %s against the projected reviewer list [criterion:3b1c77a6]', async (first, second) => {
		useDoc(first === 'request_validation' ? emptyRetrospecDocument() : requestedDoc());
		await applySpecValidationActs(services, 'p', [
			{ op: first, itemId: 'stack:a', to: reviewer.id },
			{ op: second, itemId: 'stack:a', to: reviewer.id }
		], lead, null);
		const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
		expect(doc.validationRequests?.['stack:a']?.map((r) => r.to.id) ?? []).toEqual(second === 'request_validation' ? [reviewer.id] : []);
	});

	it('does not capture a baseline when a later act is refused [criterion:787a9fec]', async () => {
		const doc = requestedDoc();
		const published = { ...doc, runs: [{ ...doc.runs[0], publishedAt: '2026-11-13T00:01:00.000Z', publishedBy: lead, baselineId: 'existing' }] };
		useDoc(published);
		const capture = vi.fn();
		const withBaselines = servicesWith({ sectionDocuments, loadFoundationDraft: { loadIdentity: async () => ({ ...createEmptyIdentityDraft('p'), productName: 'Product' }) }, captureBaseline: { execute: capture } });
		await expect(applySpecValidationActs(withBaselines, 'p', [
			{ op: 'keep_drift', key: 'known' },
			{ op: 'request_validation', itemId: 'stack:a', to: reviewer.id }
		], lead, null)).rejects.toMatchObject({ status: 400 });
		expect(capture).not.toHaveBeenCalled();
		expect(await stored()).toBe(1);
	});
});
