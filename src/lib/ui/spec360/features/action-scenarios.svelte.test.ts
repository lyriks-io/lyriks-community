import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, emptyRetrospecDocument } from '$domain/retrospec';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyUsersDraft } from '$domain/users';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { featureStatements } from '$lib/unspa-schema/requirement-sentences';
import { featureView, type ScenarioRun } from '$application/spec360/features';
import { indexFeatureRules } from '$application/specification/index-feature-rules';
import { indexDisabledFeatures, indexFeatureActions, indexFeatureScenarios } from '$application/specification/index-feature-actions';
import { SpecValidation } from '$ui/spec360/validation.svelte';
import { RuleVerdictsStore } from '$ui/rules/rule-verdicts.svelte';
import ActionList from './ActionList.svelte';
import ScenarioList from './ScenarioList.svelte';
import { scenarioLine, scenarioTally } from './scenario-line';

/**
 * An action's scenarios on its feature's page, read from the real read model:
 * the kernel snapshot folded as a page loads it, the proof from what the
 * implementation index says proved each action against the code.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), invalidateAll: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/p/spec/features/f1'), state: {} } }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => ({ active: false, available: true }) }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => null }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', async (original) => ({ ...await original<object>(), getRuleVerdicts: () => verdicts }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, read: object) => read,
	current: (_anchor: string, read: object) => read,
	changed: () => false, shape: () => ({ desc: true }), added: () => [], gone: () => false, naming: () => false,
	notEditing: (ids: string[]) => ids
};
let validation: SpecValidation;
let verdicts: RuleVerdictsStore;
const marker = { by: 'Sam Rivera', at: '2026-11-20T10:00:00.000Z', reason: 'The sign-in is reworked' };

/** A feature: one action with three scenarios (one changed after its proof, one disabled), one with none. */
const feature = {
	id: 'f1',
	name: 'Validation',
	elementVersions: { 'scenario:sc-new': '2026-11-20T12:00:00.000Z', 'scenario:sc-editor': '2026-11-18T00:00:00.000Z' },
	surfaces: [
		{
			id: 's1',
			name: 'Element',
			stateDefinitions: [{ id: 'sd', path: 'session.role', type: 'string', defaultValue: 'editor' }],
			rules: [],
			invariants: [],
			actions: [
				{
					id: 'validate',
					name: 'Validate an element',
					intent: 'Validate it.',
					parameters: [],
					rules: [{ id: 'r-viewer', category: 'permissions', condition: { left: 'session.role', operator: 'equals', right: 'viewer' }, effect: { type: 'block_action', reason: 'forbidden' } }],
					effects: [],
					scenarios: [
						{ id: 'sc-editor', name: 'An editor validates', stateOverrides: [], parameterOverrides: [], expectedStatus: 'success' },
						{ id: 'sc-new', name: 'A viewer is refused', stateOverrides: [{ path: 'session.role', value: 'viewer' }], parameterOverrides: [], expectedStatus: 'blocked' },
						{ id: 'sc-off', name: 'Without sign-in a viewer validates', stateOverrides: [], parameterOverrides: [], expectedStatus: 'success', disabled: marker }
					]
				},
				{ id: 'read', name: 'Read an element', intent: 'Read it.', parameters: [], rules: [{ id: 'r-read', category: 'business', effect: { type: 'allow_action' } }], effects: [] }
			]
		}
	]
};
const snapshots = [{ featureId: 'f1', snapshot: { format: 'unspaghettit', version: 1, feature } as unknown as UnspaFeatureSnapshot }];
/**
 * The page's view of the feature, as its loader builds it: the action proven by a
 * run on 19 Nov, and each scenario's own result when the index kept them.
 */
const page = (scenarioResults?: Record<string, ScenarioRun>) =>
	featureView({
		core: { id: 'c1', name: 'Knowledge', description: '', features: [{ id: 'f1', name: 'Validation', description: '' }] },
		featureId: 'f1',
		features: createEmptyFeaturesDraft('p'),
		users: createEmptyUsersDraft('p'),
		actions: indexFeatureActions(snapshots),
		rules: indexFeatureRules(null, snapshots),
		disabledFeatures: indexDisabledFeatures(snapshots),
		scenarios: indexFeatureScenarios(snapshots),
		provenAt: { validate: '2026-11-19T00:00:00.000Z' },
		...(scenarioResults ? { scenarioResults: { validate: scenarioResults } } : {})
	});
const clean = (html: string) => html.replace(/<!--.*?-->/g, '');

beforeEach(() => {
	verdicts = new RuleVerdictsStore('p');
	const started = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-18T02:00:00.000Z' });
	if (!started.ok) throw new Error(started.reason);
	validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: true, doc: started.doc, elements: [], team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
});

