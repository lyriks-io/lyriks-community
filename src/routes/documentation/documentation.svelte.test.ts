import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { DOC_TOPICS } from '$ui/docs/doc-topics';
import Page from './+page.svelte';

/** The Documentation as the server draws it, before any word is typed (criterion e3629a5f). */
const data = {
	currentProject: { id: 'kutt', name: 'Kutt' },
	onlineHelp: true,
	chrome: { progress: { retroDone: false, specVisited: true, evolutionStarted: false, evolutionVerified: false } }
} as never;
const html = render(Page, { props: { data } }).body;
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the Documentation of an installation that keeps its links in [criterion:b4538030]', () => {
	it('draws no way out, and keeps what is inside the product', () => {
		const shut = render(Page, { props: { data: { ...(data as object), onlineHelp: false } as never } }).body;
		expect(shut).not.toContain('get.lyriks.io/first-steps');
		expect(shut).not.toContain('data-help="tour"');
		expect(shut).toContain('data-help="first-steps"');
		expect(shut).toContain('data-help="feedback"');
	});
});

describe('the Documentation answers every kind of reader, in the look of the app [criterion:e3629a5f]', () => {
	it('opens on its name inside the app, with no banner of its own and no way back to the projects', () => {
		expect(html).toContain('>Documentation</h1>');
		expect(text).not.toContain('Back to projects');
		expect(html).not.toContain('gradient-violet');
	});

	it('holds Get help with First steps, Guided tour and Leave us feedback, the community hidden while its address is unknown', () => {
		expect(html).toContain('data-help="first-steps"');
		expect(html).toContain('data-help="tour"');
		expect(html).toContain('href="https://get.lyriks.io/first-steps"');
		expect(html).toContain('data-help="feedback"');
		expect(text).toContain('Leave us feedback');
		expect(html).not.toContain('data-help="community"');
	});

	it('draws every topic of the contents, each in the table of contents and as a section of its own', () => {
		for (const t of DOC_TOPICS) {
			expect(html).toContain(`data-doc-topic="${t.id}"`);
			expect(html).toContain(`href="#${t.id}"`);
		}
		for (const who of ['Product owner or analyst', 'Developer working with the MCP', 'Reviewer who validates', 'Administrator or operator']) expect(text).toContain(who);
	});

	it('names things as the app names them and lists only shortcuts the app answers', () => {
		expect(text).toContain('Reverse-Specification');
		expect(text).not.toMatch(/retro-?spec/i);
		expect(text).toContain('Health');
		expect(text).toContain('Knowledge');
		expect(text).not.toMatch(/Specification 360|Code drift|top of the page|Needs you/);
		expect(text).not.toMatch(/Ctrl-J|⌘J/);
		expect(text).toContain('claude mcp add --scope user --transport http lyriks');
	});
});

describe('the Editions section lists the four plans in the words of the Plans dialog [criterion:ac-leaf-313aafc6-77a7-4958-a1fc-e4870cd2bdea]', () => {
	it('names Community Edition, Solo Builder, Team and Enterprise with what each includes, and points to the Plans entry and the plans page', async () => {
		const { PLANS } = await import('$domain/tier/plans');
		const editions = text.slice(text.indexOf('Editions'));
		for (const plan of PLANS) {
			expect(editions).toContain(plan.name);
			expect(editions).toContain(plan.pitch);
		}
		expect(PLANS.map((p) => p.name)).toEqual(['Community Edition', 'Solo Builder', 'Team', 'Enterprise']);
		expect(editions).toContain('the Plans entry of the account menu');
		expect(html).toContain('href="https://lyriks.io/pricing"');
	});
});

describe('the Documentation says what the product does today', () => {
	it('says a validated specification changes through an evolution [criterion:71c9c06b]', () => {
		expect(text).toContain('A validated specification is no longer changed in place: a change to it goes through an evolution, in Changes. In place it still takes a decision on a point Lyriks noticed, an operations target, and cancelling a hand edit made earlier.');
		expect(text).not.toContain('A validated specification stays editable');
	});

	it('names the plans that open Changes and writes the change when it goes live [criterion:7af1087d]', () => {
		expect(text).toContain('Changes Solo Builder, Team and Enterprise. An evolution carries one change');
		expect(text).toContain('the change is then frozen as a numbered version the code is built and checked against, and written into the specification when it goes live, never before.');
		expect(text).toContain('and the hand edits a validated specification took before editing it in place was put on hold.');
	});

	it('points to the design system the Experience tab and the MCP offer [criterion:14ea2e54]', () => {
		expect(text).toContain('Your AI reads the same design system through the Lyriks MCP (get_design_system) to build the interface on-brand, and holds a design against it (check_design).');
		expect(text).not.toContain('the Design: the design.md');
	});
});
