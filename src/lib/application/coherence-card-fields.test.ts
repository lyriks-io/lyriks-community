import { describe, expect, it, vi } from 'vitest';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyExperienceDraft } from '$domain/experience';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import {
	createEmptyDefinitionDraft,
	createEmptyIdentityDraft,
	createEmptyOperationsDraft
} from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEmptyRulesDraft, createIssue } from '$domain/rules';
import { createEmptyUsersDraft } from '$domain/users';
import { LOCAL_CHECK_IDS, createEmptyCoherenceDraft, settleGap, type CoherenceAnalysis } from '$domain/coherence';
import { LocalGlobalCoherenceChecker } from './local-global-coherence-checker';
import { DecisionAwareCoherenceChecker } from './decision-aware-coherence-checker';

const loader = <T>(value: T) => ({ execute: vi.fn(async () => value) });

function localChecker(opts: { features?: ReturnType<typeof createEmptyFeaturesDraft>; rules?: ReturnType<typeof createEmptyRulesDraft> } = {}) {
	const foundation = {
		loadIdentity: vi.fn(async () => createEmptyIdentityDraft('p')),
		loadDefinition: vi.fn(async () => createEmptyDefinitionDraft('p')),
		loadOperations: vi.fn(async () => createEmptyOperationsDraft('p'))
	};
	return new LocalGlobalCoherenceChecker(
		foundation as never,
		loader(createEmptyUsersDraft('p')) as never,
		loader(opts.features ?? createEmptyFeaturesDraft('p')) as never,
		loader(createEmptyExperienceDraft('p')) as never,
		loader(opts.rules ?? createEmptyRulesDraft('p')) as never,
		loader(createEmptyDataDraft('p')) as never,
		loader(createEmptyArchitectureDraft('p')) as never,
		loader(createEmptyGlossaryDraft('p')) as never,
		{ loadFeature: vi.fn(async () => ({})) } as never,
		{ score: () => 90 } as never
	);
}

describe('what the local checker puts on a card', () => {
	it('reports every local check as run, and names the check behind each gap', async () => {
		const analysis = await localChecker().analyze('p');
		expect(analysis.checksRun).toEqual([...LOCAL_CHECK_IDS]);
		for (const g of analysis.gaps) expect(g.checkId, g.id).toBeTruthy();
	});

	it('marks a hand-written issue as declared with its precise kind, its feature and a verb; a scanned one as detected', async () => {
		const features = createEmptyFeaturesDraft('p');
		features.cores = [createCore({ id: 'core-ui', name: 'UI' })];
		features.features = [createFeature('core-ui', null, { id: 'feat-dark', name: 'Dark theme' })];
		const rules = createEmptyRulesDraft('p');
		rules.issues = [
			createIssue({
				id: 'i-rail',
				kind: 'missing_rule',
				title: 'The navigation rail is already dark',
				detail: 'why',
				severity: 'major',
				status: 'open',
				relatedFeatureId: 'feat-dark'
			}),
			createIssue({
				id: 'i-scan',
				kind: 'contradiction',
				title: 'Two rules disagree',
				severity: 'major',
				status: 'in_review',
				autoDetected: true
			})
		];
		const analysis = await localChecker({ features, rules }).analyze('p');
		const rail = analysis.gaps.find((g) => g.id.endsWith('-i-rail'))!;
		expect(rail).toMatchObject({
			checkId: 'rules.open-issues',
			kind: 'missing',
			kindLabel: 'Missing rule',
			provenance: 'declared',
			subject: 'Dark theme',
			action: 'Decide the rule and add it to the inventory.',
			featureRef: 'feat-dark'
		});
		const scan = analysis.gaps.find((g) => g.id.endsWith('-i-scan'))!;
		expect(scan).toMatchObject({
			kind: 'misalignment',
			kindLabel: 'Contradiction',
			provenance: 'detected',
			action: 'Review the decision recorded in its detail, then resolve it or accept the risk.'
		});
	});

	it('names the unreachable feature first in the permission gap', async () => {
		const features = createEmptyFeaturesDraft('p');
		features.cores = [createCore({ id: 'core-ui', name: 'UI' })];
		features.features = [createFeature('core-ui', null, { id: 'feat-dark', name: 'Dark theme' })];
		const analysis = await localChecker({ features }).analyze('p');
		const perm = analysis.gaps.find((g) => g.id === 'gap-users-coverage')!;
		expect(perm.title).toMatch(/^Dark theme has no user right/);
		expect(perm).toMatchObject({ subject: 'Dark theme', kindLabel: 'Feature with no user right', provenance: 'detected' });
		expect(perm.action).toMatch(/^Grant it to at least one role/);
	});
});

describe('the decision-aware checker', () => {
	const base: CoherenceAnalysis = {
		dimensions: [{ key: 'data', label: 'Data', sourceStep: 'data', score: 80, summary: '' }],
		gaps: [
			{ id: 'g1', severity: 'medium', title: 'G1', detail: '', sourceStep: 'data', blocking: false },
			{ id: 'g2', severity: 'high', title: 'G2', detail: '', sourceStep: 'data', blocking: true }
		],
		readinessScore: 40
	};
	const inner = { analyze: vi.fn(async () => base) };
	const clock = { nowIso: () => '2026-09-03T12:00:00.000Z' };

	it('applies the standing decisions and records a dated point, without failing the read when the store does', async () => {
		const draft = settleGap(
			createEmptyCoherenceDraft('p'),
			{ gapId: 'g1', gapTitle: 'G1', status: 'accepted_risk', reason: 'fine', author: { id: 'me', kind: 'person' } },
			'd1',
			'2026-09-03T11:00:00.000Z'
		);
		const saved: unknown[] = [];
		const history = {
			load: vi.fn(async () => null),
			save: vi.fn(async (_p: string, h: unknown) => {
				saved.push(h);
			})
		};
		const checker = new DecisionAwareCoherenceChecker(inner, { load: async () => draft }, history, clock);
		const analysis = await checker.analyze('p');
		expect(analysis.gaps.map((g) => g.id)).toEqual(['g2']);
		expect(analysis.settled?.map((s) => s.gap.id)).toEqual(['g1']);
		await vi.waitFor(() => expect(history.save).toHaveBeenCalled());
		expect(saved[0]).toMatchObject({ points: [{ at: '2026-09-03T12:00:00.000Z', open: 1, blocking: 1, readiness: 40 }] });

		const failing = { load: vi.fn(async () => { throw new Error('db down'); }), save: vi.fn() };
		const errors: unknown[] = [];
		const c2 = new DecisionAwareCoherenceChecker(inner, { load: async () => null }, failing, clock, (e) => errors.push(e));
		expect((await c2.analyze('p')).gaps).toHaveLength(2);
		await vi.waitFor(() => expect(errors).toHaveLength(1));
	});
});
