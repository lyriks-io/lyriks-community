import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pausedRetrospecLabel } from '$domain/retrospec';
import { resumeRetrospecPrompt, retrospecPrompt } from '$domain/retrospec';
import { pageEntries } from './app-search';
import { projectNavTabs } from './app-nav';

/**
 * The product names the rebuilding of a specification from an existing product
 * Reverse-Specification, everywhere a person reads it or pastes it (criterion
 * 879950fb). The names that belong to code keep their spelling: the
 * lyriks-retrospec skill a prompt names, the /retrospec addresses, the
 * identifiers.
 */

/** The old words, as prose: never an identifier (readRetrospec, RETROSPEC_SECTION), an address or the skill id. */
const OLD_WORDS = /[Rr]etrospecifications?|RETROSPECIFICATIONS?|[Rr]etro-spec|(?<![\w$./'"`-])[Rr]etrospec(?= [a-z·])/;
const withoutCodeNames = (text: string) => text.replaceAll('lyriks-retrospec', '').replace(/\/retrospec\b/g, '');

describe('the words a person reads say Reverse-Specification [criterion:879950fb]', () => {
	it('names the page short in the navigation and the search, whole in the paused run (the top bar names no trail there, criterion 8a6a568b)', () => {
		expect(projectNavTabs('kutt', null).find((t) => t.id === 'retro')?.label).toBe('Reverse');
		expect(pageEntries('kutt').find((e) => e.href.endsWith('/retrospec'))?.t).toBe('Reverse');
		expect(pausedRetrospecLabel(33)).toBe('Reverse-Specification paused · 33 %');
	});

	it('hands prompts that say Reverse-Specification and keep the skill they name', () => {
		const resume = resumeRetrospecPrompt('repo', 'VLC', 'vlc-964631');
		expect(resume).toContain('resume the Reverse-Specification of VLC');
		expect(resume).toContain('following the lyriks-retrospec skill');
		for (const prompt of [resume, retrospecPrompt('repo', 'VLC', 'vlc-964631'), retrospecPrompt('docs', 'VLC', 'vlc-964631')])
			expect(withoutCodeNames(prompt)).not.toMatch(OLD_WORDS);
	});

	it('writes no old word in the text of the app, comments aside', () => {
		const root = join(process.cwd(), 'src');
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) {
					// The Enterprise overlay is a linked copy of ee/, scanned at its source when it is linked.
					if (relative(root, path) !== join('lib', 'ee')) walk(path);
				} else if (/\.(svelte|ts)$/.test(name) && !name.endsWith('.test.ts')) files.push(path);
			}
		};
		walk(root);
		expect(files.length).toBeGreaterThan(1000);
		const offenders = files.flatMap((file) =>
			readFileSync(file, 'utf8')
				// Comments explain the code to its readers, never to a person using the app.
				.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
				.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''))
				.split('\n')
				.map((line, i) => ({ line: line.replace(/(^|[^:'"`])\/\/.*$/, '$1'), at: `${relative(root, file)}:${i + 1}` }))
				.filter(({ line }) => OLD_WORDS.test(withoutCodeNames(line)))
				.map(({ at }) => at)
		);
		expect(offenders).toEqual([]);
	});
});
