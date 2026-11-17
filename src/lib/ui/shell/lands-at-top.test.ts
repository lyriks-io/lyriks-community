import { describe, expect, it } from 'vitest';
import { landsAtTop } from './lands-at-top';

const url = (path: string) => new URL(`http://lyriks.local${path}`);

describe('landsAtTop', () => {
	it('opens another page at its top, whatever was scrolled on the last one', () => {
		expect(landsAtTop(url('/projects/p/spec/features/a'), url('/projects/p/spec/features/b'), 'link')).toBe(true);
		expect(landsAtTop(url('/projects/p/retrospec'), url('/projects/p/spec'), 'goto')).toBe(true);
	});

	it('opens another evolution at its top, though the address stays the same', () => {
		expect(landsAtTop(url('/projects/p/evolution'), url('/projects/p/evolution?request=r2'), 'link')).toBe(true);
		expect(landsAtTop(url('/projects/p/evolution?request=r1'), url('/projects/p/evolution?request=r2'), 'link')).toBe(true);
	});

	it('keeps the place when going back, on the first load, or when only a filter of the page changes', () => {
		expect(landsAtTop(url('/projects/p/spec/users'), url('/projects/p/spec'), 'popstate')).toBe(false);
		expect(landsAtTop(null, url('/projects/p/spec'), 'enter')).toBe(false);
		expect(landsAtTop(url('/projects/p/spec'), url('/projects/p/spec?discussions'), 'link')).toBe(false);
	});

	it('lands on the precise spot a link names instead of the top', () => {
		expect(landsAtTop(url('/projects/p/spec'), url('/projects/p/spec/users#kbt-admin'), 'link')).toBe(false);
		expect(landsAtTop(url('/'), url('/projects/p/evolution?request=r1&at=next-step'), 'link')).toBe(false);
	});
});
