import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldValidationOf, journeyPaths, readFunctionalDiagram, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { DRAWING, OUTSIDE, VIEWER, act, given, owedWritten, send, stored } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Validate the journey and every path waiting" (feature
 * feat-lyriks-copy-a52881-20, surface c8c3f24a, action 1b3f9753) as EVO-013
 * version 2 leaves it, run through the real door POST /api/evolution with the
 * batch the page's Validate all sends: validate_field on the drawing
 * (step.functional_spec.diagram), then on each path waiting, with the path's
 * fingerprint as its value. Two scenarios stay with the page alone: the
 * button that shows no count when nothing waits (b6683d01), and a drawing
 * validated beside a stale path (4da37a87), which no act can leave since a
 * path only changes with its drawing.
 */

beforeEach(() => forgetShortMemos());

const JOURNEY = 'step.functional_spec.diagram';
const PATH = journeyPaths(readFunctionalDiagram(DRAWING).diagram)[0];
const drawn = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => {
	const base = owedWritten(over);
	return { ...base, stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: DRAWING } } };
};
const validateAll = [
	{ op: 'validate_field', fieldPath: JOURNEY },
	{ op: 'validate_field', fieldPath: PATH.key, value: PATH.fingerprint }
];
const standing = (key: string) => fieldValidationOf(stored(), key).status;

describe('Validate the journey and every path waiting (1b3f9753)', () => {
	it('The journey and its paths are validated at once [unspa:c8c3f24a:1b3f9753:1522dc43]', async () => {
		const run = await act(given(), drawn(), validateAll);
		expect(run.status).toBe('success');
		expect(standing(JOURNEY)).toBe('validated');
		expect(standing(PATH.key)).toBe('validated');
	});

	it('A viewer validates nothing at once [unspa:c8c3f24a:1b3f9753:5d9f57b5]', async () => {
		const run = await act(given({}, VIEWER), drawn(), validateAll);
		expect(run.refusal?.status).toBe(403);
		expect(standing(PATH.key)).not.toBe('validated');
	});

	it('Someone outside the workspace validates nothing at once [unspa:c8c3f24a:1b3f9753:2e45c9cc]', async () => {
		const run = await act(given({}, OUTSIDE), drawn(), validateAll);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('A cancelled request validates nothing at once [unspa:c8c3f24a:1b3f9753:571cfc5c]', async () => {
		const run = await act(given(), drawn({ status: 'cancelled' }), validateAll);
		expect(run.refusal?.message).toBe('This request is cancelled: reopen it first.');
		expect(standing(JOURNEY)).not.toBe('validated');
	});

	it('Nothing to validate without a drawing [unspa:c8c3f24a:1b3f9753:e3c23012]', async () => {
		const run = await act(given(), owedWritten(), [{ op: 'validate_field', fieldPath: JOURNEY }]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This field holds no value yet.');
	});

	it('No path waiting is validated while the drawing is behind its texts [unspa:c8c3f24a:1b3f9753:aa1398b0]', async () => {
		expect(
			(await act(given(), owedWritten(), [
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export.' },
				{ op: 'redraw_diagram', step: 'functional_spec', diagram: DRAWING },
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export and gets the file.' }
			])).status
		).toBe('success');
		const run = await send(validateAll);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('The diagram is behind the texts of the Functional spec: it is being redrawn from them.');
		expect(standing(JOURNEY)).not.toBe('validated');
		expect(standing(PATH.key)).not.toBe('validated');
	});
});
