import { describe, expect, it } from 'vitest';
import { drawingFillHeight, sectionAnswersWithDrawing } from './section-drawing';
import { sectionStanding, sectionValidation } from './section-validation';

describe('the list and the diagram of a section are validated as one [criterion:ac-leaf-ac-evo-sol-diagram-alone]', () => {
	const text = { path: 'step.technical_spec.description', leafId: null, filled: true, trail: { validation: 'validated', validatedBy: ['ada'] } };
	const redrawn = { path: 'step.technical_spec.diagram', leafId: null, filled: true, trail: { validation: 'unvalidated' } };
	const step = { step: 'technical_spec', validatedBy: ['ada'], validated: true };

	it('counts the drawing among the answers of its section', () => {
		expect(sectionAnswersWithDrawing([text], redrawn)).toEqual([text, redrawn]);
		expect(sectionAnswersWithDrawing([text], null)).toEqual([text]);
	});

	it('reads the section waiting while its drawing changed since its validation, though every requirement is validated', () => {
		const answers = sectionAnswersWithDrawing([text], redrawn);
		expect(sectionStanding(answers, [step], 'ada')).toEqual({ mine: false, settled: false, waits: true });
		expect(sectionStanding([text], [step], 'ada').settled).toBe(true);
	});

	it('validates the drawing with the section, whichever reading the person is on', () => {
		const act = sectionValidation(sectionAnswersWithDrawing([text], redrawn), [step], 'ada');
		expect(act.operations).toEqual([{ op: 'validate_field', fieldPath: 'step.technical_spec.diagram' }]);
	});
});

describe('a diagram shown takes all the height the window leaves [criterion:ac-leaf-ac-evo-sol-diagram-alone]', () => {
	it('grows the drawing so the card ends at the bottom of the window, its top under the header', () => {
		// Window down to 950, card brought under the header at 136: 950 - 16 - 136 = 798 for the card; it is 520 with a 380 drawing.
		expect(drawingFillHeight({ windowBottom: 950, under: 136, cardHeight: 520, drawingHeight: 380 })).toBe(658);
	});

	it('shrinks a drawing taller than the window to fit it, never below a size that reads', () => {
		expect(drawingFillHeight({ windowBottom: 950, under: 136, cardHeight: 1400, drawingHeight: 1200 })).toBe(598);
		expect(drawingFillHeight({ windowBottom: 500, under: 136, cardHeight: 900, drawingHeight: 700 })).toBe(360);
	});
});
