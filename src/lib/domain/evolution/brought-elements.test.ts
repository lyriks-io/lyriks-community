import { describe, expect, it } from 'vitest';
import { broughtKeys } from './brought-elements';
import { deriveImplementationReport } from './report-derivation';
import { reportSummary } from './implementation';

/**
 * Criterion 28d5a69c: a line is the request's only when its drafts bring or
 * change the element; a direct change made to a touched feature after the
 * first freeze is the feature's own and reads inherited.
 */
const action = (id: string, rules: { id: string; description: string }[], extra: Record<string, unknown> = {}) => ({
	id,
	name: id,
	rules,
	transitions: [],
	emittedEvents: [],
	scenarios: [],
	...extra
});
const feature = (actions: object[], states: object[] = []) => ({ surfaces: [{ id: 's1', name: 'Stages', stateDefinitions: states, rules: [], invariants: [], actions }] });

// The feature as it stands: what it held at the freeze, plus a direct change made since (state, action and rule).
const direct = { state: { id: 'st-readable', path: 'specification.actionsReadable' }, action: action('42b50a43', [{ id: '9d290950', description: 'The freeze waits for readable actions.' }]) };
const stands = feature([action('a-freeze', [{ id: 'r-held', description: 'Held at the freeze.' }]), direct.action], [direct.state]);
// The feature the request's draft would make: one rule added to an action it already had, its scenario changed.
const drafted = feature(
	[
		action('a-freeze', [{ id: 'r-held', description: 'Held at the freeze.' }, { id: 'r-new', description: 'Brought by the request.' }], { scenarios: [{ id: 'sc', name: 'Freezes' }] }),
		direct.action
	],
	[direct.state]
);

describe('a line is the request\'s only when its drafts bring or change the element [criterion:28d5a69c]', () => {
	it('reads what the draft adds or changes, never what a direct change put in the feature since', () => {
		const brought = broughtKeys(drafted, stands, ['crit-added']);
		expect([...brought].sort()).toEqual(['action:a-freeze', 'criterion:crit-added', 'rule:r-new']);
	});

	it('reads the direct change after the freeze as inherited, so it never holds the report open', () => {
		const located = (entityType: string, entityId: string) => ({ entityType, entityId, entityName: entityId, locations: [{ file: 'src/stages.ts', line: 3, snippet: 'x' }] });
		const row = (actionId: string, entities: ReturnType<typeof located>[]) => ({ actionId, actionName: actionId, surfaceId: 's1', surfaceName: 'Stages', expectedEntities: entities, foundEntities: entities });
		const status = {
			actions: [
				row('a-freeze', [located('action', 'a-freeze'), located('rule', 'r-held'), located('rule', 'r-new')]),
				row('42b50a43', [located('action', '42b50a43'), located('rule', '9d290950')])
			],
			surfaces: [{ surfaceId: 's1', surfaceName: 'Stages', expectedEntities: [located('state', 'st-readable')], foundEntities: [located('state', 'st-readable')] }]
		};
		const lines = deriveImplementationReport({
			request: { id: 'evo-3', iteration: 1, specVersion: 1, leafIds: ['feat-31'] },
			statuses: { 'feat-31': status as never },
			neighbours: {},
			leafNames: { 'feat-31': 'Move a change through its stages' },
			// The baseline photographed at the freeze, before the direct change.
			baseline: new Set(['surface:s1', 'action:a-freeze', 'rule:r-held']),
			brought: { 'feat-31': broughtKeys(drafted, stands) }
		});
		const scopeOf = (suffix: string) => lines.find((l) => l.requirement.endsWith(suffix))?.scope;
		expect(scopeOf('rule "r-new"')).toBe('request');
		expect(scopeOf('action "a-freeze"')).toBe('request');
		for (const suffix of ['action "42b50a43"', 'rule "9d290950"', 'state "st-readable"', 'rule "r-held"']) expect(scopeOf(suffix)).toBe('inherited');
		expect(reportSummary(1, lines)).toMatch(/^Report for version 1: 2 lines of this request: 0 conform, 0 to build, 2 found, not tested yet\. 4 inherited lines/);
	});

	it('reads a text criterion the draft adds as the request\'s, under the id its report line carries', () => {
		const textCriterion = 'e5ba6571-f7b3-44e0-af63-03c41cfcf461';
		const brought = broughtKeys(stands, stands, [textCriterion, 'c0a6eef3']);
		expect(brought.has(`criterion:ac-leaf-${textCriterion}`)).toBe(true);
		// A behaviour criterion keeps its own key, and gains no ac-leaf- twin.
		expect(brought.has('criterion:c0a6eef3')).toBe(true);
		expect(brought.has('criterion:ac-leaf-c0a6eef3')).toBe(false);

		const lines = deriveImplementationReport({
			request: { id: 'evo-10', iteration: 1, specVersion: 1, leafIds: ['feat-41'] },
			statuses: {
				'feat-41': { actions: [], surfaces: [], criteria: [{ criterionId: `ac-leaf-${textCriterion}`, title: 'Confirm password', state: 'failing' }] } as never
			},
			neighbours: {},
			leafNames: { 'feat-41': 'Create an account' },
			baseline: new Set<string>(),
			brought: { 'feat-41': brought }
		});
		const line = lines.find((l) => l.requirement.endsWith('criterion "Confirm password"'));
		expect(line?.scope).toBe('request');
		// A failing criterion the request brought holds the report open.
		expect(line?.verdict).toBe('non_conform');
	});

	it('keeps the reference taken at the freeze where the drafts cannot be read', () => {
		const lines = deriveImplementationReport({
			request: { id: 'evo-3', iteration: 1, specVersion: 1, leafIds: ['feat-31'] },
			statuses: { 'feat-31': { actions: [{ actionId: 'a-new', actionName: 'a-new', expectedEntities: [{ entityType: 'action', entityId: 'a-new' }] }] } as never },
			neighbours: {},
			leafNames: {},
			baseline: new Set(['action:a-held']),
			brought: { 'feat-31': null }
		});
		expect(lines[0].scope).toBe('request');
	});
});
