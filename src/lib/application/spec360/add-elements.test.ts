import { describe, expect, it } from 'vitest';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyExperienceDraft } from '$domain/experience';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { parseSpecEdit } from '$application/specification/parse-spec-edit';
import { addToArchitecture, addToExperience, addToGlossary, newActionOps } from './add-elements';

const ID = '3f1c2a4e-8b7d-4c1a-9e2f-5a6b7c8d9e01';

describe('every list that can be created takes its new element [criterion:51e215ef]', () => {
	it('adds a journey, a component, a stack component, a constraint and a term named New <kind>, once per id', () => {
		const journey = addToExperience(createEmptyExperienceDraft('p'), 'journey', ID);
		expect(journey.anchor).toBe(`journey:${ID}`);
		expect(journey.draft.journeys.map((j) => j.name)).toEqual(['New journey']);
		expect(addToExperience(journey.draft, 'journey', ID).draft.journeys).toHaveLength(1);
		expect(addToExperience(createEmptyExperienceDraft('p'), 'component', ID).draft.components[0].name).toBe('New component');
		expect(addToArchitecture(createEmptyArchitectureDraft('p'), 'stack', ID).draft.techChoices[0]).toMatchObject({ name: 'New stack component', layer: 'backend' });
		expect(addToArchitecture(createEmptyArchitectureDraft('p'), 'constraint', ID).draft.constraints[0].title).toBe('New constraint');
		expect(addToGlossary(createEmptyGlossaryDraft('p'), ID).draft.terms[0].term).toBe('New term');
	});

	it('gives a new action its one allowing rule, on a new surface when the feature has none', () => {
		expect(newActionOps('s1', 'Refunds').map((op) => op.kind)).toEqual(['add_action', 'add_action_rule']);
		expect(newActionOps(null, 'Refunds').map((op) => op.kind)).toEqual(['add_surface', 'add_action', 'add_action_rule']);
	});

	it('reads the add requests from an untrusted body', () => {
		expect(parseSpecEdit({ op: 'add_element', kind: 'term', id: ID })).toEqual({ ok: true, request: { op: 'add_element', kind: 'term', id: ID } });
		expect(parseSpecEdit({ op: 'add_element', kind: 'screen' })).toMatchObject({ ok: false });
		expect(parseSpecEdit({ op: 'add_action', featureId: 'refunds' })).toEqual({ ok: true, request: { op: 'add_action', featureId: 'refunds' } });
	});
});
