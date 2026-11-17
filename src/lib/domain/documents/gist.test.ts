import { describe, expect, it } from 'vitest';
import { firstSentence, sourceGist } from './gist';

describe('firstSentence', () => {
	it('stops at the first sentence end', () => {
		expect(firstSentence('Users drop off at checkout. Most on mobile.')).toBe(
			'Users drop off at checkout.'
		);
	});

	it('does not cut on a dot inside a word or a version', () => {
		expect(firstSentence('Release v2.1 ships in May. Then v3.')).toBe('Release v2.1 ships in May.');
	});

	it('keeps a text with no sentence end whole, on one line', () => {
		expect(firstSentence('  Ops lead\ninterview  ')).toBe('Ops lead interview');
	});

	it('clips a run-on sentence', () => {
		const long = 'word '.repeat(80);
		const gist = firstSentence(long);
		expect(gist.length).toBeLessThanOrEqual(220);
		expect(gist.endsWith('…')).toBe(true);
	});
});

describe('sourceGist', () => {
	it('reads the note first', () => {
		expect(sourceGist({ note: 'Art. 17 grants erasure. More below.', url: 'https://x.eu' })).toBe(
			'Art. 17 grants erasure.'
		);
	});

	it('falls back to the address when there are no words', () => {
		expect(sourceGist({ note: '', url: 'https://x.eu/gdpr' })).toBe('https://x.eu/gdpr');
	});

	it('never shows an inline file payload', () => {
		expect(sourceGist({ note: '', url: 'data:application/pdf;base64,AAAA' })).toBe('');
	});
});
