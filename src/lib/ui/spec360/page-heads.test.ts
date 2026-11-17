import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return name.endsWith('.svelte') ? [path] : [];
	});
}

describe('a page of the Specification 360° carries no speech mark among its head\'s tools [criterion:14a1164c]', () => {
	it('draws no speech mark with a count among the tools of any head', () => {
		expect(existsSync(join(SRC, 'lib/ui/spec360/page/CommentsTool.svelte'))).toBe(false);
		const offenders = svelteFiles(SRC).filter((p) => readFileSync(p, 'utf8').includes('CommentsTool'));
		expect(offenders).toEqual([]);
	});
});
