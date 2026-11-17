import { describe, expect, it } from 'vitest';
import { scenarioFixtures, scenarioTitleToken, testKitFiles } from './test-kit';

/**
 * The tests of a frozen version, taken home (ac-evo-impl-test-kit, -runner):
 * every scenario a runnable test named with its token, every criterion a todo
 * named with its token, one adapter to write.
 */

const feature = {
	id: 'feat-order',
	name: 'Order online',
	surfaces: [
		{
			id: 's1',
			name: 'Basket',
			stateDefinitions: [
				{ path: 'order.itemCount', defaultValue: 0 },
				{ path: 'slot.orderCount', defaultValue: 0 }
			],
			actions: [
				{
					id: 'a1',
					name: 'Place the order',
					parameters: [{ name: 'slot' }],
					scenarios: [
						{
							id: 'sc1',
							name: 'A full slot refuses',
							stateOverrides: [{ path: 'slot.orderCount', value: 20 }],
							parameterOverrides: [{ parameterName: 'slot', value: '8:30' }, { parameterName: 'undeclared', value: 1 }],
							expectedStatus: 'blocked',
							expectedAssertions: [{ path: 'slot.orderCount', operator: 'equals', value: 20 }]
						}
					]
				}
			]
		}
	]
};

describe('the scenarios of a version, as fixtures', () => {
	it('starts from the scenario state over the surface defaults, nested, with declared parameters only', () => {
		const [fixture] = scenarioFixtures(feature);
		expect(fixture).toMatchObject({
			titleToken: '[unspa:s1:a1:sc1]',
			initialState: { order: { itemCount: 0 }, slot: { orderCount: 20 } },
			parameters: { slot: '8:30' },
			expectedStatus: 'blocked'
		});
	});

	it('never mints a token the result tools would read back as other ids', () => {
		expect(scenarioTitleToken('s1', 'a:1', 'sc1')).toBeNull();
	});
});

describe('the archive, written for the runner the repository uses', () => {
	const input = {
		requestTitle: 'Twenty orders per slot',
		specVersion: 1,
		features: [{ id: 'draft:x1', name: 'Order online', snapshot: feature, criteria: [{ id: 'ac-leaf-c1', text: 'The 21st order is refused.' }] }]
	};

	it('names each scenario test with its token and each criterion as a todo with its token', () => {
		const files = testKitFiles({ ...input, runner: 'vitest' });
		expect(Object.keys(files).sort()).toEqual(
			['README.md', 'adapter.ts', 'draft-x1.criteria.test.ts', 'draft-x1.scenarios.test.ts', 'fixtures/draft-x1.ts', 'lyriks-checks.ts'].sort()
		);
		expect(files['fixtures/draft-x1.ts']).toContain('"titleToken": "[unspa:s1:a1:sc1]"');
		expect(files['draft-x1.scenarios.test.ts']).toContain('it(`${fixture.titleToken} ${fixture.actionName}: ${fixture.scenarioName}`');
		expect(files['draft-x1.criteria.test.ts']).toContain('it.todo("[criterion:ac-leaf-c1] The 21st order is refused.");');
		expect(files['README.md']).toContain('npx vitest run --reporter=json --outputFile=test-report.json');
	});

	it('brings its own JSON report for the Node runner, which writes none the tools read', () => {
		const files = testKitFiles({ ...input, runner: 'node' });
		expect(files['lyriks-report.mjs']).toContain("'--test-reporter=tap'");
		expect(files['draft-x1.scenarios.test.mjs']).toContain("import { describe, it } from 'node:test';");
		expect(files['README.md']).toContain('node lyriks-report.mjs');
	});
});
