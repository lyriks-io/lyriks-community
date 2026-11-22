import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OptimisticActs } from './optimistic-acts.svelte';
import { pendingSaves } from '$ui/shell/pending-saves.svelte';

describe('a Validate reads at once and goes back if the save fails [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	beforeEach(() => vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0)));
	afterEach(() => vi.unstubAllGlobals());

	it('reads the act the moment it is sent, and keeps it until the page read the request again', async () => {
		const acts = new OptimisticActs<string>();
		let reading = { version: 1 };
		let answer!: (ok: boolean) => void;
		const run = acts.run('section', 'validate', () => new Promise<boolean>((done) => (answer = done)), () => reading);
		expect(acts.of('section')).toBe('validate');
		answer(true);
		await new Promise((r) => setTimeout(r, 20));
		// Saved, but the page has not read the request again yet: the card does not blink back.
		expect(acts.of('section')).toBe('validate');
		reading = { version: 2 };
		expect(await run).toBe(true);
		expect(acts.of('section')).toBeNull();
	});

	it('ends Saving at the server answer and keeps the act until the page read the request again [criterion:27bbfacd]', async () => {
		const acts = new OptimisticActs<string>();
		let reading = { version: 1 };
		let answer!: (ok: boolean) => void;
		const run = acts.run('section', 'validate', () => new Promise<boolean>((done) => (answer = done)), () => reading);
		expect(pendingSaves.waiting).toBe(1);
		answer(true);
		await new Promise((r) => setTimeout(r, 20));
		expect(pendingSaves.waiting).toBe(0);
		expect(acts.of('section')).toBe('validate');
		reading = { version: 2 };
		expect(await run).toBe(true);
		expect(acts.of('section')).toBeNull();
	});

	it('drops the act at once when the save fails, which puts the card back', async () => {
		const acts = new OptimisticActs<string>();
		const reading = { version: 1 };
		expect(await acts.run('f:feat-a', 'validate', async () => false, () => reading)).toBe(false);
		expect(acts.of('f:feat-a')).toBeNull();
	});

	it('reads one act on every element of a section validated at once, and lets them all go with the save', async () => {
		const acts = new OptimisticActs<string>();
		acts.run('f:other', 'withdraw', () => new Promise<boolean>(() => {}), () => ({}));
		let answer!: (ok: boolean) => void;
		const run = acts.runAll(['f:a', 'f:b'], 'validate', () => new Promise<boolean>((done) => (answer = done)), () => ({}));
		expect([acts.of('f:a'), acts.of('f:b')]).toEqual(['validate', 'validate']);
		answer(false);
		expect(await run).toBe(false);
		expect([acts.of('f:a'), acts.of('f:b')]).toEqual([null, null]);
		// An act sent elsewhere meanwhile is not taken along.
		expect(acts.of('f:other')).toBe('withdraw');
	});
});

describe('a second act on the same element queues behind the first [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	beforeEach(() => vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0)));
	afterEach(() => vi.unstubAllGlobals());
	const later = () => new Promise((r) => setTimeout(r, 20));

	it('replaces the first on the page at once, and the first answering never takes it off', async () => {
		const acts = new OptimisticActs<string>();
		let reading = { version: 1 };
		let first!: (ok: boolean) => void;
		const one = acts.run('section', 'validate', () => new Promise<boolean>((done) => (first = done)), () => reading);
		const two = acts.run('section', 'withdraw', async () => true, () => reading);
		expect(acts.of('section')).toBe('withdraw');
		reading = { version: 2 };
		first(true);
		expect(await one).toBe(true);
		// The withdrawal saves after the validation and is still read on the page until it is read back.
		expect(acts.of('section')).toBe('withdraw');
		await later();
		reading = { version: 3 };
		expect(await two).toBe(true);
		expect(acts.of('section')).toBeNull();
	});

	it('saves the second only once the first is saved', async () => {
		const acts = new OptimisticActs<string>();
		const order: string[] = [];
		let first!: (ok: boolean) => void;
		let reading = 1;
		const one = acts.run('k', 'a', () => new Promise<boolean>((done) => (first = (ok) => (order.push('first saved'), done(ok)))), () => reading);
		const two = acts.run('k', 'b', async () => (order.push('second sent'), (reading = 3), true), () => reading);
		await later();
		expect(order).toEqual([]);
		reading = 2;
		first(true);
		await one;
		await two;
		expect(order).toEqual(['first saved', 'second sent']);
	});

	it('drops the second unsaved when the first fails: it was built on an outcome that did not happen', async () => {
		const acts = new OptimisticActs<string>();
		let first!: (ok: boolean) => void;
		const second = vi.fn(async () => true);
		const one = acts.run('k', 'validate', () => new Promise<boolean>((done) => (first = done)), () => ({}));
		const two = acts.run('k', 'withdraw', second, () => ({}));
		first(false);
		expect(await one).toBe(false);
		expect(await two).toBe(false);
		expect(second).not.toHaveBeenCalled();
		expect(acts.of('k')).toBeNull();
	});

	it('reads several keys of one save each with its own act, and lists every act still pending', async () => {
		const acts = new OptimisticActs<string>();
		let answer!: (ok: boolean) => void;
		const run = acts.runEach({ 't:a': 'one', 't:b': 'two' }, () => new Promise<boolean>((done) => (answer = done)), () => ({}));
		expect(acts.all).toEqual({ 't:a': 'one', 't:b': 'two' });
		answer(false);
		await run;
		expect(acts.all).toEqual({});
	});

	it('treats a save that throws as a failure', async () => {
		const acts = new OptimisticActs<string>();
		expect(await acts.run('k', 'a', async () => Promise.reject(new Error('network')), () => ({}))).toBe(false);
		expect(acts.of('k')).toBeNull();
	});
});
