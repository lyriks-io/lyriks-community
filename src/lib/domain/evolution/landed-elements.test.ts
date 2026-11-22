import { describe, expect, it } from 'vitest';
import {
	carriesElement,
	createEvolutionRequest,
	deriveImplementationReport,
	elementProved,
	knowledgeReadingOf,
	landedLines,
	linesOfElement,
	type ImplementationFinding
} from './index';

/**
 * What a landing reads of the Verification report, element of Knowledge by
 * element (EVO-002): which lines each element stands on, and whether the code
 * proved it all the way.
 */

const F = 'feat-cart';
const line = (over: Partial<ImplementationFinding>): ImplementationFinding => ({
	id: `line-${over.key ?? over.requirement}`,
	iteration: 1,
	verdict: 'conform',
	requirement: 'Cart › Add a product › rule "No more than ten"',
	filePath: 'src/cart.ts',
	lineRange: '12',
	specStatement: '',
	codeStatement: '',
	leafId: F,
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: true,
	specVersion: 1,
	scope: 'request',
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
});

const report = [
	line({ key: 'action:a1' }),
	line({ key: 'rule:r1', owner: 'action:a1' }),
	line({ key: 'transition:t1', owner: 'action:a1' }),
	line({ key: 'action:a2' }),
	line({ key: 'rule:r2', owner: 'action:a2', verdict: 'missing', acceptanceTestPassing: false }),
	line({ key: 'criterion:c1' }),
	line({ key: 'state:cart.count', owner: 'surface:s1' })
];

describe('the lines an element of Knowledge stands on', () => {
	it('gives an action its own line and what it holds but its rules, each rule its own line', () => {
		expect(linesOfElement(report, `action:${F}:a1`).map((l) => l.key)).toEqual(['action:a1', 'transition:t1']);
		expect(linesOfElement(report, `rule:${F}:r2`).map((l) => l.key)).toEqual(['rule:r2']);
	});

	it('gives the feature its criteria and its screen, the journey of its actions every action line', () => {
		expect(linesOfElement(report, `feature:${F}`).map((l) => l.key)).toEqual(['criterion:c1', 'state:cart.count']);
		expect(linesOfElement(report, `flow:${F}`).map((l) => l.key)).toEqual(['action:a1', 'transition:t1', 'action:a2']);
	});

	it('lets a line no element can claim hold every element of its feature', () => {
		const old = line({ key: undefined, verdict: 'missing' });
		expect(elementProved([...report, old], `action:${F}:a1`)).toBe(false);
	});
});

describe('which elements a landing validates', () => {
	it('validates an element whose lines are all conform, or decided validated or adopted [criterion:ac-leaf-0bb4e4b0-990c-4213-abc8-16f8aaaf0e91]', () => {
		expect(elementProved(report, `action:${F}:a1`)).toBe(true);
		expect(elementProved(report, `rule:${F}:r1`)).toBe(true);
		const decided = report.map((l) => (l.key === 'rule:r2' ? { ...l, decision: 'validated' as const } : l));
		expect(elementProved(decided, `rule:${F}:r2`)).toBe(true);
		const adopted = [...report, line({ key: 'extra:cart-limit', owner: 'action:a1', verdict: 'out_of_scope', decision: 'adopted' })];
		expect(elementProved(adopted, `action:${F}:a1`)).toBe(true);
	});

	it('validates at the landing an element that holds nothing for the code [criterion:ac-leaf-250e97b9-1f5e-4bcb-acbf-8e554c702d05]', () => {
		expect(elementProved(report, 'term:t-cart')).toBe(true);
		expect(elementProved(report, 'product')).toBe(true);
		expect(elementProved(report, 'rule:project:inv-1')).toBe(true);
		// An element of the Features pages holds code: without a line nothing proves it.
		expect(elementProved([], `action:${F}:a9`)).toBe(false);
	});

	it('leaves to review an element with a line missing, invalidated or out of scope [criterion:ac-leaf-1a2fbae2-189c-4c4f-9a51-514dd84634ab]', () => {
		expect(elementProved(report, `rule:${F}:r2`)).toBe(false);
		const invalidated = report.map((l) => (l.key === 'action:a1' ? { ...l, decision: 'invalidated' as const } : l));
		expect(elementProved(invalidated, `action:${F}:a1`)).toBe(false);
		const outOfScope = [...report, line({ key: 'extra:cart-limit', owner: 'action:a1', verdict: 'out_of_scope' })];
		expect(elementProved(outOfScope, `action:${F}:a1`)).toBe(false);
		const data = [line({ id: 'data-line:d1', key: undefined, leafId: undefined, requirement: 'Data change: adds table "Cart"', verdict: 'missing' })];
		expect(elementProved(data, 'datamap')).toBe(false);
	});

	it('reads only the elements the request carries a change to', () => {
		const request = createEvolutionRequest({ title: 'Cart limit', drafts: [{ id: 'draft:1', kind: 'amend', baseLeafId: F, materialisedAs: null }] as never });
		expect(carriesElement(request, `rule:${F}:r1`)).toBe(true);
		expect(carriesElement(request, 'rule:feat-other:r1')).toBe(false);
		expect(carriesElement(request, 'term:t-cart')).toBe(false);
		expect(carriesElement({ ...request, sectionDrafts: [{ page: 'glossary' }] as never }, 'term:t-cart')).toBe(true);
	});

	it('reads the lines of a feature a draft added under the id the landing gave it', () => {
		const request = createEvolutionRequest({ title: 'Cart', drafts: [{ id: 'draft:new', kind: 'add', baseLeafId: null, materialisedAs: 'feat-new' }] as never });
		const lines = landedLines({ ...request, iteration: 1, implementationFindings: [line({ key: 'action:a1', leafId: 'draft:new' })] });
		expect(lines[0].leafId).toBe('feat-new');
	});
});

describe('the report lines name their element', () => {
	it('carries the engine key and the action or screen each line was read under', () => {
		const lines = deriveImplementationReport({
			request: { id: 'r', iteration: 1, specVersion: 1, leafIds: [F] },
			statuses: {
				[F]: {
					actions: [
						{
							actionId: 'a1',
							actionName: 'Add',
							expectedEntities: [{ entityType: 'rule', entityId: 'r1', entityName: 'No more than ten' }],
							foundEntities: [{ entityType: 'rule', entityId: 'r1', locations: [{ file: 'src/cart.ts', line: 3 }] }],
							extraTags: [{ tag: 'cart-limit' }]
						}
					],
					criteria: [{ criterionId: 'c1', title: 'Ten at most', state: 'verified' }]
				}
			},
			neighbours: {},
			leafNames: { [F]: 'Cart' }
		});
		expect(lines.map((l) => [l.key, l.owner ?? null]).sort()).toEqual([
			['criterion:c1', null],
			['extra:cart-limit', 'action:a1'],
			['rule:r1', 'action:a1']
		]);
	});
});

describe('what the success dialog reads of Knowledge', () => {
	it('counts what was validated and links to the first element that stays to review', () => {
		expect(knowledgeReadingOf('p 1', { at: 'now', validated: ['term:t'], toReview: [`rule:${F}:r2`, 'term:u'] })).toEqual({
			validated: 1,
			toReview: 2,
			specValidated: false,
			failure: null,
			reviewHref: `/projects/p%201/spec/features/${F}#kbt-rule_${F.replace(/-/g, '-')}_r2`
		});
		expect(knowledgeReadingOf('p', undefined)).toBeNull();
	});
});
