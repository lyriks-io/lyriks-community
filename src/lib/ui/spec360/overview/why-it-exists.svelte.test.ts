import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, emptyRetrospecDocument, type SpecElement } from '$domain/retrospec';
import { SpecValidation } from '$ui/spec360/validation.svelte';
import OverviewPage from '../../../../routes/projects/[projectId]/spec/+page.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => null }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', () => ({ getRuleVerdicts: () => null }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const elements: SpecElement[] = ['product', 'core:billing'].map((id) => ({ id, title: id }));
const mode = { active: false, available: true };
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, value: object) => value,
	current: (_anchor: string, value: object) => value,
	edited: () => false, gone: () => false, changed: () => false,
	shape: () => ({ text: true }), added: () => [], naming: () => false,
	notEditing: (ids: readonly string[]) => ids
};
// A draft the reader may write: the Edit mode turns the Overview into fields.
const started = () => {
	const result = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-17T02:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
};
let validation: SpecValidation;

const clean = (html: string) => html.replace(/<!--.*?-->/g, '');
const overview = (why: { problem: string; target: string }) => clean(render(OverviewPage, { props: { data: {
	projectId: 'p', canWrite: true, spec: { productName: 'Ledger' }, reach: {},
	glance: { brief: 'A ledger.', pitch: 'A ledger.', classification: null, meta: [], problem: why.problem, symptoms: [], target: why.target, outcomes: [],
		users: [], cores: [{ id: 'billing', name: 'Billing', description: 'Collect payments.', features: 1 }], health: null, healthReading: false },
	noticed: { waitsForFeature: false, total: 0, pending: 0, major: 0, minor: 0, settled: 0, types: [] }
} } as never }).body);
const nothingWritten = { problem: '', target: '' };

beforeEach(() => {
	mode.active = false;
	validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: true, doc: started(), elements, team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
});

describe('Why it exists is started from the Overview [criterion:0bd4f393] [criterion:ec2b4807]', () => {
	it('is left out while nothing is written, outside the Edit mode', () => {
		expect(overview(nothingWritten)).not.toContain('Why it exists');
	});

	it('shows its two empty cards as fields in the Edit mode, with no validation nor comments on them', () => {
		mode.active = true;
		const html = overview(nothingWritten);
		expect(html).toContain('Why it exists');
		expect(html).toContain('aria-label="The problem"');
		expect(html).toContain('aria-label="The target"');
		expect(html).toContain('What gap does the product close?');
		expect(html).toContain('What must the product achieve?');
		const why = html.slice(html.indexOf('id="kb-why"'), html.indexOf('id="kb-what"'));
		expect(why).not.toContain('data-card-marks');
	});

	it('keeps the controls of the card that holds a text, and leaves the empty one without', () => {
		mode.active = true;
		const html = overview({ problem: 'Slow refunds.', target: '' });
		const why = html.slice(html.indexOf('id="kb-why"'), html.indexOf('id="kb-what"'));
		const problem = why.slice(why.indexOf('aria-label="The problem"'), why.indexOf('aria-label="The target"'));
		const target = why.slice(why.indexOf('aria-label="The target"'));
		expect(problem).toContain('data-card-marks');
		expect(target).not.toContain('data-card-marks');
		expect(target).toContain('What must the product achieve?');
	});
});
