import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { countOf } from './section-elements';
import ValidateAllButton from './ValidateAllButton.svelte';
import ValidateAllCheck from '$ui/spec360/ValidateAllCheck.svelte';

const clean = (html: string) => html.replace(/<!--.*?-->/g, '');

describe('a section counts its elements in words, one of them in the singular of its kind', () => {
	it('writes the singular of every kind out, never by dropping a final s', () => {
		expect(countOf(1, 'technologies')).toBe('1 technology');
		expect(countOf(1, 'core features')).toBe('1 core feature');
		expect(countOf(1, 'health facts')).toBe('1 health fact');
		expect(countOf(1, 'changes')).toBe('1 change');
		expect(countOf(1, 'users')).toBe('1 user');
	});

	it('keeps the plural for any other count, none included', () => {
		expect(countOf(3, 'technologies')).toBe('3 technologies');
		expect(countOf(0, 'rules')).toBe('0 rules');
	});

	it("reads one technology on a frame's check, and one change on a Specification section's button [criterion:3f424411]", () => {
		const check = clean(render(ValidateAllCheck, { props: { count: 1, what: 'technologies', onclick: () => {} } }).body);
		expect(check).toContain('aria-label="Validate the whole section: 1 technology still waiting on you"');
		expect(check).not.toContain('technologie ');
		const button = clean(render(ValidateAllButton, { props: { count: 1, what: 'changes', onclick: () => {} } }).body);
		expect(button).toContain('title="Validate the 1 change of this section still waiting on you"');
	});
});
