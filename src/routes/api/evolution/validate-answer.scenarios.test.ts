import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldValidationOf, isStepValidated, unvalidatedSpecSteps, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, NOW, OUTSIDE, VIEWER, act, given, mia, owedWritten, send, stored, validatedBy } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Validate an answer" (feature feat-lyriks-copy-a52881-34,
 * surface c91b0321, action 93abb267) run through the real door POST
 * /api/evolution with validate_field, the operation the section's Validate and
 * the AI client send. The Need holds two answers, its situation and its
 * objectives: validating the second is validating its last answer.
 */

beforeEach(() => forgetShortMemos());

const SITUATION = '00-need.situation';
const OBJECTIVES = '00-need.objectives';
const validate = (fieldPath: string) => ({ op: 'validate_field', fieldPath });
const answer = (key: string) => fieldValidationOf(stored(), key);
const delegated = (over: Partial<EvolutionRequest> = {}) => owedWritten({ aiDelegations: [{ personId: mia.id, at: NOW }], ...over });

describe('Validate an answer (93abb267)', () => {
	it('A designer validates the last answer of the Need [unspa:c91b0321:93abb267:1326992d]', async () => {
		expect((await act(given(), owedWritten(), [validate(SITUATION)])).status).toBe('success');
		expect(isStepValidated(stored(), 'need')).toBe(false);
		const run = await send([validate(OBJECTIVES)]);
		expect(run.status).toBe('success');
		expect(answer(OBJECTIVES).status).toBe('validated');
		expect(answer(OBJECTIVES).validations).toHaveLength(1);
		expect(isStepValidated(stored(), 'need')).toBe(true);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(3);
	});

	it('The last step of specification lets the request move on [unspa:c91b0321:93abb267:2a0722c5]', async () => {
		const others = owedWritten({ stepValidations: [validatedBy('solution'), validatedBy('functional_spec'), validatedBy('technical_spec')] });
		expect((await act(given(), others, [validate(SITUATION)])).status).toBe('success');
		expect(unvalidatedSpecSteps(stored())).toEqual(['need']);
		const run = await send([validate(OBJECTIVES)]);
		expect(run.status).toBe('success');
		expect(unvalidatedSpecSteps(stored())).toEqual([]);
	});

	it('Validating again adds nothing [unspa:c91b0321:93abb267:7ad58ac7]', async () => {
		expect((await act(given(), owedWritten(), [validate(SITUATION), validate(OBJECTIVES)])).status).toBe('success');
		expect(isStepValidated(stored(), 'need')).toBe(true);
		const run = await send([validate(OBJECTIVES)]);
		expect(run.status).toBe('success');
		expect(run.results[0].summary).toBe('You already validated this version');
		expect(answer(OBJECTIVES).validations).toHaveLength(1);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(3);
	});

	it('Two validations are asked: the first is not enough [unspa:c91b0321:93abb267:ac3e15f4]', async () => {
		const run = await act(given(), owedWritten({ validationsPerAnswer: 2 }), [validate(OBJECTIVES)]);
		expect(run.status).toBe('success');
		expect(answer(OBJECTIVES).validations).toHaveLength(1);
		expect(answer(OBJECTIVES).status).not.toBe('validated');
	});

	it('A viewer cannot validate [unspa:c91b0321:93abb267:de416597]', async () => {
		const run = await act(given({}, VIEWER), owedWritten(), [validate(OBJECTIVES)]);
		expect(run.refusal?.status).toBe(403);
		expect(answer(OBJECTIVES).validations).toEqual([]);
	});

	it('Outside the workspace a validation answers not found [unspa:c91b0321:93abb267:8a0b0205]', async () => {
		const run = await act(given({}, OUTSIDE), owedWritten(), [validate(OBJECTIVES)]);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('In a team an AI cannot validate on its own account [unspa:c91b0321:93abb267:b26c3d7d]', async () => {
		const run = await act(given({}, AI_CLIENT), owedWritten(), [validate(OBJECTIVES)]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('An AI client cannot validate a field.');
		expect(answer(OBJECTIVES).validations).toEqual([]);
	});

	it("Under delegation the AI validates in its person's name [unspa:c91b0321:93abb267:c352b937]", async () => {
		const run = await act(given({}, AI_CLIENT), delegated(), [validate(OBJECTIVES)]);
		expect(run.status).toBe('success');
		expect(answer(OBJECTIVES).status).toBe('validated');
		expect(stored().fieldValidations.filter((v) => v.key === OBJECTIVES)).toMatchObject([{ by: mia.id, byKind: 'ai_client', delegated: true }]);
	});

	it('Nothing to validate before a first value [unspa:c91b0321:93abb267:876e81d8]', async () => {
		const run = await act(given(), owedWritten(), [validate('step.solution.examples')]);
		expect(run.refusal?.message).toBe('This field holds no value yet.');
	});

	it('A diagram behind its texts is not validated [unspa:c91b0321:93abb267:3a2bbc53]', async () => {
		expect(
			(await act(given(), owedWritten(), [
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export.' },
				{ op: 'redraw_diagram', step: 'functional_spec', diagram: 'actor Person\nuse case Export the list: Person' },
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export and gets the file.' }
			])).status
		).toBe('success');
		const run = await send([validate('step.functional_spec.diagram')]);
		expect(run.refusal?.message).toBe('The diagram is behind the texts of the Functional spec: it is being redrawn from them.');
	});

	it('A text behind its diagram is not validated [unspa:c91b0321:93abb267:88ae50eb]', async () => {
		// The Technical spec's diagram, edited by hand, moved past its description.
		expect(
			(await act(given(), owedWritten(), [
				{ op: 'update_step_description', step: 'technical_spec', description: 'A server route streams the CSV.' },
				{ op: 'redraw_diagram', step: 'technical_spec', diagram: 'component Exporter: new' },
				{ op: 'answer_step', step: 'technical_spec', question: 'diagram', answer: 'component Exporter: new\nstore Exports: new' }
			])).status
		).toBe('success');
		const run = await send([validate('step.technical_spec.description')]);
		expect(run.refusal?.message).toBe('A text of the Technical spec is behind its diagram: it is being updated from it.');
	});

	it.each([
		['closed', '5dff5b8a', 'This request is closed.'],
		['cancelled', '76512607', 'This request is cancelled: reopen it first.'],
		['deleted', '654b7d21', 'This request is deleted.']
	] as const)('Nothing is validated on a %s request [unspa:c91b0321:93abb267:%s]', async (status, _scenario, message) => {
		const run = await act(given(), owedWritten({ status }), [validate(OBJECTIVES)]);
		expect(run.refusal?.message).toBe(message);
	});

	it('Without sign-in the change still refuses a viewer its validation [unspa:c91b0321:93abb267:7a2c98a5]', async () => {
		const run = await act(given({ 'installation.signInRequired': false }, VIEWER), owedWritten(), [validate(OBJECTIVES)]);
		expect(run.refusal?.message).toBe('A viewer reads and comments, but does not validate.');
	});
});
