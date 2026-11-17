import { describe, expect, it } from 'vitest';
import { SaveQueue, refusalOf } from './save-queue';

const later = <T>(ms: number, value: T, fail = false) => new Promise<T>((done, reject) => setTimeout(() => (fail ? reject(new Error('down')) : done(value)), ms));

describe('saves sent one after the other', () => {
	it('starts a save only once the one before it settled, in the order of the acts', async () => {
		const queue = new SaveQueue();
		const order: string[] = [];
		const first = queue.run(async () => (order.push('first:start'), await later(20, 1), order.push('first:end'), 1));
		const second = queue.run(async () => (order.push('second:start'), await later(1, 2), order.push('second:end'), 2));
		expect(await Promise.all([first, second])).toEqual([1, 2]);
		expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
	});

	it('goes on after a save that failed', async () => {
		const queue = new SaveQueue();
		const first = queue.run(() => later(5, 0, true));
		const second = queue.run(() => later(1, 'ok'));
		await expect(first).rejects.toThrow('down');
		expect(await second).toBe('ok');
	});
});

describe('why a save was refused', () => {
	it('reads the server words first, then the status', async () => {
		expect(await refusalOf(new Response(JSON.stringify({ message: 'The glossary changed at the same time. Try again.' }), { status: 409 }), 'Not saved')).toBe(
			'The glossary changed at the same time. Try again.'
		);
		expect(await refusalOf(new Response(JSON.stringify({ refusal: 'Write your message first.' }), { status: 422 }), 'Not saved')).toBe('Write your message first.');
		expect(await refusalOf(new Response('Folder name taken', { status: 400 }), 'Not saved')).toBe('Folder name taken');
		expect(await refusalOf(new Response('<html>boom</html>', { status: 500 }), 'Not saved')).toBe('Not saved (500).');
		expect(await refusalOf(new Response('', { status: 500 }), 'Not saved')).toBe('Not saved (500).');
	});
});
