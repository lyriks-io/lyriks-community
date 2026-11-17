import type { EvolutionRequest } from './draft';
import { SPEC_STEPS } from './path';

/**
 * Tests only: a request whose Need, Solution, Functional spec and Technical
 * spec a person validated, so its Specification may be written
 * (ac-evo-form-step-lock). The steps it already validated keep their record.
 */
export function withSolutionValidated<R extends Pick<EvolutionRequest, 'stepValidations'>>(request: R): R {
	const held = new Set(request.stepValidations.map((v) => v.step));
	return {
		...request,
		stepValidations: [
			...request.stepValidations,
			...SPEC_STEPS.filter((step) => !held.has(step)).map((step) => ({
				step,
				validatorIds: [],
				validations: [{ by: 'ana', kind: 'person' as const, at: '2026-10-28T09:00:00.000Z' }]
			}))
		]
	};
}
