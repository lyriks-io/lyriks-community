import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionDocumentStorePort } from '$application/ports';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { createEvolutionRequest, type EvolutionRequest, type ImplementationFinding, type ProjectEvolutionDraft } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { RETROSPEC_SECTION, specValidationBoard, type SpecElement } from '$domain/retrospec';

const scene = vi.hoisted(() => ({ view: null as unknown, elements: [] as unknown[], unreadable: false }));
vi.mock('./spec-elements.server', () => ({
	readSpecElements: async () => {
		if (scene.unreadable) throw new Error('The specification could not be read.');
		return scene.elements;
	},
	forgetSpecElements: () => {}
}));
vi.mock('./evolution-view.server', async (original) => ({
	...(await original<typeof import('./evolution-view.server')>()),
	loadEvolutionView: async () => scene.view
}));
vi.mock('./sync-bus.server', async (original) => ({
	...(await original<typeof import('./sync-bus.server')>()),
	publishSectionChange: vi.fn()
}));

const { validateLandedInKnowledge } = await import('./evolution-knowledge-landing.server');
const { applyEvolutionOperations } = await import('./evolution-operations.server');

/**
 * The landing validates in Knowledge what the change delivered (EVO-002): the
 * elements it wrote whose lines the code proved read Validated through the
 * request, the others To review, and a Knowledge that cannot be written never
 * undoes the landing.
 */

const PROJECT = 'p1';
const F = 'feat-cart';
const AT = '2026-11-20T10:00:00.000Z';
const ada = { kind: 'person', id: 'ada@example.com', role: 'owner', channel: 'page' } as const;

let documents: Map<string, { doc: unknown; revision: number }>;
let dossier: { draft: ProjectEvolutionDraft; revision: number };
const sectionDocuments = {
	load: async (projectId, section) => documents.get(`${projectId}/${section}`)?.doc ?? null,
	save: async (projectId, section, doc, expected) => {
		const now = documents.get(`${projectId}/${section}`)?.revision ?? 0;
		if (expected !== null && expected !== now) return null;
		documents.set(`${projectId}/${section}`, { doc, revision: now + 1 });
		return now + 1;
	},
	currentRevision: async (projectId, section) => (section === 'evolution' ? dossier.revision : (documents.get(`${projectId}/${section}`)?.revision ?? 0))
} satisfies SectionDocumentStorePort;
const saveDossier = vi.fn(async (draft: ProjectEvolutionDraft, opts: { expectedRevision: number | null }) => {
	if (opts.expectedRevision !== null && opts.expectedRevision !== dossier.revision) return null;
	dossier = { draft, revision: dossier.revision + 1 };
	return { revision: dossier.revision, savedAt: AT };
});

const line = (key: string, over: Partial<ImplementationFinding> = {}): ImplementationFinding => ({
	id: `line-${key}`,
	iteration: 1,
	verdict: 'conform',
	requirement: key,
	filePath: 'src/cart.ts',
	lineRange: '3',
	specStatement: '',
	codeStatement: '',
	leafId: F,
	key,
	owner: 'action:a1',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: true,
	specVersion: 1,
	scope: 'request',
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
});

/** An approved request amending the cart: one rule its code proves, one still missing. */
function approved(over: Partial<EvolutionRequest> = {}): EvolutionRequest {
	return createEvolutionRequest({
		title: 'Cart limit',
		stage: 'delivered',
		leafIds: [F],
		drafts: [{ id: 'draft:1', kind: 'amend', baseLeafId: F, name: '', description: '', acceptanceCriteria: [], dependsOn: [], sourceIds: [], behaviour: [], materialisedAs: null, materialisedAt: null }],
		implementationFindings: [line('rule:r1'), line('rule:r2', { verdict: 'missing', acceptanceTestPassing: false })],
		stepValidations: [{ step: 'approval', validatorIds: [], validations: [{ by: 'bob@example.com', kind: 'person', at: AT }] }],
		...over
	} as never);
}

const ruleElement = (id: string): SpecElement => ({ id: `rule:${F}:${id}`, title: `Rule ${id}`, fingerprint: `f-${id}` });

