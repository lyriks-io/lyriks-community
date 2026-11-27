import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, emptyRetrospecDocument } from '$domain/retrospec';
import type { OperationsTargets } from '$application/spec360/operations-targets';
import { SpecValidation } from './validation.svelte';
import { TECH_TABS } from './spec-nav';
import { load } from '../../../routes/projects/[projectId]/spec/tech/health/+page.server';
import HealthPage from '../../../routes/projects/[projectId]/spec/noticed/+page.svelte';
import OperationsPage from '../../../routes/projects/[projectId]/spec/tech/operations/+page.svelte';

/** Health is the project's score and what weighs on it; Operations is where the product runs (criteria 4dadd4b8, 8a696e52). */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/p/spec/noticed') } }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => ({ active: false, available: true }) }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => ({ editing: null, notEditing: (ids: readonly string[]) => ids }) }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => null }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const started = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-18T02:00:00.000Z' });
if (!started.ok) throw new Error(started.reason);
const validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: true, doc: started.doc, elements: [{ id: 'product', title: 'Product' }], team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
const clean = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/ class="svelte-[a-z0-9]+"/g, '').replace(/ svelte-[a-z0-9]+/g, '');
const targets: OperationsTargets = {
	auditLogs: null,
	performance: { actions: [], latencyP95Ms: '', latencyP99Ms: '', ttiMs: '', bundleSizeKb: '', perfNotes: '' },
	availability: { availabilityPct: '', errorBudgetPct: '', notes: '' }
};

describe('Health opens on the project score, then every point that weighs on it [criterion:4dadd4b8]', () => {
	const health = () => clean(render(HealthPage, { props: { data: {
		projectId: 'p', canWrite: true, spec: { productName: 'Ledger' }, health: { score: 72, verdict: 'watch', proofPending: false }, healthReading: false,
		noticed: { waitsForFeature: false, total: 0, pending: 0, points: [], toConfirm: [], types: [] },
		session: { isAuthenticated: true }
	} } as never }).body);

	it('titles the page Health and draws the score above the points', () => {
		const html = health();
		expect(html).toMatch(/<h1[^>]*>Health<\/h1>/);
		const score = html.indexOf('72/100');
		expect(score).toBeGreaterThan(-1);
		expect(score).toBeLessThan(html.indexOf('Every point'));
	});

	it('reads the score as a reading of the project, with no discussion and no validation of its own', () => {
		const tile = clean(health()).match(/<div[^>]*id="kb-project-health"[^>]*>[\s\S]*?<\/p>\s*<\/div>/)?.[0] ?? '';
		expect(tile).toContain('72/100');
		expect(tile).not.toContain('data-evo-validate');
		expect(tile).not.toContain('Open the comments');
	});

	it('holds no Sign-offs any more: where the specification stops reads on the Overview (rule b995ffb1)', () => {
		const html = health();
		expect(html).not.toContain('id="sign-offs"');
		expect(html).not.toContain('Sign-offs');
	});
});

describe('Operations draws where the product runs, and holds no score of its own [criterion:8a696e52]', () => {
	const operations = () => clean(render(OperationsPage, { props: { data: {
		projectId: 'p', implementation: null, environments: { devices: [], machines: [] }, items: [], targets
	} } as never }).body);

	it('reads the environments, then the targets, then the code, without the project score', () => {
		const html = operations();
		expect(html).toContain('aria-label="Operations"');
		const order = ['>Environments<', '>Operations<', '>Implementation<'].map((t) => html.indexOf(t));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(html).not.toMatch(/\d+\/100/);
		expect(html).not.toContain('Project health');
	});
});

describe('the sections read one Health, and the view of Technology & data reads Operations [criterion:097c4079]', () => {
	it('names the view Operations and no view Health', () => {
		expect(TECH_TABS.map((t) => t.label)).toContain('Operations');
		expect(TECH_TABS.map((t) => t.label)).not.toContain('Health');
	});
});

describe('the old address of the view opens Operations [criterion:84162c34]', () => {
	it('sends the browser for good, keeping what the address asked', () => {
		expect(() => load({ params: { projectId: 'p 1' }, url: new URL('https://x.test/old?a=1') } as never)).toThrow(
			expect.objectContaining({ status: 308, location: '/projects/p%201/spec/tech/operations?a=1' })
		);
	});
});
