import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A save made under an expected revision answers null when the section moved
 * meanwhile: nothing was written. Ignoring that answer reports a write that
 * never happened (the held index entries of an Evolution request were lost
 * that way). Every such save must use what it answers.
 */
function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
	});
}

describe('a save under an expected revision is never ignored', () => {
	it('uses the answer of every save that names a revision', () => {
		const ignored: string[] = [];
		for (const file of [...sources('src/lib'), ...sources('src/routes')]) {
			const lines = readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, i) => {
				const statement = line.trim();
				const saves = /\.(save\w*|execute)\(.*expectedRevision:\s*(?!null)\w/.test(statement);
				const bare = /^await\s/.test(statement);
				if (saves && bare) ignored.push(`${file}:${i + 1}: ${statement}`);
			});
		}
		expect(ignored, 'A save under a revision answers null when refused: check it, retry or report it.').toEqual([]);
	});
});
