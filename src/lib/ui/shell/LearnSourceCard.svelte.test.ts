import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import LearnSourceCard from './LearnSourceCard.svelte';
import { LEARN_SOURCES, pickLearnSource } from './learn-sources';

/** The step 'How should Lyriks learn <product>?' of a new project from an existing product (feat-project-lifecycle). */

const card = (key: 'code' | 'docs' | 'manual', picked: boolean) =>
	render(LearnSourceCard, { props: { source: LEARN_SOURCES.find((s) => s.key === key)!, picked, onpick: () => {} } }).body;

describe('each way to learn an existing product says what it reads, and shows when it is picked [criterion:1ba1817e]', () => {
	it('lists the three ways in order, each with one line of what happens and the kinds of source it reads', () => {
		expect(LEARN_SOURCES.map((s) => [s.name, s.line, s.tags.join(', ')])).toEqual([
			['From a codebase', 'Your LLM reads the repository and Lyriks rebuilds the whole specification.', 'Code, Tests, Infrastructure'],
			['From anything else', 'Documents, even outdated, read by your LLM.', 'Word, PDF, Notion, Confluence, Tickets, Mock-ups'],
			['Manually', 'You describe the product section by section, with your LLM.', 'No source']
		]);
	});

	it('draws a card with its name, its line, its tags, and Recommended on the codebase alone', () => {
		const code = card('code', false);
		expect(code).toContain('From a codebase');
		expect(code).toContain('Your LLM reads the repository and Lyriks rebuilds the whole specification.');
		for (const tag of ['Code', 'Tests', 'Infrastructure']) expect(code).toContain(`>${tag}</span>`);
		expect(code).toContain('Recommended');
		expect(card('docs', false)).not.toContain('Recommended');
		expect(card('manual', false)).toContain('>No source</span>');
	});

	it('ticks its box in ink once picked, and leaves it empty otherwise', () => {
		const picked = card('docs', true);
		expect(picked).toContain('aria-pressed="true"');
		expect(picked).toContain('data-tick');
		expect(picked).toContain('bg-ink text-paper');
		const free = card('docs', false);
		expect(free).toContain('aria-pressed="false"');
		expect(free).not.toContain('data-tick');
		expect(free).toContain('bg-paper text-transparent');
	});

	it('picks code and documents together, and Manually alone', () => {
		const none = { code: false, docs: false, manual: false };
		const both = pickLearnSource(pickLearnSource(none, 'code'), 'docs');
		expect(both).toEqual({ code: true, docs: true, manual: false });
		expect(pickLearnSource(both, 'manual')).toEqual({ code: false, docs: false, manual: true });
		expect(pickLearnSource({ code: false, docs: false, manual: true }, 'code')).toEqual({ code: true, docs: false, manual: false });
		expect(pickLearnSource({ code: false, docs: false, manual: true }, 'manual')).toEqual(none);
	});
});
