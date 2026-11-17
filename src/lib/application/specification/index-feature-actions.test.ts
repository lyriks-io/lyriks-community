import { describe, expect, it } from 'vitest';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { indexFeatureActions } from './index-feature-actions';

const snap = (feature: Record<string, unknown>) =>
	({ format: 'unspaghettit', version: 1, feature }) as unknown as UnspaFeatureSnapshot;

/** The tree answers "what does THIS feature do", so borrowed rows must not appear. */
describe('indexFeatureActions', () => {
	const journeySurface = {
		id: 'srf-journey-organize',
		name: 'Find & resume a chat',
		actions: [
			{ id: 'act-step-1', name: 'Search the library', intent: 'Search' },
			{ id: 'act-step-2', name: 'Resume a conversation', intent: 'Resume' }
		]
	};

	const snapshots = [
		// The Experience aux feature owns the journey.
		{ featureId: 'p1__experience', snapshot: snap({ id: 'p1__experience', surfaces: [journeySurface] }) },
		// A leaf the Core-bridge mirror lent that journey to, plus its own surface.
		{
			featureId: 'f-folders',
			snapshot: snap({
				id: 'f-folders',
				surfaces: [
					journeySurface,
					{
						id: 'b0b368ca',
						name: 'Folders',
						actions: [{ id: 'a1', name: 'Create a folder', intent: 'Add a folder' }]
					}
				]
			})
		},
		// A sibling leaf that has only the mirror — it defines nothing of its own.
		{ featureId: 'f-history', snapshot: snap({ id: 'f-history', surfaces: [journeySurface] }) }
	];

	it('lists a feature only under its own surfaces', () => {
		const index = indexFeatureActions(snapshots);
		expect(index['f-folders'].map((a) => a.name)).toEqual(['Create a folder']);
		expect(index['f-folders'][0].surfaceName).toBe('Folders');
	});

	it('leaves a feature out entirely when all it has is the mirror', () => {
		expect(indexFeatureActions(snapshots)['f-history']).toBeUndefined();
	});

	it('never indexes the aux features themselves', () => {
		expect(indexFeatureActions(snapshots)['p1__experience']).toBeUndefined();
	});

	it('keeps a leaf surface that merely shares a name with a journey', () => {
		const index = indexFeatureActions([
			{ featureId: 'p1__experience', snapshot: snap({ id: 'p1__experience', surfaces: [journeySurface] }) },
			{
				featureId: 'f-x',
				snapshot: snap({
					id: 'f-x',
					surfaces: [
						{ id: 'own-id', name: 'Find & resume a chat', actions: [{ id: 'a9', name: 'Resume' }] }
					]
				})
			}
		]);
		expect(index['f-x'].map((a) => a.name)).toEqual(['Resume']); // matched by id, not name
	});
});
