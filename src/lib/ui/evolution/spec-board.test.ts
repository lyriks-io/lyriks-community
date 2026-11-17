import { describe, expect, it } from 'vitest';
import { featureFigures, specChecklist, specWritten } from './spec-board';

const node = (id: string, kind: string, parentId: string | null, status = 'added') =>
	({ id, kind, label: id, status, parentId, folded: false, featureId: null, variant: null }) as never;

describe('the Specification tab', () => {
	it('counts the actions and rules under a touched feature, a draft named with or without its prefix', () => {
		const graph = {
			nodes: [
				node('feature:d1', 'feature', null),
				node('s1', 'surface', 'feature:d1'),
				node('a1', 'action', 's1'),
				node('r1', 'rule', 'a1'),
				node('r2', 'rule', 'a1', 'existing'),
				node('a9', 'action', 'elsewhere')
			],
			counts: {} as never
		};
		expect(featureFigures(graph, ['draft:d1'])).toEqual({ actions: 1, rules: 2, moved: 2 });
		expect(featureFigures(null, ['d1'])).toEqual({ actions: 0, rules: 0, moved: 0 });
	});

	it('ticks each line from what the request holds, never from a timer', () => {
		const empty = {
			descriptionsWritten: 0,
			questionsAsked: 0,
			questionsOpen: 0,
			features: 0,
			featuresAdded: 0,
			featuresAddedModelled: 0,
			flows: 0,
			functionalNotApplicable: false,
			dataChanges: 0,
			technicalSettled: false,
			aiRead: true
		};
		expect(specChecklist(empty).map((l) => l.done)).toEqual([true, true, false, false, false, false]);
		const written = specChecklist({
			descriptionsWritten: 3,
			questionsAsked: 2,
			questionsOpen: 1,
			features: 2,
			featuresAdded: 1,
			featuresAddedModelled: 1,
			flows: 3,
			functionalNotApplicable: false,
			dataChanges: 0,
			technicalSettled: true,
			aiRead: false
		});
		expect(written.map((l) => l.done)).toEqual([true, false, true, true, true, true]);
		expect(written[1].note).toBe('1 answered, 1 open');
		expect(written[5].note).toBe('no table changes');
	});

	it('ticks nothing before the AI read the request, whatever people wrote before it came', () => {
		const typedByHand = {
			descriptionsWritten: 3,
			questionsAsked: 0,
			questionsOpen: 0,
			features: 0,
			featuresAdded: 0,
			featuresAddedModelled: 0,
			flows: 2,
			functionalNotApplicable: false,
			dataChanges: 0,
			technicalSettled: true
		};
		expect(specChecklist({ ...typedByHand, aiRead: false }).every((l) => !l.done)).toBe(true);
		expect(specChecklist({ ...typedByHand, aiRead: true }).map((l) => l.done)).toEqual([true, true, false, false, true, true]);
	});

	it('waits for the AI until the request names a touched feature or a table change', () => {
		expect(specWritten({ features: 0, dataChanges: 0 })).toBe(false);
		expect(specWritten({ features: 1, dataChanges: 0 })).toBe(true);
		expect(specWritten({ features: 0, dataChanges: 2 })).toBe(true);
	});
});
