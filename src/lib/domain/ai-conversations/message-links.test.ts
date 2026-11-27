import { describe, expect, it } from 'vitest';
import { installationPath, messageSegments, messageWords } from './message-links';

const ORIGIN = 'https://lyriks.example.com';

describe('a page my AI cites in a conversation is a link to it [criterion:7f4690b0]', () => {
	it('reads [name](address) of this installation as the name, opening its page', () => {
		expect(messageSegments('Open [EVO-016](https://lyriks.example.com/projects/p/evolution?request=r&at=next-step) and approve.', ORIGIN)).toEqual([
			{ text: 'Open ' },
			{ text: 'EVO-016', href: '/projects/p/evolution?request=r&at=next-step' },
			{ text: ' and approve.' }
		]);
		expect(messageSegments('See [Verification](/projects/p/evolution?request=r#verification).', ORIGIN)).toEqual([
			{ text: 'See ' },
			{ text: 'Verification', href: '/projects/p/evolution?request=r#verification' },
			{ text: '.' }
		]);
	});

	it('reads a bare address of this installation as a link, the end of the sentence left out of it', () => {
		expect(messageSegments('It is here: https://lyriks.example.com/projects/p/ask?c=1.\nThen reload.', ORIGIN)).toEqual([
			{ text: 'It is here: ' },
			{ text: 'https://lyriks.example.com/projects/p/ask?c=1', href: '/projects/p/ask?c=1' },
			{ text: '.\nThen reload.' }
		]);
	});

	it('reads a link to anywhere else as plain text, its name followed by its address', () => {
		expect(messageSegments('Read [the docs](https://example.com/docs) or https://example.com/x.', ORIGIN)).toEqual([
			{ text: 'Read the docs (https://example.com/docs) or https://example.com/x.' }
		]);
	});

	it('never makes a link of an address a browser reads as another host or a script', () => {
		for (const address of ['//evil.test/x', '/\\evil.test/x', 'javascript:alert(1)', 'http://lyriks.example.com/projects/p']) {
			expect(installationPath(address, ORIGIN)).toBeNull();
			expect(messageSegments(`[here](${address})`, ORIGIN).some((s) => s.href)).toBe(false);
		}
	});

	it('keeps a message without links as one run of text, its lines included', () => {
		expect(messageSegments('Line one\nline two', ORIGIN)).toEqual([{ text: 'Line one\nline two' }]);
		expect(messageSegments('', ORIGIN)).toEqual([]);
	});

	it('reads the names alone for a title, a notice or a topic', () => {
		expect(messageWords('Approve [EVO-016](/projects/p/evolution?request=r) in [Verification](https://lyriks.example.com/x).')).toBe('Approve EVO-016 in Verification.');
	});
});
