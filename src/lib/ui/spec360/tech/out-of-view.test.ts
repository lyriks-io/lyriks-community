import { describe, expect, it } from 'vitest';
import { outOfView } from './out-of-view';

describe('the Architecture names the layers out of view [criterion:2c6de3d9]', () => {
	// Five columns of 200px with gaps of 16px, in a view 840px wide.
	const columns = [0, 1, 2, 3, 4].map((i) => ({ left: i * 216, right: i * 216 + 200 }));

	it('names the layer past the right edge, none before it, at the start of the row', () => {
		expect(outOfView(columns, { left: 0, right: 840 })).toEqual({ before: [], after: [4] });
	});

	it('names the layer past the left edge once the row scrolled to its end', () => {
		expect(outOfView(columns, { left: 224, right: 1064 })).toEqual({ before: [0], after: [] });
	});

	it('names nothing when every layer is in view', () => {
		expect(outOfView(columns, { left: 0, right: 1080 })).toEqual({ before: [], after: [] });
	});
});
