import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldValidationOf, journeyPaths, readFunctionalDiagram, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, DRAWING, NOW, OUTSIDE, VIEWER, act, given, mia, owedWritten, send, stored } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Validate a path of the journey" (feature
 * feat-lyriks-copy-a52881-20, surface c8c3f24a, action 7780a0d8) as EVO-013
 * version 2 leaves it, run through the real door POST /api/evolution with the
 * operation the page's Validate this path sends (validate_field on
 * element.path.<use case>).
 */

beforeEach(() => forgetShortMemos());

/** The Journey holds a drawing, in step with texts nobody wrote yet. */
const drawn = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => {
	const base = owedWritten(over);
	return { ...base, stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: DRAWING } } };
};
const PATH = journeyPaths(readFunctionalDiagram(DRAWING).diagram)[0].key;
const validatePath = { op: 'validate_field', fieldPath: PATH };
/** Where the path stands for the reader, against what the drawing says now (a path whose steps changed reads stale). */
const mine = () => fieldValidationOf(stored(), PATH, journeyPaths(readFunctionalDiagram(stored().stepAnswers.functional_spec.diagram ?? '').diagram).find((p) => p.key === PATH)?.fingerprint);

describe('Validate a path of the journey (7780a0d8)', () => {
	it('A designer validates a path [unspa:c8c3f24a:7780a0d8:db372b50]', async () => {
		const run = await act(given(), drawn(), [validatePath]);
		expect(run.status).toBe('success');
		expect(mine().status).toBe('validated');
		expect(mine().validations.map((v) => v.by)).toEqual([mia.id]);
	});

	it('A path whose steps changed is validated again [unspa:c8c3f24a:7780a0d8:54f7eed8]', async () => {
		expect((await act(given(), drawn(), [validatePath])).status).toBe('success');
		// A step added to the flow changes what the path says: the validation goes stale.
		expect((await send([{ op: 'answer_step', step: 'functional_spec', question: 'diagram', answer: `${DRAWING}\nPerson: downloads the file` }])).status).toBe('success');
		expect(mine().status).toBe('changed_outside');
		expect((await send([validatePath])).status).toBe('success');
		expect(mine().status).toBe('validated');
	});

	it('No path without a drawing [unspa:c8c3f24a:7780a0d8:5a3881c0]', async () => {
		const run = await act(given(), owedWritten(), [validatePath]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe(`The Specification offers no action or path of the journey under ${PATH}.`);
	});

	it('An AI does not validate a path in a team [unspa:c8c3f24a:7780a0d8:f736305a]', async () => {
		const run = await act(given({}, AI_CLIENT), drawn(), [validatePath]);
		expect(run.status).toBe('blocked');
		expect(mine().status).not.toBe('validated');
	});

	it('A delegated AI validates a path for its person [unspa:c8c3f24a:7780a0d8:b4861805]', async () => {
		const run = await act(given({}, AI_CLIENT), drawn({ aiDelegations: [{ personId: mia.id, at: NOW }] }), [validatePath]);
		expect(run.status).toBe('success');
		expect(mine().status).toBe('validated');
		expect(stored().fieldValidations.find((v) => v.key === PATH)).toMatchObject({ by: mia.id, delegated: true });
	});

	it('A cancelled request takes no validation [unspa:c8c3f24a:7780a0d8:219a2614]', async () => {
		const run = await act(given(), drawn({ status: 'cancelled' }), [validatePath]);
		expect(run.refusal?.message).toBe('This request is cancelled: reopen it first.');
		expect(mine().status).not.toBe('validated');
	});

	it('A viewer does not validate a path [unspa:c8c3f24a:7780a0d8:02c32f9d]', async () => {
		const run = await act(given({}, VIEWER), drawn(), [validatePath]);
		expect(run.refusal?.status).toBe(403);
		expect(mine().status).not.toBe('validated');
	});

	it('Someone outside the workspace does not validate a path [unspa:c8c3f24a:7780a0d8:e9943f50]', async () => {
		const run = await act(given({}, OUTSIDE), drawn(), [validatePath]);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('A path whose drawing is behind its texts is not validated [unspa:c8c3f24a:7780a0d8:034f2fcd]', async () => {
		// Drawn from the Functional spec's description, then a new description moves past the drawing.
		expect(
			(await act(given(), owedWritten(), [
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export.' },
				{ op: 'redraw_diagram', step: 'functional_spec', diagram: DRAWING },
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export and gets the file.' }
			])).status
		).toBe('success');
		const run = await send([validatePath]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('The diagram is behind the texts of the Functional spec: it is being redrawn from them.');
		expect(mine().status).not.toBe('validated');
	});
});
