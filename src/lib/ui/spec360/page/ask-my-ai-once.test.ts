import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ask my AI, in the navigation above Help & support, is the one way a page of
 * the Specification 360° asks the reader's own AI (criterion 44aa7b4f): every
 * page declares one, which shows in the navigation, and no other button on the
 * page reads Ask my AI or Ask your AI. A page that declares none gets the
 * project's own, which asks about the page itself (rule 8ddf1393). A block's
 * comments never hand a message to the AI: Ask my AI is the only place where
 * the AI is questioned (criterion f7249f99).
 */

const SRC = join(process.cwd(), 'src');
const SPEC_ROUTES = join(SRC, 'routes/projects/[projectId]/spec');
const SPEC_UI = join(SRC, 'lib/ui/spec360');

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return name.endsWith('.svelte') ? [path] : [];
	});
}

const read = (path: string) => readFileSync(path, 'utf8');
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('one Ask my AI, in the navigation, for every page [criterion:44aa7b4f]', () => {
	it('shows the Ask my AI a page declares in the navigation, right above Help & support', () => {
		const tool = read(join(SPEC_UI, 'page/AskAiTool.svelte'));
		expect(tool).toContain('{@attach onPage ? intoSideAskElse : intoSideAsk}');
		const foot = read(join(SRC, 'lib/ui/shell/SideFoot.svelte'));
		const slot = foot.indexOf('<div id={SIDE_ASK_ID}');
		expect(slot).toBeGreaterThan(-1);
		expect(foot.indexOf('<HelpMenu', slot)).toBeGreaterThan(slot);
		expect(foot.slice(slot, foot.indexOf('<HelpMenu', slot))).not.toMatch(/<[A-Z]/);
	});

	it('keeps Ask my AI in the navigation on every page: about the page itself elsewhere in a project, greyed outside one [criterion:8f9301b8]', () => {
		const foot = read(join(SRC, 'lib/ui/shell/SideFoot.svelte'));
		expect(foot).toContain('<div id={SIDE_ASK_ELSE_ID}></div>');
		expect(read(join(SRC, 'routes/projects/[projectId]/+layout.svelte'))).toContain('<AskAiTool onPage />');
		expect(foot).toContain('aria-disabled="true" data-tip="Ask my AI: open a project first"');
		expect(foot).toContain('.lk-side #side-ask:not(:empty) + .side-ask-else');
		const tool = read(join(SPEC_UI, 'page/AskAiTool.svelte'));
		expect(tool).toContain("{ title: pageTitle(document.title), href }");
		expect(tool).toContain('class="si ask-row"');
		expect(tool).not.toContain('BEVEL');
	});

	it('has every page of the Specification 360° declare exactly one Ask my AI', () => {
		const heads = [...svelteFiles(SPEC_ROUTES), ...svelteFiles(SPEC_UI)].filter((path) => read(path).includes('<PageHead'));
		expect(heads.length).toBeGreaterThan(10);
		const wrong = heads.map((path) => ({ page: relative(SRC, path), asks: count(read(path), '<AskAiTool') })).filter((p) => p.asks !== 1);
		expect(wrong).toEqual([]);
	});

	it('writes no other Ask my AI or Ask your AI button on those pages', () => {
		// AskAiTool is the navigation's button, the only one.
		const allowed = new Set(['page/AskAiTool.svelte'].map((p) => join(SPEC_UI, p)));
		const label = /(>|['"])\s*(<[^>]+>\s*)*Ask (my|your) AI\b/;
		const markup = (text: string) => text.replace(/<script[\s\S]*?<\/script>/, '').replace(/<!--[\s\S]*?-->/g, '');
		const offenders = [...svelteFiles(SPEC_ROUTES), ...svelteFiles(SPEC_UI)]
			.filter((path) => !allowed.has(path) && label.test(markup(read(path))))
			.map((path) => relative(SRC, path));
		expect(offenders).toEqual([]);
	});

	it("hands nothing of a block's comments to the AI [criterion:f7249f99]", () => {
		const threads = read(join(SPEC_UI, 'TopicThreads.svelte'));
		expect(threads).not.toContain('useProjectAiSession');
		expect(threads).not.toContain('ask_block');
	});
});
