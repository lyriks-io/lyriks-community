import { describe, expect, it } from 'vitest';
import { EditMode, type ModeKey } from './edit-mode.svelte';

const key = (k: string, mods: Partial<Omit<ModeKey, 'key' | 'target'>> = {}, target: unknown = null): ModeKey => ({
	key: k,
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	...mods,
	target: target as EventTarget | null
});

describe('EditMode', () => {
	it('starts off and turns on and off with Ctrl+E or Cmd+E', () => {
		const mode = new EditMode(() => true);
		expect(mode.active).toBe(false);
		expect(mode.key(key('e', { ctrlKey: true }))).toBe(true);
		expect(mode.active).toBe(true);
		expect(mode.key(key('E', { metaKey: true }))).toBe(true);
		expect(mode.active).toBe(false);
	});

	it('leaves the mode on Escape, but not while a field holds the focus', () => {
		const mode = new EditMode(() => true);
		mode.set(true);
		const field = { tagName: 'INPUT' };
		expect(mode.key(key('Escape', {}, field))).toBe(false);
		expect(mode.active).toBe(true);
		expect(mode.key(key('Escape'))).toBe(true);
		expect(mode.active).toBe(false);
	});

	it('is never offered to a reader who may not edit', () => {
		const mode = new EditMode(() => false);
		expect(mode.available).toBe(false);
		expect(mode.key(key('e', { ctrlKey: true }))).toBe(false);
		mode.set(true);
		expect(mode.active).toBe(false);
	});

	it('goes quiet when the right to edit goes, even if it was on', () => {
		let may = true;
		const mode = new EditMode(() => may);
		mode.set(true);
		may = false;
		expect(mode.active).toBe(false);
	});

	it('leaves a plain E and Shift+Ctrl+E to the page', () => {
		const mode = new EditMode(() => true);
		expect(mode.key(key('e'))).toBe(false);
		expect(mode.key(key('e', { ctrlKey: true, shiftKey: true }))).toBe(false);
		expect(mode.active).toBe(false);
	});
});

describe('the Edit mode waits for who left Knowledge [criterion:76d3a766]', () => {
	const memory = (start: { leftAt: number | null } | null = null) => {
		let kept = start;
		return { kept: () => kept, keep: (leftAt: number | null) => void (kept = { leftAt }), forget: () => void (kept = null) };
	};

	it('is on again within five minutes of leaving, and the time away stops counting', () => {
		const m = memory({ leftAt: 0 });
		const mode = new EditMode(() => true, m);
		mode.resume(5 * 60_000);
		expect(mode.on).toBe(true);
		expect(m.kept()).toEqual({ leftAt: null });
	});

	it('is off past the five minutes, and forgets', () => {
		const m = memory({ leftAt: 0 });
		const mode = new EditMode(() => true, m);
		mode.resume(5 * 60_000 + 1);
		expect(mode.on).toBe(false);
		expect(m.kept()).toBeNull();
	});

	it('starts waiting when the reader leaves, and turning it off forgets it', () => {
		const m = memory();
		const mode = new EditMode(() => true, m);
		mode.set(true);
		mode.leave(1234);
		expect(m.kept()).toEqual({ leftAt: 1234 });
		mode.set(false);
		expect(m.kept()).toBeNull();
	});

	it('never turns on for who may not edit', () => {
		const mode = new EditMode(() => false, memory({ leftAt: null }));
		mode.resume(0);
		expect(mode.on).toBe(false);
	});
});
