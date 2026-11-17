import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyUsersDraft } from '$domain/users';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyFeaturesDraft } from '$domain/features';
import { glanceView } from '$application/spec360/glance';
import { specOutline } from '$application/spec360/outline';
import { editDefinition, editShapeOf } from '$application/spec360/edits';
import { resultsOf } from './results';

const outcomes = [{ label: 'Time to invoice', from: '15 min', to: '2 min' }];

describe('the target card reads its results, each with its values when the spec gives them [criterion:416e4885]', () => {
	it('keeps the values of a result the spec measures and names one it does not', () => {
		expect(resultsOf(['Time to invoice', ' Playable offline '], outcomes)).toEqual([
			{ label: 'Time to invoice', from: '15 min', to: '2 min' },
			{ label: 'Playable offline', from: '', to: '' }
		]);
		expect(resultsOf([' ', ''], outcomes)).toEqual([]);
	});

	it('edits the results as the target KPIs: a kept one keeps its values, a typed one is named with no value', () => {
		expect(editShapeOf('target')?.tags).toBe('Results');
		const draft = createEmptyDefinitionDraft('p1');
		draft.businessObjective.kpis = [
			{ name: 'Time to invoice', currentValue: 15, targetValue: 2, unit: 'min' },
			{ name: 'Gone', currentValue: null, targetValue: 1, unit: '' }
		];
		const next = editDefinition(draft, 'target', { text: 'Invoices go out the same day', tags: ['Time to invoice', 'Playable offline', 'Playable offline'] });
		expect(next?.businessObjective.expectedOutcome).toBe('Invoices go out the same day');
		expect(next?.businessObjective.kpis).toEqual([
			{ name: 'Time to invoice', currentValue: 15, targetValue: 2, unit: 'min' },
			{ name: 'Playable offline', currentValue: null, targetValue: null, unit: '' }
		]);
	});

	it('leaves the KPIs alone when only the text is edited', () => {
		const draft = createEmptyDefinitionDraft('p1');
		draft.businessObjective.kpis = [{ name: 'Time to invoice', currentValue: 15, targetValue: 2, unit: 'min' }];
		expect(editDefinition(draft, 'target', { text: 'Same day' })?.businessObjective.kpis).toEqual(draft.businessObjective.kpis);
	});
});

describe('the two cards read their lists whole and once [criterion:416e4885]', () => {
	const glance = (objective: Partial<ReturnType<typeof createEmptyDefinitionDraft>['businessObjective']>) => {
		const definition = createEmptyDefinitionDraft('p1');
		definition.businessObjective = { ...definition.businessObjective, ...objective };
		return glanceView({
			identity: createEmptyIdentityDraft('p1'),
			definition,
			users: createEmptyUsersDraft('p1'),
			outline: specOutline(createEmptyFeaturesDraft('p1')),
			architecture: createEmptyArchitectureDraft('p1'),
			counts: { features: 0, actions: 0, rules: 0, users: 0, entities: 0, terms: 0 }
		});
	};

	it('reads a result the spec names without a value, and a pain point held linked and plain once', () => {
		const view = glance({
			kpis: [{ name: 'Playable offline', currentValue: null, targetValue: null, unit: '' }],
			painPoints: ['Only reachable when the network is down'],
			painPointLinks: [{ id: 'l1', text: 'Only reachable when the network is down', personaIds: [] } as never]
		});
		expect(view.outcomes).toEqual([{ label: 'Playable offline', from: '', to: '' }]);
		expect(view.symptoms).toEqual(['Only reachable when the network is down']);
	});
});
