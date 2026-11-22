import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ValidateAllButton from './ValidateAllButton.svelte';
import type { SectionElements } from './section-elements';

const html = (count: number, what: SectionElements = 'features') => render(ValidateAllButton, { props: { count, what, onclick: () => {} } }).body;

describe('Validate the whole section of a section', () => {
	it('shows only while something in the section waits on the reader', () => {
		expect(html(0)).not.toContain('Validate the whole section');
		expect(html(3)).toContain('Validate the whole section (3)');
	});

	it('keeps its height in a section header, but leaves no hole in a menu once everything is validated', () => {
		expect(html(0)).toContain('h-7 w-0');
		const menu = render(ValidateAllButton, { props: { count: 0, what: 'elements', always: true, onclick: () => {} } }).body;
		expect(menu).not.toContain('h-8');
		expect(menu.replace(/<!--[^]*?-->/g, '').trim()).toBe('');
	});

	it('says in its tooltip how many elements it validates', () => {
		expect(html(3)).toContain('Validate the 3 features of this section still waiting on you');
		expect(html(1)).toContain('Validate the 1 feature of this section still waiting on you');
	});
});
