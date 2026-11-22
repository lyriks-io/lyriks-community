import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every control that validates a whole section reads Validate the whole section (EVO-009): no page of the product,
 * Community or Enterprise, says Validate all section. Read from the sources the pages are built from, tests left out.
 */
function sources(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.(svelte|ts)$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
	});
}

describe('no page of the product reads Validate all section [criterion:ac-leaf-2e64c72e-33e9-42a0-877d-51b24a7b3177]', () => {
	it('names no control Validate all section in the sources of the pages', () => {
		const files = [...sources('src'), ...sources('ee')];
		expect(files.length).toBeGreaterThan(100);
		const found = files.filter((file) => readFileSync(file, 'utf8').includes('Validate all section'));
		expect(found).toEqual([]);
	});
});
