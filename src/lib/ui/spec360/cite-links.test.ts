import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commentsWords, sourcesWords } from './CiteLinks.svelte';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const OVERVIEW = 'src/routes/projects/[projectId]/spec/+page.svelte';

describe('About the product closes its summary with its comments and sources as links of the text [criterion:416e4885]', () => {
	it('reads the comments as an invitation, then as how many topics are open, and the sources as how many', () => {
		expect(commentsWords(0)).toBe('Comment');
		expect(commentsWords(1)).toBe('1 comment');
		expect(commentsWords(2)).toBe('2 comments');
		expect(sourcesWords(1)).toBe('1 source');
		expect(sourcesWords(3)).toBe('3 sources');
	});

	it('puts the links after the last paragraph of the summary, and leaves them out of its controls but in the Edit mode', () => {
		const overview = read(OVERVIEW);
		// Its cross and its check follow the links on the same line (criterion a4ef7658); in the Edit mode the controls take their own line.
		expect(overview).toContain('{#if i === summaryShown.length - 1 && !mode.active}<CiteLinks anchor="product" />{#if g.pitch}<SpecControls anchor="product" title="Product summary" values={product} inline cites trailing />{/if}{/if}');
		const controls = read('src/lib/ui/spec360/SpecControls.svelte');
		expect(controls).toContain('const inText = $derived(cites && !mode.active);');
	});
});

describe('the Overview carries Edit alone in its head [criterion:14a1164c]', () => {
	it('offers no + New evolution there: a new evolution starts from the Evolutions', () => {
		expect(read(OVERVIEW)).not.toContain('New evolution');
	});
});
