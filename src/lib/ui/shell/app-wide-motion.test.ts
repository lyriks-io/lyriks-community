import { describe, expect, it, vi } from 'vitest';
import { scrollMotion } from './scroll-motion';

/** What the app's stylesheet does under the reader's media is proved in Chromium: tests/browser/app-css-media.spec.ts. */

describe('reduced motion keeps the change, not the movement [criterion:da3bc837]', () => {
	it('lands the jumps Lyriks scrolls by itself at once', () => {
		let reduce = true;
		vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) });
		expect(scrollMotion()).toBe('auto');
		reduce = false;
		expect(scrollMotion()).toBe('smooth');
		vi.unstubAllGlobals();
	});
});
