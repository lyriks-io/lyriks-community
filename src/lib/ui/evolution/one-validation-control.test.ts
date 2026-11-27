import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A person validates in their own box and nowhere else (criteria c035755f of Validate the elements of a
 * specification, f27ab2f8, a1ff3708, f56c25b5, c53c0474, 8ec8310b): no page draws a Validate or an Accept the code
 * change button beside the boxes, Knowledge, a request, Mismatch and Ask my AI included. Read from the sources the
 * pages are built from, tests left out. What stays apart is not a person's validation of an element: the ruling of
 * a comment's topic.
 */
const APART = new Set(['src/lib/ui/evolution/FieldThread.svelte']);

function sources(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.svelte$/.test(name) ? [path] : [];
	});
}

describe('no Validate button apart from the people [criterion:c035755f] [criterion:f27ab2f8] [criterion:a1ff3708] [criterion:f56c25b5] [criterion:c53c0474] [criterion:8ec8310b]', () => {
	it('draws no Validate, Validate the feature or Accept the code change button on any page', () => {
		const files = [...sources('src/lib/ui'), ...sources('src/routes'), ...sources('ee')].filter((file) => !APART.has(file));
		expect(files.length).toBeGreaterThan(200);
		const found = files.filter((file) => />\s*(Validate( the feature)?|Accept the code change)\s*<\/button\s*>/.test(readFileSync(file, 'utf8')));
		expect(found).toEqual([]);
	});
});
