import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TAG_DRAFT } from './look';

/**
 * The top of Knowledge says on the product's name that its specification is a draft (criteria 8e942b12, 14a1164c,
 * owner 2026-11-05 then 2026-11-07). Read from the sources, which a server render cannot reach without the contexts.
 */
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe("a draft reads DRAFT after the product's name at the top of Knowledge [criterion:8e942b12]", () => {
	it('puts the mark right after the name, on its line, while a draft only, saying how far its validation went', () => {
		const top = source('../KnowledgeBar.svelte');
		expect(top).toMatch(/\{productName\}<\/svelte:element>\s*\{#if draft\}<span class=\{TAG_DRAFT\} title=\{specTip\('draft', summary\)\}>Draft<\/span>\{\/if\}/);
	});

	it('leaves a page head able to carry a mark on its title line', () => {
		expect(source('./PageHead.svelte')).toMatch(/<\/h1>\s*\{@render mark\?\.\(\)\}/);
	});

	it('is outlined in orange like the navigation, never filled', () => {
		expect(TAG_DRAFT).toContain('border-orange');
		expect(TAG_DRAFT).not.toMatch(/\bbg-/);
	});
});
