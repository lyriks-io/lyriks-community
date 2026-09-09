import { describe, it, expect } from 'vitest';
import { resolveBehaviorAddress } from './behavior-address';

describe('resolveBehaviorAddress (id bridge — Fix #2)', () => {
	it('maps a step to its action, leaving the surface for the engine', () => {
		expect(resolveBehaviorAddress({ projectId: 'returnly', stepId: 'step-tri-3' })).toEqual({
			featureId: 'returnly__experience',
			rootKey: 'action:act-step-tri-3',
			surfaceId: null,
			actionId: 'act-step-tri-3'
		});
	});

	it('maps a journey to its workflow surface', () => {
		expect(resolveBehaviorAddress({ projectId: 'returnly', journeyId: 'journey-triage' })).toEqual({
			featureId: 'returnly__experience',
			rootKey: 'surface:srf-journey-triage',
			surfaceId: 'srf-journey-triage',
			actionId: null
		});
	});

	it('maps a builder screen to its screen surface', () => {
		expect(resolveBehaviorAddress({ projectId: 'returnly', screenId: 'scr-portal' })).toEqual({
			featureId: 'returnly__experience',
			rootKey: 'surface:srf-screen-scr-portal',
			surfaceId: 'srf-screen-scr-portal',
			actionId: null
		});
	});

	it('passes a raw surface/action id through unchanged', () => {
		expect(resolveBehaviorAddress({ projectId: 'p', actionId: 'act-x' }).rootKey).toBe('action:act-x');
		expect(resolveBehaviorAddress({ projectId: 'p', surfaceId: 'srf-y' }).rootKey).toBe('surface:srf-y');
	});

	it('returns just the feature when no entity is named', () => {
		expect(resolveBehaviorAddress({ projectId: 'p' })).toEqual({
			featureId: 'p__experience',
			rootKey: null,
			surfaceId: null,
			actionId: null
		});
	});

	it('prefers step over journey when both are (wrongly) supplied — deterministic', () => {
		const r = resolveBehaviorAddress({ projectId: 'p', stepId: 's1', journeyId: 'j1' });
		expect(r.rootKey).toBe('action:act-s1');
	});
});
