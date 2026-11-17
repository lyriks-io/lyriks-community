import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { DiagramEnlarger, closeEnlargedDiagram, enlargeDiagram, frameClass } from './enlarge.svelte';
import { MAX_ZOOM, MIN_ZOOM, PanZoom, fitToView, zoomIn, zoomOut } from './pan-zoom.svelte';
import DiagramHeader from './DiagramHeader.svelte';
import PanZoomCanvas from './PanZoomCanvas.svelte';

const enlargerIn = (display: 'windowed' | 'enlarged') => {
	const enlarger = new DiagramEnlarger();
	enlarger.display = display;
	return enlarger;
};
const drawing = createRawSnippet(() => ({ render: () => '<svg></svg>' }));

// The scenarios of feat-fb747-diagram-fullscreen, replayed against the real code.
describe('Enlarge a diagram', () => {
	it('opens the diagram in a dialog over the page [unspa:af5e42b8:f298bec8:28e31772]', () => {
		expect(enlargeDiagram('windowed')).toEqual({ status: 'success', display: 'enlarged' });
		expect(frameClass('enlarged')).toContain('fixed inset-3');
	});

	it('closes the dialog by its button or Escape [unspa:af5e42b8:17d81a56:f6938ca5]', () => {
		expect(closeEnlargedDiagram('enlarged')).toEqual({ status: 'success', display: 'windowed' });
	});

	it('does nothing on Escape when no dialog is open [unspa:af5e42b8:17d81a56:3b49e616]', () => {
		expect(closeEnlargedDiagram('windowed').status).toBe('blocked');
	});

	it('opens then closes, back in the card as it was [unspa:af5e42b8:17d81a56:e0fcae9f] [criterion:ac-leaf-ac-diag-fs-2]', () => {
		const opened = enlargeDiagram('windowed');
		expect(opened).toEqual({ status: 'success', display: 'enlarged' });
		if (opened.status !== 'success') return;
		expect(closeEnlargedDiagram(opened.display)).toEqual({ status: 'success', display: 'windowed' });
		expect(frameClass('windowed')).toBe('');
		expect(enlargeDiagram('enlarged').status).toBe('blocked');
	});
});

describe('the enlarged dialog closes from its top right [criterion:ac-leaf-ac-diag-fs-2] [criterion:ac-leaf-ac-diag-fs-3] [criterion:ac-leaf-ac-diag-title]', () => {
	const title = 'Use cases: who uses La Fournée, and for what';
	it('heads the dialog with the diagram title and a close cross with no word beside it, the title alone in the card', () => {
		const open = render(DiagramHeader, { props: { enlarger: enlargerIn('enlarged'), title } }).body;
		expect(open).toContain(`<h2 class="min-w-0 flex-1 truncate text-sm font-bold tracking-[-0.01em] text-ink">${title}</h2>`);
		// Named Close for a screen reader, Close (Esc) in its tooltip.
		expect(open).toContain('aria-label="Close"');
		expect(open).toContain('title="Close (Esc)"');
		// The cross alone: neither "Close" nor "Esc" written on the button.
		expect(open).not.toMatch(/>\s*Close\s*</);
		expect(open).not.toContain('<kbd');
		const card = render(DiagramHeader, { props: { enlarger: enlargerIn('windowed'), title } }).body;
		// The same words above the diagram in its card, and no close there.
		expect(card).toContain(`>${title}</h3>`);
		expect(card).not.toContain('Close');
	});

	it('keeps the zoom alone in the panel once enlarged, the enlarge icon in the card', () => {
		const props = (display: 'windowed' | 'enlarged') => ({ view: new PanZoom(), enlarger: enlargerIn(display), height: '400px', label: 'Diagram', children: drawing });
		const card = render(PanZoomCanvas, { props: props('windowed') }).body;
		expect(card).toContain('aria-label="Enlarge"');
		const open = render(PanZoomCanvas, { props: props('enlarged') }).body;
		expect(open).not.toContain('aria-label="Enlarge"');
		expect(open).not.toContain('Close');
		expect(open).toContain('aria-label="Zoom in"');
	});
});

describe('Zoom and pan a diagram', () => {
	it('zooms in one step [unspa:af5e42b8:7d373a49:7189ad48]', () => {
		const outcome = zoomIn(1);
		expect(outcome.status).toBe('success');
		if (outcome.status === 'success') expect(outcome.zoom).toBeCloseTo(1.2);
	});

	it('stops zooming in at 400% [unspa:af5e42b8:7d373a49:35174d26]', () => {
		expect(zoomIn(MAX_ZOOM).status).toBe('blocked');
	});

	it('never zooms in past 400% [unspa:af5e42b8:7d373a49:b4474bcf]', () => {
		expect(zoomIn(3.8)).toEqual({ status: 'success', zoom: 4 });
	});

	it('stops zooming out at 20% [unspa:af5e42b8:eab8c137:8137026d]', () => {
		expect(zoomOut(MIN_ZOOM).status).toBe('blocked');
	});

	it('zooms out one step [unspa:af5e42b8:eab8c137:aa15024a] [criterion:ac-leaf-ac-diag-fs-3]', () => {
		const outcome = zoomOut(1.2);
		expect(outcome.status).toBe('success');
		if (outcome.status === 'success') expect(outcome.zoom).toBeCloseTo(1);
		expect(MIN_ZOOM).toBe(0.2);
		expect(MAX_ZOOM).toBe(4);
	});

	it('fits the whole diagram in view, centred, never scaled up [unspa:af5e42b8:8e774595:4cb6bc0b]', () => {
		const big = fitToView({ w: 432, h: 232 }, { w: 800, h: 400 });
		expect(big.scale).toBeCloseTo(0.5);
		expect(big.tx).toBeCloseTo(16);
		expect(fitToView({ w: 1000, h: 1000 }, { w: 100, h: 100 }).scale).toBe(1);
	});

	it('moves the diagram by dragging, which leaves the fitted view [unspa:af5e42b8:3a92714b:80c8fb61] [criterion:ac-leaf-ac-diag-fs-4]', () => {
		const view = new PanZoom();
		expect(view.fitted).toBe(true);
		view.pan(30, -10);
		expect([view.tx, view.ty]).toEqual([30, -10]);
		expect(view.fitted).toBe(false);
	});
});
