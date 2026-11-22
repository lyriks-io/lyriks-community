import { describe, expect, it } from 'vitest';
import type { FeatureAdvice, ScoreFeaturesUseCase } from '$application/use-cases';
import { FEATURE_ADVICE_SECTION } from '$lib/shared/section-sync';
import { BackgroundLane } from './background-lane.server';
import { CachedFeatureAdvisor } from './cached-feature-advisor.server';
import type { SnapshotStore } from './residue-snapshot-store.server';
import { publishSectionChange, subscribeSectionChanges, type SectionChange } from './sync-bus.server';

/**
 * The maturity badges of the Features page: served at once from the last
 * snapshot, refreshed behind the read, recomputed after an edit to what they
 * score, announced on the live bus when they change.
 */

const advice = (featureId: string): FeatureAdvice => ({ featureId, summary: null, score: null, gaps: [] });

/** A scoring the test scripts answer by answer, counting its runs. */
function scoring(...answers: Array<FeatureAdvice[] | Error>) {
	let runs = 0;
	const score = {
		execute: async () => {
			const next = answers[Math.min(runs, answers.length - 1)];
			runs++;
			if (next instanceof Error) throw next;
			return next;
		}
	} satisfies Pick<ScoreFeaturesUseCase, 'execute'>;
	return { score, runs: () => runs };
}

function memoryStore(initial: Record<string, FeatureAdvice[]> = {}) {
	const saved: Record<string, FeatureAdvice[]> = { ...initial };
	const store = {
		load: async (projectId) => saved[projectId] ?? null,
		save: async (projectId, data) => {
			saved[projectId] = data;
		}
	} satisfies SnapshotStore<FeatureAdvice[]>;
	return { store, saved };
}

/** Let every queued background refresh finish. */
async function settle(lane: BackgroundLane) {
	await lane.run('settle', 99, async () => undefined);
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function announcements(projectId: string) {
	const seen: SectionChange[] = [];
	subscribeSectionChanges((change) => {
		if (change.projectId === projectId && change.section === FEATURE_ADVICE_SECTION) seen.push(change);
	});
	return seen;
}

describe('the cached maturity advice', () => {
	it('serves the persisted snapshot on the first read, then the refreshed advice, saved and announced', async () => {
		const lane = new BackgroundLane();
		const { score } = scoring([advice('feat-new')]);
		const { store, saved } = memoryStore({ 'p-first': [advice('feat-old')] });
		const seen = announcements('p-first');
		const advisor = new CachedFeatureAdvisor(score, { lane, store, signature: () => 'model-1' });

		expect(await advisor.get('p-first')).toEqual([advice('feat-old')]);
		await settle(lane);
		expect(await advisor.get('p-first')).toEqual([advice('feat-new')]);
		expect(saved['p-first']).toEqual([advice('feat-new')]);
		expect(seen).toHaveLength(1);
	});

	it('does not recompute while the model signature stays the same', async () => {
		const lane = new BackgroundLane();
		const { score, runs } = scoring([advice('feat-a')]);
		const advisor = new CachedFeatureAdvisor(score, { lane, signature: () => 'model-1' });
		await advisor.get('p-steady');
		await settle(lane);
		await advisor.get('p-steady');
		await settle(lane);
		expect(runs()).toBe(1);
	});

	it('recomputes on the next read after an edit to the features or the rules', async () => {
		const lane = new BackgroundLane();
		const { score, runs } = scoring([advice('feat-a')], [advice('feat-b')], [advice('feat-c')]);
		const advisor = new CachedFeatureAdvisor(score, { lane, signature: () => 'model-1' });
		await advisor.get('p-edit');
		await settle(lane);

		publishSectionChange({ projectId: 'p-edit', section: 'features', origin: null });
		await advisor.get('p-edit');
		await settle(lane);
		expect(runs()).toBe(2);
		expect(await advisor.get('p-edit')).toEqual([advice('feat-b')]);

		publishSectionChange({ projectId: 'p-edit', section: 'rules', origin: null });
		await advisor.get('p-edit');
		await settle(lane);
		expect(runs()).toBe(3);
	});

	it('ignores edits to what it does not score, and to other projects', async () => {
		const lane = new BackgroundLane();
		const { score, runs } = scoring([advice('feat-a')]);
		const advisor = new CachedFeatureAdvisor(score, { lane, signature: () => 'model-1' });
		await advisor.get('p-quiet');
		await settle(lane);
		publishSectionChange({ projectId: 'p-quiet', section: 'experience', origin: null });
		publishSectionChange({ projectId: 'p-other', section: 'features', origin: null });
		await advisor.get('p-quiet');
		await settle(lane);
		expect(runs()).toBe(1);
	});

	it('keeps the last advice when scoring fails, and announces nothing', async () => {
		const lane = new BackgroundLane();
		const { score } = scoring(new Error('engine recycled'));
		const { store } = memoryStore({ 'p-fail': [advice('feat-kept')] });
		const seen = announcements('p-fail');
		const advisor = new CachedFeatureAdvisor(score, { lane, store, signature: () => 'model-1' });
		await advisor.get('p-fail');
		await settle(lane);
		expect(await advisor.get('p-fail')).toEqual([advice('feat-kept')]);
		expect(seen).toEqual([]);
	});

	it('announces nothing when the refresh finds the same advice', async () => {
		const lane = new BackgroundLane();
		const { score } = scoring([advice('feat-same')]);
		const { store } = memoryStore({ 'p-same': [advice('feat-same')] });
		const seen = announcements('p-same');
		const advisor = new CachedFeatureAdvisor(score, { lane, store, signature: () => 'model-1' });
		await advisor.get('p-same');
		await settle(lane);
		expect(seen).toEqual([]);
	});
});
