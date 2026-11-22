import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, type EvolutionRequest, type Actor } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
// The readings an entry makes due run elsewhere; this file reads the stage only.
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
import { applyEvolutionOperations } from './evolution-operations.server';

/**
 * Criterion b10629df: a request whose specification is written reaches the
 * Impact analysis on its own, without any validation, whoever wrote last.
 */
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: '2026-11-18T14:00:00Z' }));
const services = {
	clock: { nowIso: () => '2026-11-18T14:00:00Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {}
} as unknown as AppServices;
const person: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };
const client: Actor = { ...person, kind: 'ai_client', channel: 'ai_client' };

function view(request: EvolutionRequest) {
	scene.view = { projectId: 'p', draft: { projectId: 'p', requests: [request] }, features: createEmptyFeaturesDraft('p'), data: {}, leaves: [], sources: [{ id: 'src-1', title: 'The ask' }], glossaryTerms: [], members: [], held: {}, coverage: {}, filled: {}, readings: {}, revision: 1, language: 'en' };
}
const run = (actor: Actor, operations: unknown[]) => applyEvolutionOperations(services, { projectId: 'p', operations, actor, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}

const need = { op: 'update_need', requestId: 'r', description: 'Export the list as CSV.', situation: 'People copy the list by hand.', objectives: 'The list exports as CSV.' };
const solution = { op: 'update_step_description', requestId: 'r', step: 'solution', description: 'An Export button writes the list as CSV.' };
const draft = { op: 'add_draft_leaf', requestId: 'r', kind: 'add', name: 'Export the list as CSV' };
const offered = [
	{ op: 'answer_step', requestId: 'r', step: 'solution', question: 'examples', answer: 'Ten rows give a file of ten lines.' },
	{ op: 'update_step_description', requestId: 'r', step: 'functional_spec', description: 'The person clicks Export and gets the file.' },
	{ op: 'answer_step', requestId: 'r', step: 'functional_spec', question: 'refusals', answer: 'An empty list exports nothing.' },
	{ op: 'update_step_description', requestId: 'r', step: 'technical_spec', description: 'A server route streams the CSV.' }
];
const everythingButTheLastWrite = [need, draft];
// The Solution's description is the last text the request owes.
const theLastWrite = solution;

async function written(actor: Actor, operations: unknown[]): Promise<EvolutionRequest> {
	// open_request opens a request in Specify.
	view({ ...createEvolutionRequest({ id: 'r', title: 'Export as CSV' }), stage: 'specification' });
	const result = await run(actor === client ? person : actor, operations);
	expect(result.ok).toBe(true);
	return saved();
}

async function writtenUpToTheLastWrite(actor: Actor): Promise<EvolutionRequest> {
	const request = await written(actor, everythingButTheLastWrite);
	expect(request.stage).toBe('specification');
	save.mockClear();
	view(request);
	return request;
}

describe('a request owing nothing more reaches the Impact analysis without any validation [criterion:b10629df]', () => {
	beforeEach(() => save.mockClear());

	it('writing the last missing text moves the request on, nobody having validated anything', async () => {
		await writtenUpToTheLastWrite(person);
		expect((await run(person, [theLastWrite])).ok).toBe(true);
		expect(saved().stage).toBe('coherence');
		expect(saved().stepValidations.every((v) => v.validations.length === 0)).toBe(true);
	});

	it('an AI writing the last missing text moves the request on too, and the history keeps it was an assistant', async () => {
		await writtenUpToTheLastWrite(client);
		expect((await run(client, [theLastWrite])).ok).toBe(true);
		const request = saved();
		expect(request.stage).toBe('coherence');
		expect(request.history.find((h) => h.type === 'stage_crossing' && h.summary.includes('coherence'))?.authorKind).toBe('ai_client');
	});

	it('a proposal waiting for a decision keeps the written request in Specify', async () => {
		await writtenUpToTheLastWrite(person);
		const result = await run(client, [
			{ op: 'propose', requestId: 'r', fieldPath: '00-need.measures', leafId: null, value: ['Exports: 0 -> 10 a week'], whatWasRead: 'The ask.', whatWasInferred: 'A weekly use.', citedSourceIds: ['src-1'] },
			theLastWrite
		]);
		expect(result.ok).toBe(true);
		expect(saved().stage).toBe('specification');
	});

	it('a request sent back to Specify with its texts written stays there while it is edited [criterion:dc1fcf8b]', async () => {
		await writtenUpToTheLastWrite(person);
		expect((await run(person, [theLastWrite])).ok).toBe(true);
		const sentBack = { ...saved(), stage: 'specification' as const };
		save.mockClear();
		view(sentBack);
		expect((await run(person, [{ op: 'answer_step', requestId: 'r', step: 'solution', question: 'examples', answer: 'Ten rows give ten lines, plus a header.' }])).ok).toBe(true);
		expect(saved().stage).toBe('specification');
	});
});

describe('a request enters the Impact analysis on its own once its Need\'s situation and objectives and its Solution\'s description are written, it carries a change and no proposal waits, its specs written or not [criterion:ac-leaf-80349d4a-ab91-457c-b721-6745c5cf9015]', () => {
	beforeEach(() => save.mockClear());

	it('enters with its Functional spec and its Technical spec empty', async () => {
		const request = await written(person, [need, solution, draft]);
		expect(request.stage).toBe('coherence');
		expect(request.stepDescriptions.functional_spec).toBe('');
		expect(request.stepDescriptions.technical_spec).toBe('');
	});

	it('enters with its Functional spec and its Technical spec written, no diagram drawn', async () => {
		const request = await written(person, [need, solution, ...offered, draft]);
		expect(request.stage).toBe('coherence');
		expect(request.stepAnswers.functional_spec.refusals).toBe('An empty list exports nothing.');
	});

	it('stays in Specify while it carries nothing that changes the product, and enters with its first draft', async () => {
		const request = await written(person, [need, solution, ...offered]);
		expect(request.stage).toBe('specification');
		save.mockClear();
		view(request);
		expect((await run(person, [draft])).ok).toBe(true);
		expect(saved().stage).toBe('coherence');
	});

	it('stays in Specify while the Need\'s situation, its objectives or the Solution\'s description is empty', async () => {
		expect((await written(person, [{ ...need, situation: '' }, solution, draft])).stage).toBe('specification');
		save.mockClear();
		expect((await written(person, [{ ...need, objectives: '' }, solution, draft])).stage).toBe('specification');
		save.mockClear();
		expect((await written(person, [need, ...offered, draft])).stage).toBe('specification');
	});

	it('stays in Specify while a proposal waits for a decision', async () => {
		const request = await written(client, [
			need,
			draft,
			{ op: 'propose', requestId: 'r', fieldPath: '00-need.measures', leafId: null, value: ['Exports: 0 -> 10 a week'], whatWasRead: 'The ask.', whatWasInferred: 'A weekly use.', citedSourceIds: ['src-1'] },
			solution
		]);
		expect(request.stage).toBe('specification');
	});
});
