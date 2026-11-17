import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { ALL_FORM_FACTORS } from '$domain/foundation';
import { formFactorDevices, type DeviceShape } from '$application/spec360/tech';
import DeviceOutline from './DeviceOutline.svelte';

/** Where it must run draws every form factor [criterion:4af7cac8]. */
describe('the device outline [criterion:4af7cac8]', () => {
	const body = (shape: DeviceShape | 'server', label = 'x') => render(DeviceOutline, { props: { shape, label } }).body;
	// The drawing alone, its name left out.
	const drawingOf = (html: string) => html.slice(0, html.indexOf('<span class="leading-tight">'));
	const SERVER_ROW = 'h-[17px] w-[60px]';

	it('draws each form factor of the catalog under its name, each its own drawing and none a server', () => {
		const drawings = formFactorDevices(ALL_FORM_FACTORS.map((f) => f.code)).map((d) => {
			const html = body(d.shape!, d.label);
			expect(html, d.code).toContain(`>${d.label}</span>`);
			expect(drawingOf(html), d.code).not.toContain(SERVER_ROW);
			return drawingOf(html);
		});
		expect(new Set(drawings).size).toBe(ALL_FORM_FACTORS.length);
		expect(body('server')).toContain(SERVER_ROW);
	});

	it('draws an API as braces, at the line weight of the boxes', () => {
		const html = body('braces', 'API');
		expect(html).toContain('<svg');
		expect(html).toContain('stroke-width="1"'); // 2.5px at 60px on a 24 grid
		expect(html).toContain('M8 3H7a2 2 0 00-2 2v5');
	});
});
