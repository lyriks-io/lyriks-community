import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { anchorDomId, anchorOf } from '$domain/discussions';
import { applyRetrospecActs, emptyRetrospecDocument, type SpecElement } from '$domain/retrospec';
import type { ActionRule, FeatureActionView } from '$application/spec360/features';
import { SpecValidation } from '$ui/spec360/validation.svelte';
import { RuleVerdictsStore } from '$ui/rules/rule-verdicts.svelte';
import ActionList from './ActionList.svelte';
import { disableBatch, disabledLine, menuChoice, refusedLine } from './disable-element';

/**
 * A disabled element on the page of its feature: in place, greyed, its badge
 * saying who disabled it, when and why; its rules still read as sentences; its
 * menu offers Disable or Enable to who may write the specification.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), invalidateAll: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/p/spec/features/validation'), state: {} } }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => ({ active: false, available: true }) }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => null }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', async (original) => ({ ...await original<object>(), getRuleVerdicts: () => new RuleVerdictsStore('p') }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, read: object) => read,
	current: (_anchor: string, read: object) => read,
	changed: () => false, shape: () => ({ desc: true }), added: () => [], gone: () => false, naming: () => false,
	notEditing: (ids: string[]) => ids
};
const marker = { by: 'Sam', at: '2026-11-18T10:00:00.000Z', reason: 'replaced by the batch validation' };
const viewerRule: ActionRule = { id: 'rule-viewer', text: 'When a viewer validates, the system shall refuse it.', kind: 'rule', category: 'permissions', blocks: true, disabled: marker };
const action = (over: Partial<FeatureActionView> = {}): FeatureActionView => ({
	id: 'validate', name: 'Validate an element', description: 'Validate one element.', who: [], rulesCount: '1 rule', refusalLead: null, rules: [viewerRule], ...over
});
let validation: SpecValidation;
const page = (actions: FeatureActionView[], canWrite = true) => {
	const started = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-18T02:00:00.000Z' });
	if (!started.ok) throw new Error(started.reason);
	const elements: SpecElement[] = actions.map((a) => ({ id: anchorOf('action', 'validation', a.id), title: a.name, owner: 'product' }));
	validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite, doc: started.doc, elements, team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
	return render(ActionList, { props: { featureId: 'validation', actions, actionData: {}, whole: true } }).body;
};

beforeEach(() => vi.clearAllMocks());

describe('a disabled element on the page of its feature', () => {
	it('reads in place, greyed, with a Disabled badge saying who, when and why [criterion:ac-leaf-c4071631-a445-435c-af46-f09907138a5e]', () => {
		const html = page([action({ disabled: marker })]);
		expect(html).toContain('data-disabled');
		expect(html).toContain('opacity-60');
		expect(html).toContain('Disabled');
		expect(html).toContain('by Sam on 18 Nov: replaced by the batch validation');
		expect(html.indexOf('Validate an element')).toBeGreaterThanOrEqual(0);
		expect(disabledLine(marker)).toBe('Disabled by Sam on 18 Nov: replaced by the batch validation');
	});

	it('keeps its rules as sentences, and its discussion open [criterion:ac-leaf-1344f0bf-61f6-4bec-b0a9-a381111357ac]', () => {
		const html = page([action({ disabled: marker })]);
		// The rule still reads as its requirement sentence, marked disabled beside it.
		expect(html).toContain('the system shall refuse it');
		expect(html.match(/data-disabled-badge/g)?.length).toBe(2);
		// Its comments stay reachable: the rule keeps its anchor and its Comments control.
		expect(html).toContain(`id="${anchorDomId(anchorOf('rule', 'validation', 'rule-viewer'))}"`);
		expect(html).toContain('aria-label="Comments"');
	});

	it('offers Disable to an editor, and Enable on a disabled element [criterion:ac-leaf-6579f7f4-9878-4a78-9d66-e1e1e15265b0]', () => {
		expect(page([action({ rules: [] })])).toContain('aria-label="More for Validate an element"');
		expect(menuChoice(null)).toBe('disable');
		expect(menuChoice(marker)).toBe('enable');
		expect(disableBatch({ projectId: 'p', featureId: 'validation', elementId: 'rule-viewer', choice: 'disable', reason: ' Testing ' })).toEqual({
			projectId: 'p', featureId: 'validation', operations: [{ kind: 'disable_element', elementId: 'rule-viewer', reason: 'Testing' }]
		});
		expect(disableBatch({ projectId: 'p', featureId: 'validation', elementId: 'rule-viewer', choice: 'enable' }).operations).toEqual([{ kind: 'enable_element', elementId: 'rule-viewer' }]);
	});

	it('offers nothing to a member who reads only [rule:e9b2247a] [rule:6914ad70]', () => {
		expect(page([action({ disabled: marker })], false)).not.toContain('More for');
	});

	it('says why a change was refused, followed by the reason the server gave', () => {
		expect(refusedLine('disable', 'This element is disabled already.')).toBe('The element was not disabled. This element is disabled already.');
		expect(refusedLine('enable', '')).toBe('The element was not enabled.');
	});
});
