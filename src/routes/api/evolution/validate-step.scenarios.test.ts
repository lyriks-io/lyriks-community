import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unvalidatedSpecSteps, type EvolutionRequest } from '$domain/evolution';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { AI_CLIENT, NOW, OUTSIDE, VIEWER, act, given, mia, owedWritten, send, stored, validatedBy } from './owed-texts.fixture';

vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => (await import('./owed-texts.fixture')).dossierView()
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));

/**
 * The scenarios of "Validate a step as a whole" (feature
 * feat-lyriks-copy-a52881-34, surface c91b0321, action a49448ad) as EVO-013
 * version 2 leaves it, run through the real door POST /api/evolution with
 * validate_step, the operation the section's Validate and the AI client send:
 * the Solution owes its description only and the Functional spec owes no text.
 */

beforeEach(() => forgetShortMemos());

const validate = (step: string) => ({ op: 'validate_step', step });
const validationsOf = (step: string) => stored().stepValidations.find((v) => v.step === step)?.validations ?? [];
const delegated = (over: Partial<EvolutionRequest> = {}) => owedWritten({ aiDelegations: [{ personId: mia.id, at: NOW }], ...over });
const DIAGRAM_BEHIND = 'The diagram is behind the texts of the Functional spec: it is being redrawn from them.';