describe("an action's scenarios on its feature's page", () => {
	it('read as one closed line, the proof in its count and the prover seal beside it, or No scenario yet [criterion:ac-leaf-2c64761b-08a5-4b07-994d-50c29ba04ee5]', () => {
		verdicts.features.set('f1', { featureId: 'f1', solver: 'ran', scope: null, rules: {}, actions: { validate: { kind: 'proven', label: 'Proven', tone: 'green', flaw: false } }, flaws: 0 } as never);
		const view = page();
		const html = clean(render(ActionList, { props: { featureId: 'f1', actions: view.actions, actionData: {} } }).body);
		// Two in force (the disabled one leaves the count): one proven, one changed after the proof.
		expect(html).toContain('2 scenarios · 1 proven against the code · 1 not proven yet');
		expect(html).toContain('No scenario yet');
		// Closed: no scenario is listed until the line is opened.
		expect(html).not.toContain('data-scenario=');
		expect(html).toMatch(/aria-controls="action-scenarios-validate"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-controls="action-scenarios-validate"/);
		// The seal the action carries reads on the line too.
		expect(html.match(/data-action-scenarios="validate"[\s\S]*?<\/div>/)?.[0]).toContain('Proven');
		expect(scenarioLine(scenarioTally([]))).toBe('No scenario yet');
		expect(scenarioLine({ total: 1, proven: 1, failing: 0, unproven: 0 })).toBe('1 scenario · 1 proven against the code');
	});

	it('opened, lists each scenario as Lyriks writes it from the model, with its proof and its menu; a disabled one greyed with its badge [criterion:ac-leaf-978057c9-7b28-4500-9d3c-475a790e1ae2]', () => {
		const scenarios = page().actions[0]!.scenarios!;
		const html = clean(render(ScenarioList, { props: { featureId: 'f1', scenarios } }).body);
		const statements = featureStatements(feature, 'en');
		for (const id of ['sc-editor', 'sc-new', 'sc-off']) expect(html).toContain(statements[`scenario:${id}`]!.split('\n')[0]!);
		expect(scenarios.map((s) => [s.id, s.proof])).toEqual([['sc-editor', 'proven'], ['sc-new', 'unproven'], ['sc-off', 'proven']]);
		expect(html).toContain('Proven against the code');
		expect(html).toContain('Not proven yet');
		expect(html).toContain('aria-label="More for An editor validates"');
		const off = html.slice(html.indexOf('data-scenario="sc-off"'));
		expect(off).toContain('opacity-60');
		expect(off).toContain('by Sam Rivera on 20 Nov: The sign-in is reworked');
	});

	it('reads a scenario whose last result failed as failing, in the closed line and in the list, apart from what nothing proves yet [criterion:d0f1688f] [criterion:ac-leaf-2c64761b-08a5-4b07-994d-50c29ba04ee5] [criterion:ac-leaf-978057c9-7b28-4500-9d3c-475a790e1ae2]', () => {
		// The index kept each scenario's own result: the editor's passed, the viewer's failed after its last change.
		const results = { 'sc-editor': { passed: true, at: '2026-11-19T00:00:00.000Z' }, 'sc-new': { passed: false, at: '2026-11-20T13:00:00.000Z' } };
		const view = page(results);
		expect(view.actions[0]!.scenarios!.map((s) => [s.id, s.proof])).toEqual([['sc-editor', 'proven'], ['sc-new', 'failing'], ['sc-off', 'unproven']]);
		const line = clean(render(ActionList, { props: { featureId: 'f1', actions: view.actions, actionData: {} } }).body);
		expect(line).toContain('2 scenarios · 1 proven against the code · 1 failing');
		expect(line).not.toContain('not proven yet');
		expect(line).not.toContain('data-scenario=');

		const list = clean(render(ScenarioList, { props: { featureId: 'f1', scenarios: view.actions[0]!.scenarios! } }).body);
		const failing = list.slice(list.indexOf('data-scenario="sc-new"'), list.indexOf('data-scenario="sc-off"'));
		expect(failing).toContain('data-proof="failing"');
		expect(failing).toContain('text-red-ink');
		expect(failing).toContain('Failing');

		// Once results are kept per scenario, one without a result is not proven yet, whatever verifiedAt says;
		// a pass older than the scenario's own version proves nothing either.
		const unrun = page({ 'sc-editor': { passed: true, at: '2026-11-17T00:00:00.000Z' } });
		expect(unrun.actions[0]!.scenarios!.map((s) => s.proof)).toEqual(['unproven', 'unproven', 'unproven']);
		expect(scenarioLine(scenarioTally(unrun.actions[0]!.scenarios!))).toBe('2 scenarios · 0 proven against the code · 2 not proven yet');
	});

	it('offers no menu to a member who reads only', () => {
		validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: false, doc: emptyRetrospecDocument(), elements: [], team: [], baselines: [] }));
		const html = render(ScenarioList, { props: { featureId: 'f1', scenarios: page().actions[0]!.scenarios! } }).body;
		expect(html).not.toContain('More for');
	});
});
