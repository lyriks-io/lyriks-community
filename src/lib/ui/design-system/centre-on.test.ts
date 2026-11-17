import { describe, expect, it } from 'vitest';
import { centreOn, MAX_ZOOM } from './pan-zoom.svelte';

// ac-evo-func-uml-text: a problem's link brings its element to the middle of the drawing.
describe('centreOn', () => {
	it('puts the diagram point in the middle of the view at the zoom asked', () => {
		const placed = centreOn({ w: 800, h: 400 }, { x: 1000, y: 300 }, 1);
		expect(placed).toEqual({ scale: 1, tx: 400 - 1000, ty: 200 - 300 });
		// Where the point lands on screen: the translation plus the point scaled.
		expect(placed.tx + 1000 * placed.scale).toBe(400);
		expect(placed.ty + 300 * placed.scale).toBe(200);
	});

	it('never zooms past the largest zoom', () => {
		expect(centreOn({ w: 800, h: 400 }, { x: 10, y: 10 }, 99).scale).toBe(MAX_ZOOM);
	});
});
