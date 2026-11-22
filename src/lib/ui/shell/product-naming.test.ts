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
 * identifiers. That no string of the app says the old words is lint/app-text.lint.test.ts's.
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
});
