import { describe, expect, it } from 'vitest';
import { sentenceLines } from './graph-sentence';

const joined = (lines: ReturnType<typeof sentenceLines>) => lines.map((l) => l.map((r) => r.text).join('')).join(' ');

describe('a rule of the request graph reads whole [criterion:ac-leaf-ac-evo-graph-ears]', () => {
	const sentence = 'When the user asks to place the order, if the basket count is 0, then the system shall refuse to place the order and show "Your basket is empty."';

	it('cuts the sentence into lines of whole words, and loses none of it', () => {
		const lines = sentenceLines(sentence, 40);
		expect(lines.length).toBeGreaterThan(2);
		for (const line of lines) expect(line.map((r) => r.text).join('').length).toBeLessThanOrEqual(40);
		expect(joined(lines)).toBe(sentence);
	});

	it('sets the EARS keywords apart, as the Features page does, and nothing in other text', () => {
		const keywords = sentenceLines(sentence, 40).flat().filter((r) => r.keyword).map((r) => r.text);
		expect(keywords).toEqual(['When', 'if', 'then', 'shall']);
		expect(sentenceLines('A slot keeps eight bags when it opens.', 40).flat().some((r) => r.keyword)).toBe(false);
	});

	it('never breaks a line on a no-break space', () => {
		const french = 'Le système doit garantir que «\u00a0subscription.itemCount\u00a0» est au plus 20.';
		const lines = sentenceLines(french, 30).map((l) => l.map((r) => r.text).join(''));
		expect(lines.some((l) => l.includes('«\u00a0subscription.itemCount\u00a0»'))).toBe(true);
		expect(lines.some((l) => l.endsWith('«'))).toBe(false);
		expect(lines.join(' ')).toBe(french);
	});

	it('keeps a word longer than a line on a line of its own', () => {
		expect(sentenceLines('a verylongwordthatdoesnotfit b', 10).map((l) => l.map((r) => r.text).join(''))).toEqual(['a', 'verylongwordthatdoesnotfit', 'b']);
	});
});
