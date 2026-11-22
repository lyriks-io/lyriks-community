import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { SRC, appFiles, parsed } from './source-lint';

/**
 * Architecture lints of what the whole app writes and does on screen, read on the parsed code (source-lint): the
 * strings a person may read, the scrolls Lyriks starts, the sizes its text takes. Comments are not code: they are
 * never read.
 */

const FILES = appFiles();
// The whole app is parsed once, up front: a few seconds.
beforeAll(() => void FILES.forEach(parsed), 120_000);

/**
 * The old words, as prose: never an identifier (readRetrospec, RETROSPEC_SECTION), an address or the skill id
 * (criterion 879950fb). The names that belong to code keep their spelling.
 */
const OLD_WORDS = /[Rr]etrospecifications?|RETROSPECIFICATIONS?|[Rr]etro-spec|(?<![\w$./'"`-])[Rr]etrospec(?= [a-z·])/;
const withoutCodeNames = (text: string) => text.replaceAll('lyriks-retrospec', '').replace(/\/retrospec\b/g, '');

describe('the words a person reads say Reverse-Specification [criterion:879950fb]', () => {
	it('writes no old word in any string or text of the app', () => {
		expect(FILES.length).toBeGreaterThan(1000);
		const offenders = FILES.map(parsed).flatMap((file) => file.strings.filter((s) => OLD_WORDS.test(withoutCodeNames(s.text))).map((s) => `${file.path}:${s.line}`));
		expect(offenders).toEqual([]);
	});
});

describe('reduced motion keeps the change, not the movement [criterion:da3bc837]', () => {
	it("never scrolls smoothly behind the reader's back: every scroll Lyriks starts asks scrollMotion", () => {
		const smooth = FILES.map(parsed)
			.filter((file) => file.path !== 'lib/ui/shell/scroll-motion.ts')
			.flatMap((file) => file.properties.filter((p) => p.key === 'behavior' && p.value === 'smooth').map((p) => `${file.path}:${p.line}`));
		expect(smooth).toEqual([]);
	});
});

describe("text follows the reader's own text size [criterion:5f3e9f45]", () => {
	const PX_CLASS = /\b(text|leading)-\[[0-9.]+px\]/;

	it("sizes Lyriks's own text relative to the reader's, the customer's renderings apart", () => {
		// The simulated customer screens draw the customer's own sizes (--sim-*), and the experience builder edits them.
		const own = FILES.filter((path) => !path.includes('/experience/builder/') && !readFileSync(path, 'utf8').includes('--sim-')).map(parsed);
		const fixed = own.flatMap((file) => [
			...file.strings.filter((s) => PX_CLASS.test(s.text)).map((s) => `${file.path}:${s.line}`),
			...file.declarations.filter((d) => d.property === 'font-size' && /\dpx\b/.test(d.value)).map((d) => `${file.path}:${d.line}`)
		]);
		expect(fixed).toEqual([]);
		const app = parsed(join(SRC, 'app.css'));
		expect(app.declarations.length).toBeGreaterThan(100);
		expect(app.declarations.filter((d) => d.property === 'font-size' && /\dpx\b/.test(d.value)).map((d) => `app.css:${d.line}`)).toEqual([]);
	});
});
