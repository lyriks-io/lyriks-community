import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type ImplementationFinding } from './draft';
import { awaitingCodeCount, awaitingPersonCount, undecidedCount, waitsOnCode } from './implementation';
import { DATA_CHANGE_PREFIX } from './report-requirement';

/**
 * The lines of a Build report that hold it open wait either for the code or a
 * passing test, which close them at the next index sync, or for a person
 * (feat-25 f27ab2f8, 127dba2b): what the coaching asks a person to decide is
 * only the second kind (criterion 4913a449).
 */
let n = 0;
const line = (over: Partial<ImplementationFinding>): ImplementationFinding => ({
	id: `l${++n}`,
	iteration: 1,
	verdict: 'missing',
	requirement: 'Checkout › Pay › action',
	filePath: '',
	lineRange: '',
	specStatement: '',
	codeStatement: '',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
}) as ImplementationFinding;

describe('a report line waits for the code or for a person [criterion:4913a449]', () => {
	const lines = [
		line({ verdict: 'missing' }),
		line({ verdict: 'non_conform', codeStatement: 'Found in the code, but no test of it has passed yet.' }),
		line({ verdict: 'non_conform', codeStatement: 'Its last result failed.' }),
		line({ verdict: 'missing', requirement: `${DATA_CHANGE_PREFIX} Order.note` }),
		line({ verdict: 'out_of_scope', hasRequirementAnchor: false }),
		line({ verdict: 'regression', anchorForeignLeaf: true }),
		line({ verdict: 'conform', acceptanceTestPassing: true }),
		line({ verdict: 'missing', scope: 'inherited' }),
		line({ verdict: 'missing', decision: 'validated' })
	];
	const request = { ...createEvolutionRequest({ stage: 'implementation', specVersion: 1, frozen: true }), iteration: 1, implementationFindings: lines };

	it('counts apart what a test closes and what a person settles, the two adding up to the lines that hold the report open', () => {
		expect(lines.map(waitsOnCode)).toEqual([true, true, true, false, false, false, false, false, false]);
		expect(awaitingCodeCount(request)).toBe(3);
		expect(awaitingPersonCount(request)).toBe(3);
		expect(awaitingCodeCount(request) + awaitingPersonCount(request)).toBe(undecidedCount(request));
	});
});
