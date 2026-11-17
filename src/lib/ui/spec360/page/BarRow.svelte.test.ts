import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import BarRow from './BarRow.svelte';

/** The row as read: without the hydration marks server rendering leaves between the parts. */
const read = (props: Record<string, unknown>) => render(BarRow, { props: props as never }).body.replace(/<!--.*?-->/g, '');

/** A list row counts with its number alone, naming what it counts, no bar beside it (criterion 41a9c9d6). */
describe('a list counts with a number, never a bar [criterion:41a9c9d6]', () => {
	it('names what it counts beside the number and draws no bar', () => {
		const body = read({ title: 'Accounts and access', value: 5, unit: 'feature', href: '/x' });
		expect(body).toMatch(/>5<\/b>\sfeatures</);
		expect(body).not.toContain('clip-path');
		expect(body).not.toContain('ly-gauge');
	});

	it('says one in the singular', () => {
		const body = read({ title: 'Custom domains', value: 1, unit: 'feature', href: '/x' });
		expect(body).toMatch(/>1<\/b>\sfeature</);
	});

	it('shows no count where the row counts nothing', () => {
		const body = read({ title: 'Accounts and access' });
		expect(body).not.toContain('<b');
	});
});
