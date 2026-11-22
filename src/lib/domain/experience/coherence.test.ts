import { describe, expect, it } from 'vitest';
import { computeExperienceCoherence } from './coherence';
import { createDataRead, createEmptyExperienceDraft, createJourney, createOperation, createStep, type DerivedCore, type ProjectExperienceDraft } from './draft';

const core = (id: string, name: string): DerivedCore => ({ id, name, order: 0, tone: 'custom', sourceRefId: id });
const codes = (draft: ProjectExperienceDraft) => computeExperienceCoherence(draft).issues.map((i) => i.code);

/** One core, one journey through it, one step linked to a screen and carrying an event. */
function complete(): ProjectExperienceDraft {
	const journey = createJourney('c-order', 0, { id: 'j-order' });
	const step = createStep('j-order', 0, { id: 's-pay', linkedScreenId: 'screen-pay' });
	return {
		...createEmptyExperienceDraft('p1'),
		derivedCores: [core('c-order', 'Ordering')],
		journeys: [journey],
		steps: [step],
		stepOperations: [createOperation('s-pay', 0)]
	};
}

describe('the Experience step coherence, computed on every save', () => {
	it('scores an empty step 0 and says no journey is written yet', () => {
		const result = computeExperienceCoherence(createEmptyExperienceDraft('p1'));
		expect(result.score).toBe(0);
		expect(result.tone).toBe('critical');
		expect(result.issues.map((i) => i.code)).toEqual(['no-journey']);
	});

	it('scores 100 with nothing to fix when every core has a journey and every step a screen and an underlay', () => {
		const result = computeExperienceCoherence(complete());
		expect(result.score).toBe(100);
		expect(result.tone).toBe('strong');
		expect(result.issues).toEqual([]);
	});

	it('gives each part its share in proportion to what is covered, and names each shortfall', () => {
		const base = complete();
		const draft: ProjectExperienceDraft = {
			...base,
			derivedCores: [...base.derivedCores, core('c-pay', 'Paying')],
			journeys: [...base.journeys, createJourney('c-order', 1, { id: 'j-empty' })],
			steps: [...base.steps, createStep('j-order', 1, { id: 's-bare' })]
		};
		// 20 for a journey, half of 25 for journeys with a step, half of 15 for cores
		// with a journey, half of 20 for linked steps, half of 20 for steps with an underlay.
		expect(computeExperienceCoherence(draft).score).toBe(20 + Math.round(12.5) + Math.round(7.5) + 10 + 10);
		expect(codes(draft)).toEqual(['journey-without-step', 'core-without-journey', 'step-without-screen', 'step-without-underlay']);
	});

	it('names the cores left without a journey, by their id when they have no name', () => {
		const draft = { ...complete(), derivedCores: [core('c-order', 'Ordering'), core('c-pay', 'Paying'), core('c-ship', '')] };
		const message = computeExperienceCoherence(draft).issues.find((i) => i.code === 'core-without-journey')?.message ?? '';
		expect(message).toContain('Paying');
		expect(message).toContain('c-ship');
		expect(message).not.toContain('Ordering');
	});

	it('takes data a step reads as its underlay as well as an events flow', () => {
		const base = complete();
		const draft = { ...base, stepOperations: [], stepDataReads: [createDataRead('s-pay', 0, { entityName: 'Order' })] };
		expect(codes(draft)).toEqual([]);
		expect(codes({ ...base, stepOperations: [] })).toEqual(['step-without-underlay']);
	});
});
