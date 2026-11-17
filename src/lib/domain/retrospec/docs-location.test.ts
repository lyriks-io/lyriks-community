import { describe, expect, it } from 'vitest';
import { applyRetrospecAct, type ActContext } from './acts';
import { emptyRetrospecDocument } from './document';
import { DEFAULT_DOCS_LOCATION, docsRefusal, linkLines, parseDocsLocation, sortLinks } from './docs-location';
import { resumeRetrospecPrompt, retrospecPrompt } from './source-prompt';

const ana = { id: 'ana@x.io', name: 'Ana P.' };
const ctx: ActContext = { actor: ana, now: '2026-11-05T10:00:00.000Z' };
const confluence = 'https://quillstack.atlassian.net/wiki/spaces/PS/overview';

describe('the documentation is read on this computer or from links the LLM can open [criterion:b6ad9ca2]', () => {
	it('reads on this computer by default, in the repository the LLM runs in', () => {
		const prompt = retrospecPrompt('docs', 'Quillstack', 'quillstack-bdf036');
		expect(DEFAULT_DOCS_LOCATION.from).toBe('computer');
		expect(prompt).toContain('The documentation is on this computer, in the repository you run in');
		expect(prompt).toContain('with its text stored (attach_source), never a local path as its address');
	});

	it('names the folder the person gave', () => {
		const prompt = retrospecPrompt('both', 'Quillstack', 'p', null, { from: 'computer', folder: '~/Documents/Quillstack', links: [] });
		expect(prompt).toContain('in the folder ~/Documents/Quillstack');
		expect(prompt).toContain('adopt this entire codebase');
		expect(prompt).not.toContain('the ones connected to you');
	});

	it('lists only the web addresses, asks the AI to name a link it cannot open, and registers each with its address', () => {
		const at = { from: 'links' as const, folder: '', links: linkLines(`${confluence}\n\nC:\\Docs\\spec.pdf\n${confluence}`) };
		const { web, refused } = sortLinks(at.links);
		expect(web).toEqual([confluence]);
		expect(refused).toEqual(['C:\\Docs\\spec.pdf']);
		const prompt = retrospecPrompt('docs', 'Quillstack', 'p', null, at);
		expect(prompt).toContain(`The documentation is at these links: ${confluence}.`);
		expect(prompt).not.toContain('spec.pdf');
		expect(prompt).toContain('for a link you cannot open, say so and name it, never guess what it says');
		expect(prompt).toContain('with its web address');
	});

	it('withholds the prompt while Links holds no web address', () => {
		expect(docsRefusal({ from: 'links', folder: '', links: [] })).toBe('Add at least one link your LLM can open, or choose On this computer.');
		expect(docsRefusal({ from: 'links', folder: '', links: ['file:///home/me/spec.pdf'] })).not.toBeNull();
		expect(docsRefusal({ from: 'links', folder: '', links: [confluence] })).toBeNull();
		expect(docsRefusal({ from: 'computer', folder: '', links: [] })).toBeNull();
	});

	it('reads the same place on a complementary run and on a resumed one', () => {
		const at = { from: 'links' as const, folder: '', links: [confluence] };
		expect(retrospecPrompt('docs', 'Quillstack', 'p', { fromCommit: null, handEdits: 0 }, at)).toContain(`at these links: ${confluence}`);
		expect(resumeRetrospecPrompt('docs', 'Quillstack', 'p', at)).toContain(`at these links: ${confluence}`);
		expect(resumeRetrospecPrompt('repo', 'Quillstack', 'p', at)).not.toContain('links');
	});

	it('keeps the choice with the run until the prompt runs, and only when the documentation is read', () => {
		const started = applyRetrospecAct(emptyRetrospecDocument(), { op: 'start', mode: 'docs', baseline: {} }, ctx);
		if (!started.ok) throw new Error(started.reason);
		const at = parseDocsLocation({ from: 'links', links: [confluence] });
		const chosen = applyRetrospecAct(started.doc, { op: 'choose_docs', at }, ctx);
		if (!chosen.ok) throw new Error(chosen.reason);
		expect(chosen.doc.runs.at(-1)?.docsAt).toEqual({ from: 'links', folder: '', links: [confluence] });

		const launched = applyRetrospecAct(chosen.doc, { op: 'launch' }, ctx);
		if (!launched.ok) throw new Error(launched.reason);
		expect(applyRetrospecAct(launched.doc, { op: 'choose_docs', at }, ctx)).toMatchObject({ ok: false, reason: 'Where the documentation is can only change before the prompt runs.' });

		const code = applyRetrospecAct(emptyRetrospecDocument(), { op: 'start', mode: 'repo', baseline: {} }, ctx);
		if (!code.ok) throw new Error(code.reason);
		expect(applyRetrospecAct(code.doc, { op: 'choose_docs', at }, ctx)).toMatchObject({ ok: false, reason: 'Tick Documentation first.' });
	});
});
