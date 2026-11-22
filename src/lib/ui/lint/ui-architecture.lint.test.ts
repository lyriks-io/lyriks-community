import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SRC, appFiles, parsed } from './source-lint';

/**
 * Architecture lints of the UI: rules that hold across every page, read on the parsed code (source-lint). What one
 * page shows is proved by rendering it; these say that no page breaks the rule.
 */

const SPEC_PAGES = [...appFiles(join(SRC, 'routes/projects/[projectId]/spec')), ...appFiles(join(SRC, 'lib/ui/spec360'))].filter((p) => p.endsWith('.svelte'));
const ASK_TOOL = 'lib/ui/spec360/page/AskAiTool.svelte';
const FILES = appFiles();
// The whole app is parsed once, up front: a few seconds.
beforeAll(() => void FILES.forEach(parsed), 120_000);

describe('one Ask my AI, in the navigation, for every page [criterion:44aa7b4f]', () => {
	it('has every page of the Specification 360° declare exactly one Ask my AI', () => {
		const heads = SPEC_PAGES.map(parsed).filter((file) => file.components.has('PageHead'));
		expect(heads.length).toBeGreaterThan(10);
		const uses = (file: (typeof heads)[number]) => file.components.get('AskAiTool')?.length ?? 0;
		const wrong = heads.filter((file) => uses(file) !== 1).map((file) => `${file.path}: ${uses(file)}`);
		expect(wrong).toEqual([]);
	});

	it("gives every other page of a project the project's own, which asks about the page itself [criterion:8f9301b8]", () => {
		const layout = parsed(join(SRC, 'routes/projects/[projectId]/+layout.svelte'));
		expect(layout.components.get('AskAiTool')).toEqual([['onPage']]);
	});

	it('labels nothing else Ask my AI or Ask your AI on those pages', () => {
		const offenders = SPEC_PAGES.map(parsed)
			.filter((file) => file.path !== ASK_TOOL)
			.flatMap((file) => file.strings.filter((s) => /^Ask (my|your) AI\b/.test(s.text.trim())).map((s) => `${file.path}:${s.line}`));
		expect(offenders).toEqual([]);
	});

	it("hands nothing of a block's comments to the AI [criterion:f7249f99]", () => {
		const threads = parsed(join(SRC, 'lib/ui/spec360/TopicThreads.svelte'));
		expect(threads.imports.filter((i) => /ai-session|\/ask\//.test(i.from))).toEqual([]);
		expect(threads.strings.filter((s) => s.text.includes('ask_block'))).toEqual([]);
	});
});

describe('Edit sits at the top of Knowledge, after DRAFT, and in no page of its own [criterion:41514698]', () => {
	it('is drawn by the band at the top of Knowledge alone', () => {
		const drawers = FILES.map(parsed)
			.filter((file) => file.imports.some((i) => /(^|\/)EditTool\.svelte$/.test(i.from)))
			.map((file) => file.path);
		expect(drawers).toEqual(['lib/ui/spec360/KnowledgeBar.svelte']);
	});
});
