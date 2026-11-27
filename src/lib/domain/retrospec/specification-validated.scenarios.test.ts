import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, emptyRetrospecDocument, SPEC360_TAB, type PersonRef, type RetrospecAct, type SpecElement } from '.';
import { specState, specValidationBoard } from './spec-validation';

/**
 * "Record that the specification was validated" (action 1756368e of the screen
 * Validation of a draft specification): the definitive validation is another
 * feature's act, the run's publication; this screen only reads where the
 * specification stands from the stored document.
 */

const NOW = '2026-11-20T09:00:00.000Z';
const lead: PersonRef = { id: 'lead@company.test', name: 'Lead' };
const elements: SpecElement[] = [{ id: 'feature:refunds', title: 'Refunds' }];

function apply(acts: RetrospecAct[]) {
	const outcome = applyRetrospecActs(emptyRetrospecDocument(), acts, { actor: lead, now: NOW });
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
}

describe('Record that the specification was validated (1756368e)', () => {
	it('The definitive validation is recorded [unspa:2e49df91:1756368e:f5794103]', () => {
		const reviewed: RetrospecAct[] = [{ op: 'start_review', total: 1 }, { op: 'validate', itemId: 'feature:refunds', title: 'Refunds', tab: SPEC360_TAB }];
		const draft = apply(reviewed);
		expect(specState(draft)).toBe('draft');
		// specification.validated: the run is published once every element is validated.
		const validated = apply([...reviewed, { op: 'publish', baselineId: 'baseline-1', notify: [] }]);
		expect(specState(validated)).toBe('validated');
		expect(specValidationBoard({ doc: validated, elements, team: [], viewer: lead, baselines: [] }).summary.state).toBe('validated');
	});
});
