import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AiMessageText from './AiMessageText.svelte';

const ORIGIN = 'https://lyriks.example.com';
const html = (text: string) => render(AiMessageText, { props: { text, origin: ORIGIN } }).body;

describe('the words of my AI in a conversation [criterion:7f4690b0]', () => {
	it('opens a page of the installation it cites from its name', () => {
		const body = html('Approve it in [Verification](https://lyriks.example.com/projects/p/evolution?request=r&at=next-step).');
		expect(body).toMatch(/<a [^>]*href="\/projects\/p\/evolution\?request=r&amp;at=next-step"[^>]*>Verification<\/a>/);
		expect(body).toContain('Approve it in ');
		expect(body).not.toContain('](');
	});

	it('reads a link elsewhere as plain text, never as a link', () => {
		const body = html('See [the docs](https://example.com/docs).');
		expect(body).not.toContain('<a');
		expect(body).toContain('See the docs (https://example.com/docs).');
	});

	it('escapes what the AI wrote: a tag in its words reads as text', () => {
		const body = html('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
		expect(body).not.toContain('<img');
		expect(body).toContain('&lt;img');
		expect(body).not.toContain('href="javascript');
	});
});
