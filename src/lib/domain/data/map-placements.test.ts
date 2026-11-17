import { describe, expect, it } from 'vitest';
import { applyPlacementAct, NO_PLACEMENTS, parseMapPlacements, placedByHand } from './map-placements';

describe('tables are moved by hand and stay where they are put [criterion:7f5769bb]', () => {
	it('reads only real positions, in whole pixels inside the database', () => {
		const doc = parseMapPlacements({ tables: { visit: { x: 12.4, y: -3 }, link: { x: 'a', y: 1 }, '': { x: 1, y: 1 } } });
		expect(doc).toEqual({ tables: { visit: { x: 12, y: 0 } } });
		expect(parseMapPlacements(null)).toEqual(NO_PLACEMENTS);
	});

	it('keeps where a table is let go, beside the others already put', () => {
		const one = applyPlacementAct(NO_PLACEMENTS, { kind: 'move', tableId: 'visit', x: 340.6, y: 80 });
		expect(one.ok && one.document).toEqual({ tables: { visit: { x: 341, y: 80 } } });
		const two = one.ok ? applyPlacementAct(one.document, { kind: 'move', tableId: 'link', x: 0, y: 400 }) : one;
		expect(two.ok && placedByHand(two.document)).toBe(2);
	});

	it('puts every table back where the layout places it, and has nothing to do when none was moved', () => {
		const moved = { tables: { visit: { x: 1, y: 2 } } };
		expect(applyPlacementAct(moved, { kind: 'arrange' })).toEqual({ ok: true, document: NO_PLACEMENTS });
		expect(applyPlacementAct(NO_PLACEMENTS, { kind: 'arrange' })).toEqual({ ok: false, refusal: 'Every table already stands where the layout places it.' });
	});
});