describe('the landing validates in Knowledge what the change delivered', () => {
	beforeEach(() => {
		documents = new Map();
		scene.unreadable = false;
		saveDossier.mockClear();
	});

	it('validates through the request every element it wrote whose lines are all proved, the others read To review [criterion:ac-leaf-0bb4e4b0-990c-4213-abc8-16f8aaaf0e91]', async () => {
		const before = approved();
		const after = { ...before, status: 'closed' as const, drafts: before.drafts.map((d) => ({ ...d, materialisedAt: AT })) };
		dossier = { draft: { projectId: PROJECT, requests: [after] } as ProjectEvolutionDraft, revision: 8 };
		scene.elements = [ruleElement('r1'), ruleElement('r2'), { id: 'term:t', title: 'Term · Cart', fingerprint: 'same' }];
		const services = { sectionDocuments, loadEvolutionDraft: { execute: async () => dossier.draft }, saveEvolutionDraft: { execute: saveDossier } } as unknown as AppServices;
		const results = await validateLandedInKnowledge(services, {
			projectId: PROJECT,
			before: { projectId: PROJECT, requests: [before] } as ProjectEvolutionDraft,
			after: { projectId: PROJECT, requests: [after] } as ProjectEvolutionDraft,
			knowledgeBefore: new Map([['term:t', 'same']]),
			actor: ada,
			names: new Map([['bob@example.com', 'Bob']]),
			at: AT,
			origin: null
		});
		expect(results).toEqual([{ requestId: after.id, ok: true, summary: 'Knowledge: 1 element validated through EVO-001, 1 element to review.' }]);
		const { doc } = await loadRetrospecDocument(sectionDocuments, PROJECT);
		const board = specValidationBoard({ doc, elements: scene.elements as SpecElement[], team: [], viewer: null, baselines: [] });
		expect(board.standings[`rule:${F}:r1`]).toMatchObject({ state: 'ok', through: { requestKey: 'EVO-001', approvedBy: [{ id: 'bob@example.com', name: 'Bob' }], at: AT } });
		expect(board.standings[`rule:${F}:r2`]).toMatchObject({ state: 'todo', through: null });
		const kept = dossier.draft.requests[0];
		expect(kept.knowledgeLanding).toEqual({ at: AT, validated: [`rule:${F}:r1`], toReview: [`rule:${F}:r2`] });
		expect(kept.history.at(-1)).toMatchObject({ type: 'knowledge_validation', authorId: ada.id });
	});
});

describe('a Knowledge that cannot be written never undoes the landing', () => {
	beforeEach(() => {
		documents = new Map();
		saveDossier.mockClear();
	});

	it('keeps the change live, leaves its elements To review and says why in the history of the request [criterion:ac-leaf-62fbf1ce-63fa-4549-9e03-b478659376b9]', async () => {
		const request = approved();
		dossier = { draft: { projectId: PROJECT, requests: [request] } as ProjectEvolutionDraft, revision: 7 };
		scene.unreadable = true;
		scene.view = {
			projectId: PROJECT,
			draft: dossier.draft,
			features: createEmptyFeaturesDraft(PROJECT),
			data: { projectId: PROJECT, entities: [], fields: [] },
			leaves: [],
			sources: [],
			glossaryTerms: [],
			members: [],
			held: {},
			coverage: {},
			filled: {},
			readings: {},
			revision: 7,
			language: 'en'
		};
		const services = {
			clock: { nowIso: () => AT },
			draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
			sectionDocuments,
			loadDocumentRegister: { execute: async () => ({ projectId: PROJECT, sources: [], lastSavedAt: null }) },
			saveDocumentsDraft: { execute: async () => ({}) },
			saveFeaturesDraft: { execute: async () => ({}) },
			saveDataDraft: { execute: async () => ({}) },
			saveEvolutionDraft: { execute: saveDossier },
			loadEvolutionDraft: { execute: async () => dossier.draft },
			implementationCoverage: { invalidate: () => {} },
			captureBaseline: { execute: async () => null },
			simulateBehavior: { execute: async () => ({ kind: 'walk', walk: { ok: true } }) },
			scheduleBackSync: async () => {}
		} as unknown as AppServices;
		const outcome = await applyEvolutionOperations(services, { projectId: PROJECT, operations: [{ op: 'declare_deployment', requestId: request.id }], actor: ada as never, origin: null });
		expect(outcome.ok).toBe(true);
		const landed = dossier.draft.requests[0];
		expect(landed.status).toBe('closed');
		expect(landed.knowledgeLanding).toMatchObject({ validated: [], failure: 'Knowledge could not be read before the landing.' });
		expect(landed.history.at(-1)).toMatchObject({ type: 'knowledge_validation', summary: expect.stringContaining('Knowledge could not record what EVO-001 delivered') });
		expect(JSON.stringify(outcome)).toContain('"op":"validate_in_knowledge","requestId":"' + request.id + '","ok":false');
		expect(documents.get(`${PROJECT}/${RETROSPEC_SECTION}`)).toBeUndefined();
	});
});
