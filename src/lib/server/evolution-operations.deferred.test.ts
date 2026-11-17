import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, type EvolutionRequest, type ImplementationFinding } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';

const scene = vi.hoisted(() => ({ view: null as unknown }));

vi.mock('./evolution-view.server', async (original) => ({
	...(await original<typeof import('./evolution-view.server')>()),
	loadEvolutionView: async () => scene.view
}));
vi.mock('./sync-bus.server', async (original) => ({
	...(await original<typeof import('./sync-bus.server')>()),
	publishSectionChange: vi.fn()
}));

import { applyEvolutionOperations } from './evolution-operations.server';

const PROJECT = 'p1';
const saveDossier = vi.fn(async (..._args: unknown[]) => ({ revision: 8, savedAt: '2026-11-09T00:00:00.000Z' }));

const services = {
	clock: { nowIso: () => '2026-11-09T00:00:00.000Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 7 },
	saveFeaturesDraft: { execute: vi.fn(async () => ({})) },
	saveDataDraft: { execute: vi.fn(async () => ({})) },
	saveEvolutionDraft: { execute: saveDossier },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {}
} as unknown as AppServices;

const deferredLine = (decision: ImplementationFinding['decision'] = 'validated') =>
	({ id: 'line-1', iteration: 1, verdict: 'missing', decision, requirement: 'Export › rule "No link to export"', specStatement: 'The spec declares the rule.', scope: 'request', leafId: 'feat-x' }) as ImplementationFinding;

function source(line: ImplementationFinding): EvolutionRequest {
	const request = { ...createEvolutionRequest({ title: 'The source' }), id: 'source', iteration: 1, implementationFindings: [line] };
	const features = { ...createEmptyFeaturesDraft(PROJECT), features: [{ id: 'feat-x', name: 'X' }], leafMeta: {} };
	scene.view = { projectId: PROJECT, draft: { projectId: PROJECT, requests: [request] }, features, data: {}, leaves: [{ id: 'feat-x', name: 'X' }], sources: [], glossaryTerms: [], members: [], held: {}, coverage: {}, filled: {},  readings: {}, revision: 7, language: 'en' };
	return request;
}

const start = () =>
	applyEvolutionOperations(services, {
		projectId: PROJECT,
		operations: [{ op: 'open_request', id: 'started', deferredLineId: 'line-1', leafIds: [] }],
		actor: { kind: 'person', id: 'ada@example.com', name: 'Ada' } as never,
		origin: null
	});

/** The dossier as the batch saved it, wherever the port receives it. */
function savedRequests(): EvolutionRequest[] {
	const found = saveDossier.mock.calls[0].flat().find((arg) => Array.isArray((arg as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return found.requests;
}

describe('a suggestion becomes an evolution in one act [criterion:03b7eacf]', () => {
	beforeEach(() => saveDossier.mockClear());

	it('opens it titled after the omission, linked to its line, its Need naming where it comes from', async () => {
		source(deferredLine());
		expect((await start()).ok).toBe(true);
		const started = savedRequests().find((r) => r.id === 'started')!;
		expect(started).toMatchObject({ title: 'No link to export', origin: 'technical_debt', deferredFrom: { requestId: 'source', lineId: 'line-1' }, leafIds: ['feat-x'] });
		expect(started.need.description).toBe('Deferred from EVO-001 at its Verification. The spec declares the rule.');
	});

	it('is refused, with nothing written, once the line is no longer deferred', async () => {
		source(deferredLine('undecided'));
		const outcome = await start();
		expect(outcome.ok).toBe(false);
		expect(JSON.stringify(outcome)).toContain('This omission no longer waits for an evolution.');
		expect(saveDossier).not.toHaveBeenCalled();
	});
});
