import { describe, expect, it } from 'vitest';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { sourcedScreens } from './sourced-screens';

const snapshot = { feature: { id: 'f', surfaces: [{ id: 'settings' }, { id: 'verify' }, { id: 'invented' }] } } as unknown as UnspaFeatureSnapshot;
const source = (id: string, projectId = 'p') => ({ id, projectId, name: `${id}.hbs` });
const span = (elementId: string, elementType = 'surface', sourceId = 'view') => ({ elementId, elementType, sourceId, startLine: 1, endLine: 9 });

describe('a feature counts only the screens traced to a source [criterion:c72a7e79]', () => {
	it('counts a screen a passage of an attached source was recorded for, and not the one no source backs', () => {
		expect(sourcedScreens('p', snapshot, { sources: [source('view')], spans: [span('settings'), span('verify')] })).toBe(2);
	});

	it('counts a screen once, however many passages it rests on', () => {
		expect(sourcedScreens('p', snapshot, { sources: [source('view')], spans: [span('settings'), span('settings')] })).toBe(1);
	});

	it('counts no element that is not a screen, and no screen the feature no longer holds', () => {
		expect(sourcedScreens('p', snapshot, { sources: [source('view')], spans: [span('settings', 'action'), span('gone')] })).toBe(0);
	});

	it('refuses a passage whose source is gone or belongs to another project', () => {
		expect(sourcedScreens('p', snapshot, { sources: [], spans: [span('settings')] })).toBe(0);
		expect(sourcedScreens('p', snapshot, { sources: [source('view', 'other')], spans: [span('settings')] })).toBe(0);
	});

	it('counts nothing when the engine says nothing', () => {
		expect(sourcedScreens('p', snapshot, null)).toBe(0);
		expect(sourcedScreens('p', null, { sources: [source('view')], spans: [span('settings')] })).toBe(0);
	});
});
