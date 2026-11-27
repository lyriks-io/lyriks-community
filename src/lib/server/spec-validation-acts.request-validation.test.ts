import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionDocumentStorePort } from '$application/ports';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import {
	RETROSPEC_SECTION,
	SPEC360_TAB,
	applyRetrospecActs,
	emptyRetrospecDocument,
	specValidationBoard,
	type PersonRef,
	type RetrospecAct,
	type RetrospecDocument,
	type TeamMember
} from '$domain/retrospec';
import { servicesWith } from './request-event.fixture';
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./spec-validation.server', () => ({ readSpecValidationBoard: read }));
vi.mock('./spec-code-drift.server', () => ({ readCodeFacts: async () => [], readCodeChanges: async () => ({ changes: [] }) }));
const { applySpecValidationActs } = await import('./spec-validation-acts.server');

/**
 * "Withdraw the validation a request gave" (action e935132d of EVO-002), its
 * scenarios and refusals run through the server's validation acts against the
 * Reverse-Specification document as the section store keeps it.
 */

const NOW = '2026-11-20T10:00:00.000Z';
const lead: PersonRef = { id: 'lead@company.test', name: 'Lead' };
const viewer: PersonRef = { id: 'viewer@company.test', name: 'Viewer' };
const writer: PersonRef = { id: 'writer@company.test', name: 'Writer' };
const element = { id: 'stack:a', title: 'Stack', fingerprint: 'f-1' };
const team: TeamMember[] = [{ person: lead, jobIds: [] }, { person: viewer, jobIds: [] }, { person: writer, jobIds: [] }];

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

/** The state the scenarios start from: the lead is who the element waits on, the request validated it at its landing. */
interface Given {
	readonly validatedThroughRequest?: boolean;
	readonly validations?: number;
	readonly specification?: 'draft' | 'validated';
}

function docOf(given: Given): RetrospecDocument {
	const acts: RetrospecAct[] = [{ op: 'start_review', total: 1 }];
	if (given.validations) acts.push({ op: 'validate', itemId: element.id, title: element.title, tab: SPEC360_TAB });
	if (given.validatedThroughRequest !== false)
		acts.push({ op: 'validate_through_request', itemId: element.id, title: element.title, tab: SPEC360_TAB, validation: { requestId: 'req-2', requestKey: 'EVO-002', approvedBy: [lead], at: NOW, fingerprint: 'f-1' } });
	const outcome = applyRetrospecActs(emptyRetrospecDocument(), acts, { actor: lead, now: NOW });
	if (!outcome.ok) throw new Error(outcome.reason);
	return given.specification === 'validated' ? { ...outcome.doc, runs: outcome.doc.runs.map((r) => ({ ...r, publishedAt: NOW, publishedBy: lead })) } : outcome.doc;
}

function useDoc(doc: RetrospecDocument, reader: PersonRef) {
	documents.set(`p/${RETROSPEC_SECTION}`, { doc, revision: 1 });
	read.mockResolvedValue({ doc, elements: [element], team, baselines: [], board: specValidationBoard({ doc, elements: [element], team, viewer: reader, baselines: [] }) });
}

/** How the element stands once the stored document is read back. */
async function standing() {
	const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
	return specValidationBoard({ doc, elements: [element], team, viewer: lead, baselines: [] }).standings[element.id];
}

/** The adapter: the reader withdraws, through the server's door, the validation the request gave. */
async function invoke(given: Given, reader = lead, canWrite = true) {
	useDoc(docOf(given), reader);
	try {
		await applySpecValidationActs(services, 'p', [{ op: 'withdraw_request_validation', itemId: element.id }], reader, null, { canWrite });
	} catch (refusal) {
		return { status: 'blocked' as const, refusal: refusal as { status: number; body: { message: string } } };
	}
	const s = await standing();
	return { status: 'success' as const, state: { validatedThroughRequest: s.through !== null, settled: s.state === 'ok' } };
}

describe('Withdraw the validation a request gave', () => {
	beforeEach(() => {
		documents = new Map();
		read.mockReset();
	});

	it('puts an element validated at the landing back to review [unspa:2e49df91:e935132d:7fedb53d] [criterion:ac-leaf-21f59e26-db26-492b-baf6-5282c0a79f39]', async () => {
		expect((await invoke({})) as unknown).toEqual({ status: 'success', state: { validatedThroughRequest: false, settled: false } });
	});

	it('keeps an element validated by its people [unspa:2e49df91:e935132d:e66f1dc5]', async () => {
		expect((await invoke({ validations: 1 })) as unknown).toEqual({ status: 'success', state: { validatedThroughRequest: false, settled: true } });
	});

	it('has nothing to withdraw where no request validated the element [unspa:2e49df91:e935132d:c43d686c] (rule c75239d4)', async () => {
		const run = await invoke({ validatedThroughRequest: false });
		expect(run).toMatchObject({ status: 'blocked', refusal: { status: 400, body: { message: 'No change request validated this element.' } } });
	});

	it('lets an unassigned viewer withdraw nothing [unspa:2e49df91:e935132d:96f75df1] (rule 312a7bb5)', async () => {
		const run = await invoke({}, viewer, false);
		expect(run).toMatchObject({ status: 'blocked', refusal: { status: 403, body: { message: 'forbidden' } } });
		expect((await standing()).through?.requestKey).toBe('EVO-002');
	});

	it('refuses a writer the element does not wait on (rule 846c0d0a)', async () => {
		const run = await invoke({}, writer, true);
		expect(run).toMatchObject({ status: 'blocked', refusal: { status: 403, body: { message: 'This question does not require your validation.' } } });
	});

	it('refuses once the specification is validated definitively (rule 78b379d6)', async () => {
		const run = await invoke({ specification: 'validated' });
		expect(run).toMatchObject({ status: 'blocked', refusal: { status: 400, body: { message: 'The specification is already validated.' } } });
	});

	it('refuses to withdraw twice: the request never gives its validation again', async () => {
		await invoke({});
		const { doc } = await loadRetrospecDocument(sectionDocuments, 'p');
		useDoc(doc, lead);
		await expect(applySpecValidationActs(services, 'p', [{ op: 'withdraw_request_validation', itemId: element.id }], lead, null)).rejects.toMatchObject({ status: 400 });
		expect(doc.runs.at(-1)?.throughRequests?.[element.id]?.withdrawn?.by).toEqual(lead);
	});
});
