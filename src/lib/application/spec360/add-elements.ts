import { createConstraint, createTechChoice, type ProjectArchitectureDraft } from '$domain/architecture';
import { createComponent, createJourney, type ProjectExperienceDraft } from '$domain/experience';
import { createTerm, type ProjectGlossaryDraft } from '$domain/glossary';

/**
 * The elements the Edit mode adds at the foot of their list beyond the users,
 * core features and features (criterion 51e215ef of feat-lyriks-copy-a52881-47):
 * journeys and components (Experience), stack components and constraints
 * (Technology & data), terms (Glossary). Each is named New <kind> so the reader
 * types over it at once. `id` is the one the page minted; one already in the
 * draft is the same add sent twice, so the draft stays as it is. Pure.
 */

export type AddedKind = 'journey' | 'component' | 'stack' | 'constraint' | 'term';

export const ADDED_KINDS: readonly AddedKind[] = ['journey', 'component', 'stack', 'constraint', 'term'];

export const NEW_NAME: Readonly<Record<AddedKind | 'action', string>> = {
	journey: 'New journey',
	component: 'New component',
	stack: 'New stack component',
	constraint: 'New constraint',
	term: 'New term',
	action: 'New action'
};

/** The section each kind lives in, so the server loads and saves the right draft. */
export const SECTION_OF: Readonly<Record<AddedKind, 'experience' | 'architecture' | 'glossary'>> = {
	journey: 'experience',
	component: 'experience',
	stack: 'architecture',
	constraint: 'architecture',
	term: 'glossary'
};

const withId = (id: string | undefined) => (id ? { id } : {});

export function addToExperience(draft: ProjectExperienceDraft, kind: 'journey' | 'component', id?: string): { draft: ProjectExperienceDraft; anchor: string } {
	if (kind === 'journey') {
		if (id && draft.journeys.some((j) => j.id === id)) return { draft, anchor: `journey:${id}` };
		const order = draft.journeys.reduce((max, j) => Math.max(max, j.order), -1) + 1;
		// A journey sits under a stage of the flow; the first one takes it until the reader moves it.
		const journey = createJourney(draft.derivedCores[0]?.id ?? '', order, { ...withId(id), name: NEW_NAME.journey });
		return { draft: { ...draft, journeys: [...draft.journeys, journey] }, anchor: `journey:${journey.id}` };
	}
	if (id && draft.components.some((c) => c.id === id)) return { draft, anchor: `component:${id}` };
	const component = createComponent({ ...withId(id), name: NEW_NAME.component });
	return { draft: { ...draft, components: [...draft.components, component] }, anchor: `component:${component.id}` };
}

export function addToArchitecture(draft: ProjectArchitectureDraft, kind: 'stack' | 'constraint', id?: string): { draft: ProjectArchitectureDraft; anchor: string } {
	if (kind === 'stack') {
		if (id && draft.techChoices.some((t) => t.id === id)) return { draft, anchor: `stack:${id}` };
		const tech = createTechChoice('backend', { ...withId(id), name: NEW_NAME.stack });
		return { draft: { ...draft, techChoices: [...draft.techChoices, tech] }, anchor: `stack:${tech.id}` };
	}
	if (id && draft.constraints.some((c) => c.id === id)) return { draft, anchor: `constraint:${id}` };
	const constraint = createConstraint({ ...withId(id), title: NEW_NAME.constraint });
	return { draft: { ...draft, constraints: [...draft.constraints, constraint] }, anchor: `constraint:${constraint.id}` };
}

export function addToGlossary(draft: ProjectGlossaryDraft, id?: string): { draft: ProjectGlossaryDraft; anchor: string } {
	if (id && draft.terms.some((t) => t.id === id)) return { draft, anchor: `term:${id}` };
	const term = createTerm({ ...withId(id), term: NEW_NAME.term });
	return { draft: { ...draft, terms: [...draft.terms, term] }, anchor: `term:${term.id}` };
}

/**
 * The behavior operations that add an action to a feature: on the surface its actions already live on, else on a
 * new surface named after the feature. An action carries at least one rule (the engine refuses one without): a new
 * one says it is allowed, unconditionally, until the reader writes its rules.
 */
export function newActionOps(surfaceId: string | null, featureName: string): Record<string, unknown>[] {
	const surface = surfaceId ? { surfaceId } : { surfaceRef: 'surface' };
	return [
		...(surfaceId ? [] : [{ kind: 'add_surface', ref: 'surface', name: featureName || 'Feature', type: 'screen', description: `Where ${featureName || 'the feature'} is used.` }]),
		{ kind: 'add_action', ref: 'action', ...surface, name: NEW_NAME.action, intent: '' },
		{ kind: 'add_action_rule', ...surface, actionRef: 'action', rule: { category: 'permissions', description: 'Allowed to anyone who reaches it, until its rules are written.', effect: { type: 'allow_action', description: 'The action is allowed.' } } }
	];
}
