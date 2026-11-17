import { describe, expect, it } from 'vitest';
import { CanvasCamera, type CameraView } from './canvas-camera';

/** A camera over an 800x600 view of a 1000x1000 drawing, its frames run by hand. */
function rig(reduced = false) {
	let view: CameraView = { s: 1, x: 0, y: 0 };
	const frames: ((now: number) => void)[] = [];
	let now = 0;
	const camera = new CanvasCamera({
		read: () => view,
		write: (v) => (view = v),
		min: 0.2,
		max: 4,
		bounds: () => ({ view: { w: 800, h: 600 }, content: { x: 0, y: 0, w: 1000, h: 1000 } }),
		reducedMotion: () => reduced,
		frame: (step) => frames.push(step),
		cancelFrame: () => void frames.splice(0)
	});
	const tick = (n = 1, ms = 1000 / 60) => {
		for (let i = 0; i < n; i++) {
			now += ms;
			frames.splice(0).forEach((f) => f(now));
		}
	};
	return { camera, tick, get view() { return view; } };
}

describe('fitting and zooming glide, and a press takes over at once [criterion:ac-leaf-ac-diag-glide]', () => {
	it('glides from where the drawing stands to where it goes, then lands exactly', () => {
		const r = rig();
		r.camera.glideTo({ s: 2, x: -400, y: -300 });
		r.tick(3);
		expect(r.view.s).toBeGreaterThan(1);
		expect(r.view.s).toBeLessThan(2);
		r.tick(120);
		expect(r.view).toEqual({ s: 2, x: -400, y: -300 });
		expect(r.camera.gliding).toBe(false);
	});

	it('stops where it stands when a pointer takes the drawing mid-glide', () => {
		const r = rig();
		r.camera.glideTo({ s: 1, x: -400, y: 0 });
		r.tick(4);
		const midway = r.view.x;
		r.camera.hold();
		r.tick(30);
		expect(r.view.x).toBe(midway);
		expect(r.camera.gliding).toBe(false);
	});

	it('counts a second step from where the first is going', () => {
		const r = rig();
		r.camera.glideTo({ s: 2, x: 0, y: 0 });
		expect(r.camera.target.s).toBe(2);
	});

	it('goes there directly when reduced motion is asked', () => {
		const r = rig(true);
		r.camera.glideTo({ s: 2, x: -100, y: -50 });
		expect(r.view).toEqual({ s: 2, x: -100, y: -50 });
	});
});

describe('a thrown or dragged drawing never leaves the view [criterion:ac-leaf-ac-diag-throw]', () => {
	it('carries a throw on in its direction and stops inside its edges', () => {
		const r = rig();
		r.camera.hold();
		r.camera.panBy(-50, 0);
		r.camera.release(-1500, 0);
		r.tick(5);
		expect(r.view.x).toBeLessThan(-50);
		r.tick(200);
		// A strip of the drawing stays: x never goes past 96 - 1000.
		expect(r.view.x).toBeGreaterThanOrEqual(96 - 1000);
	});

	it('follows less and less past the edge, and springs back on release', () => {
		const r = rig();
		r.camera.hold();
		r.camera.panBy(900, 0);
		// Past the edge (800 - 96 = 704), the drawing has not followed the whole way.
		expect(r.view.x).toBeGreaterThan(704);
		expect(r.view.x).toBeLessThan(900);
		r.camera.release(0, 0);
		r.tick(200);
		expect(r.view.x).toBe(704);
	});

	it('does not carry a throw on with reduced motion', () => {
		const r = rig(true);
		r.camera.hold();
		r.camera.panBy(-50, 0);
		r.camera.release(-1500, 0);
		expect(r.view.x).toBe(-50);
	});
});
