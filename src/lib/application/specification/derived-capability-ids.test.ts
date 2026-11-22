import { describe, expect, it } from 'vitest';
import { createEmptyExperienceDraft, createJourney, createScreen, createStep } from '$domain/experience';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { screenCapabilityId } from '../projection/surface-capabilities';
import { derivedCapabilityIds } from './derived-capability-ids';

describe('the capabilities the access matrix lists beyond the users section', () => {
	it('lists every leaf feature, every journey that carries a step, every page and the surfaces the kernel holds', () => {
		const features = { ...createEmptyFeaturesDraft('p'), cores: [createCore({ id: 'c1' })], features: [createFeature('c1', null, { id: 'f-cart' })] };
		const experience = {
			...createEmptyExperienceDraft('p'),
			journeys: [createJourney('c1', 0, { id: 'j-walked' }), createJourney('c1', 1, { id: 'j-empty' })],
			steps: [createStep('j-walked', 0)],
			screens: [createScreen({ id: 'scr-home' })]
		};
		expect(derivedCapabilityIds(features, experience, ['surface:f-cart:dlg'])).toEqual(['f-cart', 'j-walked', screenCapabilityId('scr-home'), 'surface:f-cart:dlg']);
	});

	it('lists nothing from a section not written yet', () => {
		expect(derivedCapabilityIds(null, null)).toEqual([]);
	});
});
