import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFunctionalDiagram } from '$domain/evolution';
import { layoutFlow } from '$ui/evolution/uml/layout';
import { MIN_ZOOM, MAX_ZOOM, PanZoom, fitEntireView } from './pan-zoom.svelte';

afterEach(() => vi.unstubAllGlobals());
function attached(options: ConstructorParameters<typeof PanZoom>[0]) {
 vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
 vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
 const canvas = { clientWidth: 432, clientHeight: 232, addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement;
 const view = new PanZoom(options);
 const dispose = view.attach(canvas);
 return { view, dispose };
}

describe('Evolution contains the whole drawing [criterion:fa6c7dec]', () => {
 it('keeps every Ways out box and the flow final inside the fitted viewport [criterion:73375477]', () => {
  const { diagram } = readFunctionalDiagram('actor Visitor\nuse case Pay: Visitor\nflow Pay\n  Visitor: confirms\n  Product: saves\n    refused when it was paid: show the existing receipt\n    goes wrong when storage is unavailable: leave the invoice unchanged');
  const layout = layoutFlow(diagram, diagram.flows[0]);
  const fit = fitEntireView({ w: 432, h: 232 }, { w: layout.width, h: layout.height }, 1.25);
  const exits = layout.nodes.filter(node => node.kind === 'exit');
  expect(exits.length).toBe(2);
  for (const box of exits) {
   expect(fit.tx + (box.x + box.w) * fit.scale).toBeLessThanOrEqual(432 - 16);
   expect(fit.ty + (box.y + box.h) * fit.scale).toBeLessThanOrEqual(232 - 16);
  }
  expect(fit.ty + layout.height * fit.scale).toBeLessThanOrEqual(232 - 16);
 });
 it('automatically fits large content below manual zoom, restores all, and retains manual limits', () => {
  const { view, dispose } = attached({ fitEntire: true, readable: 0.9, maxFit: 1.25 });
  try {
   view.setNatural(2400, 3000);
   const fitted = view.scale;
   expect(fitted).toBeLessThan(MIN_ZOOM);
   expect(view.tx + 2400 * view.scale).toBeLessThanOrEqual(432 - 16);
   expect(view.ty + 3000 * view.scale).toBeLessThanOrEqual(232 - 16);
   view.zoomAt(0.5, 100, 100);
   expect(view.scale).toBe(fitted);
   view.zoomIn();
   expect(view.scale).toBeGreaterThanOrEqual(MIN_ZOOM);
   expect(view.fitted).toBe(false);
   view.zoomAt(1000, 100, 100);
   expect(view.scale).toBe(MAX_ZOOM);
   view.showAll();
   expect(view.scale).toBe(fitted);
   expect(view.fitted).toBe(true);
  } finally { dispose(); }
 });
 it('keeps the existing readable placement for callers that did not request whole-content fitting', () => {
  const { view, dispose } = attached({ readable: 0.9, maxFit: 1.25 });
  try { view.setNatural(2400, 3000); expect(view.scale).toBe(0.9); }
  finally { dispose(); }
 });
});
