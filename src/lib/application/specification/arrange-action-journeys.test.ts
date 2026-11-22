import { describe, expect, it } from 'vitest';
import { UNSPA_FEATURE_FORMAT, UNSPA_VERSION, type UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { BehaviorPort, ProjectResidueRepositoryPort } from '../ports';
import { ArrangeActionJourneysUseCase, LoadActionJourneysUseCase } from './arrange-action-journeys';

/** Project p1's behavior: feature feat-cart with actions add, pay and ship on two surfaces. */
const behavior = {
	readFeature: async (_projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> =>
		featureId === 'feat-cart'
			? {
					format: UNSPA_FEATURE_FORMAT,
					version: UNSPA_VERSION,
					feature: { id: 'feat-cart', surfaces: [{ actions: [{ id: 'add' }, { id: 'pay' }] }, { actions: [{ id: 'ship' }, { name: 'no id' }] }] }
				}
			: null
} satisfies Pick<BehaviorPort, 'readFeature'>;

/** The residue of project p1, held in memory. */
class Residue implements ProjectResidueRepositoryPort {
	writes = 0;
	constructor(public stored: Record<string, unknown>) {}
	async load(_projectId: string, section: string) {
		return section === 'features' ? this.stored : null;
	}
	async save(_projectId: string, _section: string, payload: unknown) {
		this.writes += 1;
		this.stored = payload as Record<string, unknown>;
	}
}

const otherFeature = { 'feat-other': [{ id: 'j9', name: 'Kept', nodes: [], links: [], origin: 'person' }] };

describe("arranging the journeys of a feature's actions", () => {
	it('saves a declared journey with the actions the feature has, beside the rest of the features residue', async () => {
		const residue = new Residue({ leafMeta: { 'feat-cart': { status: 'done' } }, actionJourneys: otherFeature });
		const result = await new ArrangeActionJourneysUseCase(behavior, residue).execute('p1', 'feat-cart', { kind: 'declare', id: 'j1', name: 'Checkout', nodes: ['add', 'pay', 'gone'] });

		expect(result).toEqual({ ok: true, journeys: [{ id: 'j1', name: 'Checkout', nodes: ['add', 'pay'], links: [], origin: 'person' }] });
		expect(residue.stored.leafMeta).toEqual({ 'feat-cart': { status: 'done' } });
		expect(residue.stored.actionJourneys).toEqual({ ...otherFeature, 'feat-cart': [{ id: 'j1', name: 'Checkout', nodes: ['add', 'pay'], links: [], origin: 'person' }] });
		expect(await new LoadActionJourneysUseCase(residue).execute('p1', 'feat-cart')).toEqual(result.ok ? result.journeys : []);
	});

	it('drops the feature from the residue once its last journey is removed', async () => {
		const residue = new Residue({ actionJourneys: { ...otherFeature, 'feat-cart': [{ id: 'j1', name: 'Checkout', nodes: ['add'], links: [], origin: 'person' }] } });
		await new ArrangeActionJourneysUseCase(behavior, residue).execute('p1', 'feat-cart', { kind: 'remove', journeyId: 'j1' });
		expect(residue.stored.actionJourneys).toEqual(otherFeature);
	});

	it('refuses a feature the specification does not hold, and an act the journeys refuse, writing nothing', async () => {
		const stored = { actionJourneys: otherFeature };
		const residue = new Residue(stored);
		const arrange = new ArrangeActionJourneysUseCase(behavior, residue);
		expect(await arrange.execute('p1', 'feat-gone', { kind: 'declare', id: 'j1', name: 'X' })).toEqual({ ok: false, refusal: 'This feature is not in the specification.', missing: true });
		expect(await arrange.execute('p1', 'feat-cart', { kind: 'declare', id: 'j1', name: '  ' })).toMatchObject({ ok: false, missing: false });
		expect(residue.writes).toBe(0);
		expect(residue.stored).toBe(stored);
	});
});
