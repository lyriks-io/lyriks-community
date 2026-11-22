import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, fieldValidationOf, journeyPaths, latestVersion, readFunctionalDiagram, type EvolutionRequest, type Actor } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
import { applyEvolutionOperations } from './evolution-operations.server';

/**
 * Criterion fa81c0eb: an AI client validating in a person's name validates a
 * path of the journey by its key alone, and Lyriks stands behind the path as
 * the page shows it; a key the Specification does not offer is refused.
 */
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: '2026-11-19T22:00:00Z' }));
const services = {
	clock: { nowIso: () => '2026-11-19T22:00:00Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {}
} as unknown as AppServices;
// A decision relayed by the person's AI lands as the person's.
const relayed: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'ai_client' };

const DRAWING = 'actor Person\nuse case Export the list: Person\nflow Export the list\nPerson: clicks Export\n  refused when the list is empty: nothing is exported';

function view(request: EvolutionRequest) {
	scene.view = { projectId: 'p', draft: { projectId: 'p', requests: [request] }, features: createEmptyFeaturesDraft('p'), data: {}, leaves: [], sources: [], glossaryTerms: [], members: [], held: {}, coverage: {}, filled: {}, readings: {}, revision: 1, language: 'en' };
}
const run = (operations: unknown[]) => applyEvolutionOperations(services, { projectId: 'p', operations, actor: relayed, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}

async function drawn(): Promise<EvolutionRequest> {
	view({ ...createEvolutionRequest({ id: 'r', title: 'Export as CSV' }), stage: 'specification' });
	expect((await run([{ op: 'answer_step', requestId: 'r', step: 'functional_spec', question: 'diagram', answer: DRAWING }])).ok).toBe(true);
	const request = saved();
	save.mockClear();
	view(request);
	return request;
}

describe('an AI validates a path of the journey by its key alone (criterion fa81c0eb)', () => {
	beforeEach(() => save.mockClear());

	it('stands behind the path as the page shows it, the same version the page would validate', async () => {
		const request = await drawn();
		const [path] = journeyPaths(readFunctionalDiagram(request.stepAnswers.functional_spec.diagram).diagram);
		expect(path.key).toBe('element.path.export-the-list');
		const result = await run([{ op: 'validate_field', requestId: 'r', fieldPath: path.key }]);
		expect(result.ok).toBe(true);
		expect(fieldValidationOf(saved(), path.key).status).toBe('validated');
		expect(latestVersion(saved(), path.key)?.value).toBe(path.fingerprint);
	});

	it('refuses a key the Specification does not offer, saying where the keys are read', async () => {
		await drawn();
		const result = await run([{ op: 'validate_field', requestId: 'r', fieldPath: 'element.path.import-the-list' }]);
		expect(result.ok).toBe(false);
		const refusal = result.results.find((r) => r.op === 'validate_field');
		expect(refusal?.summary).toBe('The Specification offers no action or path of the journey under element.path.import-the-list.');
		expect(save).not.toHaveBeenCalled();
	});
});
