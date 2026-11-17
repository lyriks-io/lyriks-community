import { describe, expect, it } from 'vitest';
import { codeCardPlace } from './code-card-place';

describe('the code card opens beside the page when there is room [criterion:ac-leaf-ac-src-code-place]', () => {
	const anchor = { left: 1030, top: 500, bottom: 518 };

	it('opens in the free space on the right, level with the place, covering nothing of the page', () => {
		const place = codeCardPlace({ anchor, columnRight: 1536, viewport: { width: 2200, height: 1100 } });
		expect(place).toEqual({ mode: 'beside', left: 1552, top: 484, width: 560 });
	});

	it('narrows to the free space, and stays on screen for a place low on the page', () => {
		const place = codeCardPlace({ anchor: { ...anchor, top: 1000, bottom: 1018 }, columnRight: 1536, viewport: { width: 1950, height: 1100 } });
		expect(place).toEqual({ mode: 'beside', left: 1552, top: 628, width: 386 });
	});

	it('opens over the page, next to the place, when the side is too narrow (1440 px)', () => {
		const place = codeCardPlace({ anchor, columnRight: 1296, viewport: { width: 1440, height: 1000 } });
		expect(place).toEqual({ mode: 'over', left: 868, top: 518, width: 560, above: false });
	});
});