describe('Validate a step as a whole (a49448ad)', () => {
	it('A designer validates the Functional spec [unspa:c91b0321:a49448ad:ef1a341b]', async () => {
		// It owes nothing: empty, the Functional spec is validated as it stands.
		const run = await act(given(), owedWritten(), [validate('functional_spec')]);
		expect(run.status).toBe('success');
		expect(validationsOf('functional_spec')).toMatchObject([{ by: mia.id, kind: 'person' }]);
		expect(unvalidatedSpecSteps(stored())).toHaveLength(3);
	});

	it('The last step validated lets the request move on [unspa:c91b0321:a49448ad:81797700]', async () => {
		const run = await act(given(), owedWritten({ stepValidations: [validatedBy('need'), validatedBy('solution'), validatedBy('functional_spec')] }), [validate('technical_spec')]);
		expect(run.status).toBe('success');
		expect(unvalidatedSpecSteps(stored())).toEqual([]);
	});

	it('With two people named, one validation is not enough [unspa:c91b0321:a49448ad:7aff62e9]', async () => {
		const run = await act(given(), owedWritten({ namedValidators: [{ target: 'step:functional_spec', people: [mia.id, 'leo@company.test'], gone: [] }] }), [validate('functional_spec')]);
		expect(run.status).toBe('success');
		expect(validationsOf('functional_spec')).toHaveLength(1);
		expect(unvalidatedSpecSteps(stored())).toContain('functional_spec');
	});

	it('The Need is validated answer by answer [unspa:c91b0321:a49448ad:619b345e]', async () => {
		const run = await act(given(), owedWritten(), [validate('need')]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toMatch(/^Validate each answer of the Need: 0 of \d+ validated\.$/);
	});

	it('The Solution is validated answer by answer [unspa:c91b0321:a49448ad:42b6798b]', async () => {
		const run = await act(given(), owedWritten(), [validate('solution')]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toMatch(/^Validate each answer of the Solution: 0 of \d+ validated\.$/);
	});

	it('The Need owes its situation or its objectives [unspa:c91b0321:a49448ad:02dca4f3]', async () => {
		// Every answer written stands validated, but the critical ones are empty.
		const base = owedWritten();
		const owing = { ...base, need: { ...base.need, description: 'Export the list.', situation: '', objectives: '' } };
		expect((await act(given(), owing, [{ op: 'validate_field', fieldPath: '00-need.description' }])).status).toBe('success');
		const run = await send([validate('need')]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('The need still owes its current situation or its objectives.');
	});

	it('The Solution owes its description [unspa:c91b0321:a49448ad:caea0615]', async () => {
		// Its examples are written and stand validated; its description is empty.
		const base = owedWritten();
		const owing = { ...base, stepDescriptions: { ...base.stepDescriptions, solution: '' }, stepAnswers: { ...base.stepAnswers, solution: { examples: 'Ten rows give ten lines.', out_of_scope: '' } } };
		expect((await act(given(), owing, [{ op: 'validate_field', fieldPath: 'step.solution.examples' }])).status).toBe('success');
		const run = await send([validate('solution')]);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('The Solution still owes its description.');
	});

	it('One validation per person [unspa:c91b0321:a49448ad:8f10be7a]', async () => {
		const run = await act(given(), owedWritten({ stepValidations: [validatedBy('functional_spec', mia.id)] }), [validate('functional_spec')]);
		expect(run.refusal?.message).toBe('You already validated this step.');
	});

	it('A delegated AI never approves the delivery [unspa:c91b0321:a49448ad:a71302a5]', async () => {
		const run = await act(given({}, AI_CLIENT), delegated({ stage: 'acceptance' }), [validate('approval')]);
		expect(run.refusal?.message).toBe("Approving the delivery stays a person's decision.");
	});

	it('A delegated AI validates the Technical spec [unspa:c91b0321:a49448ad:cc812e53]', async () => {
		const run = await act(given({}, AI_CLIENT), delegated(), [validate('technical_spec')]);
		expect(run.status).toBe('success');
		expect(validationsOf('technical_spec')).toMatchObject([{ by: mia.id, kind: 'ai_client' }]);
	});

	it('In a team an AI validates no step on its own account [unspa:c91b0321:a49448ad:66294e48]', async () => {
		const run = await act(given({}, AI_CLIENT), owedWritten(), [validate('functional_spec')]);
		expect(run.status).toBe('blocked');
		expect(validationsOf('functional_spec')).toEqual([]);
	});

	it('A diagram behind its texts holds the step [unspa:c91b0321:a49448ad:6a7608ce]', async () => {
		expect(
			(await act(given(), owedWritten(), [
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export.' },
				{ op: 'redraw_diagram', step: 'functional_spec', diagram: 'actor Person\nuse case Export the list: Person' },
				{ op: 'update_step_description', step: 'functional_spec', description: 'The person clicks Export and gets the file.' }
			])).status
		).toBe('success');
		const run = await send([validate('functional_spec')]);
		expect(run.refusal?.message).toBe(DIAGRAM_BEHIND);
	});

	it('A text behind its diagram holds the step [unspa:c91b0321:a49448ad:7c0443df]', async () => {
		// The Technical spec's diagram, edited by hand, moved past its description.
		expect(
			(await act(given(), owedWritten(), [
				{ op: 'update_step_description', step: 'technical_spec', description: 'A server route streams the CSV.' },
				{ op: 'redraw_diagram', step: 'technical_spec', diagram: 'component Exporter: new' },
				{ op: 'answer_step', step: 'technical_spec', question: 'diagram', answer: 'component Exporter: new\nstore Exports: new' }
			])).status
		).toBe('success');
		const run = await send([validate('technical_spec')]);
		expect(run.refusal?.message).toBe('A text of the Technical spec is behind its diagram: it is being updated from it.');
	});

	it('A viewer validates no step [unspa:c91b0321:a49448ad:7e6d27fb]', async () => {
		const run = await act(given({}, VIEWER), owedWritten(), [validate('functional_spec')]);
		expect(run.refusal?.status).toBe(403);
	});

	it('Outside the workspace a step answers not found [unspa:c91b0321:a49448ad:d53f4540]', async () => {
		const run = await act(given({}, OUTSIDE), owedWritten(), [validate('functional_spec')]);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it.each([
		['deleted', '0abb1679', 'This request is deleted.'],
		['closed', '34beb6eb', 'This request is closed.'],
		['cancelled', '7aefd439', 'This request is cancelled: reopen it first.']
	] as const)('A %s request takes no step validation [unspa:c91b0321:a49448ad:%s]', async (status, _scenario, message) => {
		const run = await act(given(), owedWritten({ status }), [validate('functional_spec')]);
		expect(run.refusal?.message).toBe(message);
	});

	it('Without sign-in the change still refuses a viewer a step [unspa:c91b0321:a49448ad:f71a0178]', async () => {
		const run = await act(given({ 'installation.signInRequired': false }, VIEWER), owedWritten(), [validate('functional_spec')]);
		expect(run.refusal?.message).toBe('A viewer cannot validate a step.');
	});
});
