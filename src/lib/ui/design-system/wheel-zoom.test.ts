import { describe, expect, it } from 'vitest';
import { listenWheelZoom, wheelFactor, wheelZooms } from './wheel-zoom';

/** An element whose listeners the test calls itself. */
function element() {
	const on = new Map<string, (e: Event) => void>();
	const el = {
		addEventListener: (type: string, fn: (e: Event) => void) => on.set(type, fn),
		removeEventListener: (type: string) => on.delete(type),
		getBoundingClientRect: () => ({ left: 10, top: 20 })
	} as unknown as HTMLElement;
	return { el, on };
}
const wheel = (init: Partial<WheelEvent>) => {
	let prevented = false;
	const event = { deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, clientX: 110, clientY: 120, preventDefault: () => (prevented = true), ...init };
	return { event: event as unknown as Event, prevented: () => prevented };
};

describe('a diagram in a page never takes its scroll, and zooms in proportion [criterion:ac-leaf-ac-diag-wheel]', () => {
	it('zooms in a page only with Ctrl or ⌘ (a trackpad pinch comes with Ctrl); enlarged, the wheel alone zooms', () => {
		expect(wheelZooms({ ctrlKey: false, metaKey: false }, false)).toBe(false);
		expect(wheelZooms({ ctrlKey: true, metaKey: false }, false)).toBe(true);
		expect(wheelZooms({ ctrlKey: false, metaKey: true }, false)).toBe(true);
		expect(wheelZooms({ ctrlKey: false, metaKey: false }, true)).toBe(true);
	});

	it('follows how far the wheel turned: a fine trackpad step barely, a notch about 15 %, never more', () => {
		const fine = wheelFactor({ deltaY: -2, deltaMode: 0 });
		const notch = wheelFactor({ deltaY: -100, deltaMode: 0 });
		expect(fine).toBeGreaterThan(1);
		expect(fine).toBeLessThan(1.01);
		expect(notch).toBeGreaterThan(1.1);
		expect(notch).toBeLessThan(1.2);
		expect(wheelFactor({ deltaY: -1000, deltaMode: 0 })).toBe(notch);
		expect(wheelFactor({ deltaY: 3, deltaMode: 1 })).toBeLessThan(1);
	});

	it('lets a plain wheel scroll the page and asks for the hint; with Ctrl it zooms around the pointer', () => {
		const { el, on } = element();
		const zooms: number[][] = [];
		let hinted = 0;
		listenWheelZoom(el, { ownsRoom: () => false, zoomAt: (f, x, y) => zooms.push([f, x, y]), hint: () => hinted++ });
		const plain = wheel({ deltaY: 100 });
		on.get('wheel')!(plain.event);
		expect(plain.prevented()).toBe(false);
		expect(hinted).toBe(1);
		expect(zooms).toEqual([]);
		const held = wheel({ deltaY: -100, ctrlKey: true });
		on.get('wheel')!(held.event);
		expect(held.prevented()).toBe(true);
		expect(zooms).toHaveLength(1);
		expect(zooms[0][1]).toBe(100);
		expect(zooms[0][2]).toBe(100);
	});
});
