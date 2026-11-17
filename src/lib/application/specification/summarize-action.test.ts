import { describe, expect, it } from 'vitest';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { summarizeAction } from './summarize-action';

const snapshot = {
	format: 'unspaghettit-feature',
	version: 1,
	feature: {
		surfaces: [
			{ id: 's-list', name: 'Room list', actions: [] },
			{
				id: 's-search',
				name: 'Search',
				actions: [
					{
						id: 'a-book',
						name: 'bookRoom',
						intent: 'Book a free room.',
						requiredStates: ['session.user'],
						parameters: [
							{ id: 'p-room', name: 'roomId', type: 'string', required: true },
							{ id: 'p-note', name: 'note', type: 'string' }
						],
						rules: [
							{
								condition: {
									kind: 'all',
									conditions: [
										{ left: 'room.status', operator: 'equals', right: 'free' },
										{ left: { kind: 'param', name: 'roomId' }, operator: 'equals', right: '' }
									]
								}
							}
						],
						effects: [
							{ type: 'set_state', path: 'room.status', value: 'booked' },
							{ type: 'set_state', path: 'room.status', value: 'booked' },
							{ type: 'emit_event', event: 'room.booked' },
							{ type: 'transition', target: 's-list' }
						],
						emittedEvents: ['room.booked'],
						scenarios: [
							{ id: 'sc-free', name: 'A free room is booked', expectedStatus: 'success' },
							{ id: 'sc-taken', name: 'A taken room is refused', expectedStatus: 'blocked' }
						]
					}
				]
			}
		]
	}
} as unknown as UnspaFeatureSnapshot;

describe('summarizeAction', () => {
	it('lists what the action takes, reads, writes, emits, leads to and proves', () => {
		const overview = summarizeAction(snapshot, 'a-book');
		expect(overview).toMatchObject({
			name: 'bookRoom',
			surfaceName: 'Search',
			parameters: [
				{ id: 'p-room', name: 'roomId', type: 'string', required: true },
				{ id: 'p-note', name: 'note', type: 'string', required: false }
			],
			reads: ['session.user', 'room.status'],
			writes: ['room.status'],
			events: ['room.booked'],
			transitions: [{ surfaceId: 's-list', name: 'Room list' }],
			scenarios: [
				{ id: 'sc-free', name: 'A free room is booked', expected: 'success' },
				{ id: 'sc-taken', name: 'A taken room is refused', expected: 'blocked' }
			]
		});
	});

	it('answers null for an action the feature does not hold', () => {
		expect(summarizeAction(snapshot, 'nope')).toBeNull();
		expect(summarizeAction(null, 'a-book')).toBeNull();
	});
});
