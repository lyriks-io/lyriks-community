import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRetrospecActs, emptyRetrospecDocument, specValidationBoard, type RetrospecDocument } from '$domain/retrospec';
const { read, save } = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(async (..._args: unknown[]) => ({ ok: true, revision: 2 })) }));
vi.mock('./spec-validation.server', () => ({ readSpecValidationBoard: read }));
vi.mock('$application/retrospec/retrospec-store', () => ({ saveRetrospecActs: save }));
vi.mock('./sync-bus.server', () => ({ publishSectionChange: () => {} }));
vi.mock('./spec-code-drift.server', () => ({ readCodeFacts: async () => [], readCodeChanges: async () => ({ changes: [{ key: 'known', code: 'new-code', featureName: 'Feature', elementLabel: 'Rule', what: 'Changed' }] }) }));
const { applySpecValidationActs } = await import('./spec-validation-acts.server');

const lead = { id: 'lead@company.test', name: 'Lead' };
const reviewer = { id: 'reviewer@company.test', name: 'Reviewer' };
const elements = [{ id: 'stack:a', title: 'Stack', owner: 'tech' as const }];
const team = [{ person: lead, jobIds: ['product'] }, { person: reviewer, jobIds: [] }];
const services = { sectionDocuments: {}, loadFoundationDraft: { loadIdentity: async () => ({ productName: 'Product' }) } };
function useDoc(doc: RetrospecDocument) {
	read.mockResolvedValue({ doc, elements, team, baselines: [], board: specValidationBoard({ doc, elements, team, viewer: lead, baselines: [] }) });
}
function requestedDoc() {
	const result = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'request_validation', itemId: 'stack:a', title: 'Stack', to: reviewer }], { actor: lead, now: '2026-11-13T00:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}

describe('server question review capability', () => {
	beforeEach(() => { read.mockReset(); save.mockClear(); useDoc(requestedDoc()); });
	const submit = (acts: Parameters<typeof applySpecValidationActs>[2], canWrite = false) => applySpecValidationActs(services as never, 'p', acts, reviewer, null, { canWrite });

	it('accepts an assigned reader own approval with the server authorization context [criterion:1a489659]', async () => {
		await submit([{ op: 'validate', itemId: 'stack:a' }]);
		expect(read).toHaveBeenCalledWith(services, 'p', reviewer, { requireTeam: true, reviewOnly: true });
		expect(save).toHaveBeenCalledWith(services.sectionDocuments, 'p', [expect.objectContaining({ op: 'validate', itemId: 'stack:a' })], expect.objectContaining({ reviewOnly: true, actor: reviewer, canReview: expect.any(Function) }), null);
	});

	it('does not turn a reader into a lead when no run exists [criterion:787a9fec]', async () => {
		useDoc(emptyRetrospecDocument());
		await expect(submit([{ op: 'validate', itemId: 'stack:a' }])).rejects.toMatchObject({ status: 403 });
		expect(save).not.toHaveBeenCalled();
	});

	it.each(['reject', 'request_validation', 'cancel_validation_request', 'finalize', 'remind'] as const)('does not grant %s rights to a requested reader [criterion:1a489659]', async (op) => {
		await expect(submit([{ op, itemId: 'stack:a', to: lead.id } as never])).rejects.toMatchObject({ status: 403 });
		expect(save).not.toHaveBeenCalled();
	});

	it('resolves a requested person from the current project roster [unspa:2e49df91:a2418cea:f082d9fb]', async () => {
		useDoc(emptyRetrospecDocument());
		await submit([{ op: 'request_validation', itemId: 'stack:a', to: reviewer.id.toUpperCase() }], true);
		expect(save).toHaveBeenCalledWith(services.sectionDocuments, 'p', [{ op: 'request_validation', itemId: 'stack:a', title: 'Stack', to: reviewer }], expect.anything(), null);
	});

	it('refuses people outside project reach before storing a request [unspa:2e49df91:a2418cea:bc5af207]', async () => {
		await expect(submit([{ op: 'request_validation', itemId: 'stack:a', to: 'outsider@company.test' }], true)).rejects.toMatchObject({ status: 400 });
		expect(save).not.toHaveBeenCalled();
	});

	it('can cancel an unavailable explicit reviewer without deleting role defaults [criterion:3b1c77a6]', async () => {
		const doc = requestedDoc();
		read.mockResolvedValue({ doc, elements, team: [team[0]], baselines: [], board: specValidationBoard({ doc, elements, team: [team[0]], viewer: lead, baselines: [] }) });
		await submit([{ op: 'cancel_validation_request', itemId: 'stack:a', to: reviewer.id }], true);
		expect(save).toHaveBeenCalledWith(services.sectionDocuments, 'p', [{ op: 'cancel_validation_request', itemId: 'stack:a', title: 'Stack', to: reviewer }], expect.anything(), null);
	});

	it.each([
		['request_validation', 'cancel_validation_request'],
		['cancel_validation_request', 'request_validation']
	] as const)('applies %s then %s against the projected reviewer list [criterion:3b1c77a6]', async (first, second) => {
		useDoc(first === 'request_validation' ? emptyRetrospecDocument() : requestedDoc());
		await applySpecValidationActs(services as never, 'p', [
			{ op: first, itemId: 'stack:a', to: reviewer.id },
			{ op: second, itemId: 'stack:a', to: reviewer.id }
		], lead, null);
		expect(save.mock.calls.at(-1)?.[2]).toMatchObject([{ op: first }, { op: second }]);
	});

	it('does not capture a baseline when a later act is refused [criterion:787a9fec]', async () => {
		const doc = requestedDoc();
		const published = { ...doc, runs: [{ ...doc.runs[0], publishedAt: '2026-11-13T00:01:00.000Z', publishedBy: lead, baselineId: 'existing' }] };
		useDoc(published);
		const capture = vi.fn();
		await expect(applySpecValidationActs({ ...services, captureBaseline: { execute: capture } } as never, 'p', [
			{ op: 'keep_drift', key: 'known' },
			{ op: 'request_validation', itemId: 'stack:a', to: reviewer.id }
		], lead, null)).rejects.toMatchObject({ status: 400 });
		expect(capture).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
	});
});
