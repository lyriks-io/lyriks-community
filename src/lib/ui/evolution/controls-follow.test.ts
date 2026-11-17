import { describe, expect, it } from 'vitest';
import { controlsLook, followPlace, tabPath, tabPlace } from './controls-follow';

describe('a long section keeps its controls within reach [criterion:ac-leaf-ac-evo-form-controls-follow]', () => {
	const card = { top: -900, bottom: 700, right: 1296 };
	const tab = { width: 37, height: 120 };

	it('shows nothing while the header is in view', () => {
		expect(followPlace({ header: { bottom: 260 }, card, stickyBottom: 200, viewport: { width: 1440 }, tab })).toBeNull();
	});

	it('grows out of the right edge under the sticky bars when the side holds it (1440 px)', () => {
		expect(followPlace({ header: { bottom: -860 }, card, stickyBottom: 124, viewport: { width: 1440 }, tab })).toEqual({ side: 'out', edge: 1296, top: 144 });
	});

	it('grows inward against the edge when the side cannot hold it', () => {
		expect(followPlace({ header: { bottom: -860 }, card, stickyBottom: 124, viewport: { width: 1330 }, tab })?.side).toBe('in');
	});

	it('never passes the section, and goes once it has scrolled past', () => {
		expect(followPlace({ header: { bottom: -860 }, card: { ...card, bottom: 280 }, stickyBottom: 124, viewport: { width: 1440 }, tab })?.top).toBe(140);
		expect(followPlace({ header: { bottom: -860 }, card: { ...card, bottom: 220 }, stickyBottom: 124, viewport: { width: 1440 }, tab })).toBeNull();
	});

	it('leaves glued to its section: once it goes, its place still rides with the section', () => {
		const past = { header: { bottom: -860 }, card: { ...card, bottom: 160 }, stickyBottom: 124, viewport: { width: 1440 }, tab };
		expect(followPlace(past)).toBeNull();
		expect(tabPlace(past)).toEqual({ side: 'out', edge: 1296, top: 20 });
		expect(tabPlace({ ...past, card: { ...card, bottom: 100 } }).top).toBe(-40);
	});

	it('leaves from its own section when the header comes back down: never above the section', () => {
		const back = { header: { bottom: 360 }, card: { ...card, top: 300 }, stickyBottom: 124, viewport: { width: 1440 }, tab };
		expect(followPlace(back)).toBeNull();
		expect(tabPlace(back).top).toBe(320);
	});

	it('goes once what the section validates has scrolled past, whatever follows it in the card', () => {
		// 3.3 Journey: the drawing ends at 220 though the paths below it run on to the card's foot.
		expect(followPlace({ header: { bottom: -860 }, card: { top: -900, bottom: 220, right: 1296 }, stickyBottom: 124, viewport: { width: 1440 }, tab })).toBeNull();
	});
});

describe('the controls go back into the edge with the tab [criterion:ac-leaf-ac-evo-form-controls-follow]', () => {
	it('are full size once the tab is out, never larger while the spring overshoots', () => {
		expect(controlsLook(1)).toEqual({ scale: 1, opacity: 1 });
		expect(controlsLook(1.12)).toEqual({ scale: 1, opacity: 1 });
	});

	it('shrink with the material as it is drawn back in, and are gone once it is flat', () => {
		expect(controlsLook(0.5)).toEqual({ scale: 0.5, opacity: 0.8 });
		expect(controlsLook(0)).toEqual({ scale: 0, opacity: 0 });
		expect(controlsLook(-0.05)).toEqual({ scale: 0, opacity: 0 });
	});
});

describe('the tab is the section frame stretched out of its edge [criterion:ac-leaf-ac-evo-form-controls-follow]', () => {
	const size = { width: 37, height: 120, side: 'out' as const, border: 1 };

	it('is the flat edge at rest: nothing leaves the border line', () => {
		const { line } = tabPath(0, size);
		const xs = [...line.matchAll(/[MLQ ]?(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map((m) => Number(m[1]));
		expect(Math.max(...xs.map(Math.abs))).toBe(0);
	});

	it('leaves and meets the border through concave joints, its full width out once stretched', () => {
		const { line, fill } = tabPath(1, size);
		expect(line.startsWith('M0 -8.00Q0 0 8.00 0')).toBe(true);
		expect(line.endsWith('Q0 120.00 0 128.00')).toBe(true);
		expect(line).toContain('L37.00 ');
		expect(fill.endsWith('L-2.00 128.00L-2.00 -8.00Z')).toBe(true);
	});

	it('swells before it lengthens, and overshoots past its width while the spring does', () => {
		expect(tabPath(0.3, size).height).toBeGreaterThan(120 * 0.6);
		expect(tabPath(1.1, size).line).toContain('L40.70 ');
	});

	it('shrinks as one piece toward the middle of its edge when it leaves, as its controls do', () => {
		const half = tabPath(0.5, { ...size, leaving: true });
		expect(half.height).toBe(60);
		expect(half.top).toBe(30);
		expect(half.line).toContain('L18.50 ');
		expect(tabPath(0, { ...size, leaving: true })).toMatchObject({ height: 0, top: 60 });
		expect(tabPath(1.05, { ...size, leaving: true })).toMatchObject({ height: 120, top: 0 });
		expect(tabPath(0.5, size).top).toBe(0);
	});

	it('grows inward, mirrored, where the side cannot hold it', () => {
		expect(tabPath(1, { ...size, side: 'in' }).line).toContain('L-37.00 ');
	});
});
