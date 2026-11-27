import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionDocumentStorePort } from '$application/ports';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { createDraftLeaf, createEvolutionRequest, type EvolutionRequest, type ImplementationFinding, type ProjectEvolutionDraft } from '$domain/evolution';
import { specValidationBoard, type SpecElement } from '$domain/retrospec';

const scene = vi.hoisted(() => ({ elements: [] as unknown[] }));
vi.mock('./spec-elements.server', () => ({ readSpecElements: async () => scene.elements, forgetSpecElements: () => {} }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));

const { validateLandedInKnowledge } = await import('./evolution-knowledge-landing.server');

/**
 * The landing reads the choices a request made for what it touches (EVO-003):
 * an element set to Validate at the landing that the change only builds on is
 * validated through the request at its landing, the approval having covered
 * it; one the change amends is validated only once its code proves it.
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

/** A line of the report on the amended action, not proved yet. */
const unproved: ImplementationFinding = {
	id: 'line-a1',
	iteration: 1,
	verdict: 'missing',
	requirement: 'action a1',
	filePath: '',
	lineRange: '',
	specStatement: '',
	codeStatement: '',
	leafId: F,
	key: 'action:a1',
	owner: 'action:a1',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	scope: 'request',
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null
};

/** An approved request amending the cart that builds on Payments, both set to Validate at the landing before the freeze. */
function approved(): EvolutionRequest {
	const base = createEvolutionRequest({ title: 'Cart limit', stage: 'delivered', leafIds: [F] });
	return {
		...base,
		drafts: [createDraftLeaf({ id: 'draft:1', kind: 'amend', baseLeafId: F, behaviourModel: { operations: [{ kind: 'update_action', actionId: 'a1' }], mintedIds: [], updatedAt: AT } })],
		stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: 'actor Buyer\nuse case Pay: Buyer @[Payments](feature:feat-pay)' } },
		landingChoices: {
			'feature:feat-pay': { by: 'ada@example.com', at: AT },
			[`action:${F}:a1`]: { by: 'ada@example.com', at: AT, atFreeze: true }
		},
		implementationFindings: [unproved],
		stepValidations: [{ step: 'approval', validatorIds: [], validations: [{ by: 'bob@example.com', kind: 'person', at: AT }] }]
	} as EvolutionRequest;
}

const element = (id: string, title: string): SpecElement => ({ id, title, fingerprint: `f-${id}` });

describe('an element set to Validate at the landing', () => {
	beforeEach(() => {
		documents = new Map();
		saveDossier.mockClear();
	});

	it('reads Validated through the request at its landing when the change only builds on it [criterion:ac-leaf-30cef081-1bf5-42f4-8d0b-28b57723f3a3]', async () => {
		const before = approved();
		const after = { ...before, status: 'closed' as const, drafts: before.drafts.map((d) => ({ ...d, materialisedAt: AT })) };
		dossier = { draft: { projectId: PROJECT, requests: [after] } as ProjectEvolutionDraft, revision: 4 };
		scene.elements = [element('feature:feat-pay', 'Payments'), element(`action:${F}:a1`, 'Add to cart')];
		const services = { sectionDocuments, loadEvolutionDraft: { execute: async () => dossier.draft }, saveEvolutionDraft: { execute: saveDossier } } as unknown as AppServices;
		const results = await validateLandedInKnowledge(services, {
			projectId: PROJECT,
			before: { projectId: PROJECT, requests: [before] } as ProjectEvolutionDraft,
			after: { projectId: PROJECT, requests: [after] } as ProjectEvolutionDraft,
			// Knowledge read the same before: the landing wrote neither element.
			knowledgeBefore: new Map(scene.elements.map((e) => [(e as SpecElement).id, (e as SpecElement).fingerprint])),
			actor: ada,
			names: new Map([['bob@example.com', 'Bob']]),
			at: AT,
			origin: null
		});
		expect(results).toEqual([{ requestId: after.id, ok: true, summary: 'Knowledge: 1 element validated through EVO-001, 1 element to review.' }]);
		const { doc } = await loadRetrospecDocument(sectionDocuments, PROJECT);
		const board = specValidationBoard({ doc, elements: scene.elements as SpecElement[], team: [], viewer: null, baselines: [] });
		// Built on as it stands: the approval covered it.
		expect(board.standings['feature:feat-pay']).toMatchObject({ state: 'ok', through: { requestKey: 'EVO-001', approvedBy: [{ id: 'bob@example.com', name: 'Bob' }] } });
		// Amended, its line not proved in the code: it stays to review.
		expect(board.standings[`action:${F}:a1`]).toMatchObject({ state: 'todo', through: null });
		expect(dossier.draft.requests[0].knowledgeLanding).toMatchObject({ validated: ['feature:feat-pay'], toReview: [`action:${F}:a1`] });
	});
});
