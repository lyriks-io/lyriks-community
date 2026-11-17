import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scrollMotion } from './scroll-motion';

const css = readFileSync(join(process.cwd(), 'src/app.css'), 'utf8');
/** The body of the first block opened by `opening` in app.css. */
function block(opening: string, from = 0): string {
	const start = css.indexOf(opening, from);
	expect(start, opening).toBeGreaterThanOrEqual(0);
	let depth = 0;
	for (let i = css.indexOf('{', start); i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
	}
	return '';
}
const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? sources(path) : /\.(svelte|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
	});

describe('reduced motion keeps the change, not the movement [criterion:da3bc837]', () => {
	it('lands the jumps Lyriks scrolls by itself at once', () => {
		let reduce = true;
		vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) });
		expect(scrollMotion()).toBe('auto');
		reduce = false;
		expect(scrollMotion()).toBe('smooth');
		vi.unstubAllGlobals();
	});

	it('never scrolls smoothly behind the reader\'s back: every call asks scrollMotion', () => {
		const smooth = sources(join(process.cwd(), 'src'))
			.filter((path) => !path.endsWith('scroll-motion.ts'))
			.filter((path) => readFileSync(path, 'utf8').includes("behavior: 'smooth'"));
		expect(smooth).toEqual([]);
	});

	it('fades what rose, popped or burst in, and keeps the fades a page marks', () => {
		const reduced = block('@media (prefers-reduced-motion: reduce) {', css.indexOf('Respect users who ask for less motion'));
		expect(reduced).toContain('.animate-lk-in');
		expect(reduced).toContain('animation: lk-fade 150ms ease both !important');
		expect(reduced).toContain('[data-reduced-fade]');
	});
});

describe('more contrast when the system asks for it [criterion:dc06b679]', () => {
	it('draws rules in ink, darkens muted text and thickens the focus mark', () => {
		const more = block('@media (prefers-contrast: more) {');
		expect(more).toMatch(/--color-line:\s*#55555c/);
		expect(more).toMatch(/--color-ink-400:\s*#3a3a40/);
		expect(more).toContain('outline-width: 3px');
	});
});

describe('a tapped control never stays lifted [criterion:42e3defe]', () => {
	it('lifts a pressable control only where a pointer hovers', () => {
		const pressable = block('@utility pressable {');
		const hover = block('@media (hover: hover) {', css.indexOf('@utility pressable {'));
		expect(pressable).toContain(hover);
		expect(hover).toContain('translate(-1px, -1px)');
		expect(pressable.replace(hover, '')).not.toContain(':hover');
	});
});

describe('text follows the reader\'s own text size [criterion:5f3e9f45]', () => {
	it('sizes Lyriks\'s own text relative to the reader\'s, the customer\'s renderings apart', () => {
		const fixed = sources(join(process.cwd(), 'src'))
			.filter((path) => !path.includes('/experience/builder/'))
			.filter((path) => {
				const text = readFileSync(path, 'utf8');
				return !text.includes('--sim-') && /\b(text|leading)-\[[0-9.]+px\]|font-size:\s*[0-9.]+px/.test(text);
			});
		expect(fixed).toEqual([]);
		expect(css).not.toMatch(/font-size:\s*[0-9.]+px/);
	});
});
