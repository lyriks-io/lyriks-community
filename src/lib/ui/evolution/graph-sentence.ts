import { readsAsEars, splitEarsKeywords } from '$domain/rules';

export interface SentenceRun {
	readonly text: string;
	readonly keyword: boolean;
}

/**
 * A rule's sentence cut into the lines of its box in the request's graph
 * (ac-evo-graph-ears): whole words only, at most `width` characters a line,
 * never cut short. An EARS sentence keeps its keywords apart, the way the
 * Features page sets them in bold; any other text reads as it is.
 */
export function sentenceLines(text: string, width: number): SentenceRun[][] {
	const keywords: (readonly [number, number])[] = [];
	if (readsAsEars(text)) {
		let at = 0;
		for (const run of splitEarsKeywords(text)) {
			if (run.keyword) keywords.push([at, at + run.text.length]);
			at += run.text.length;
		}
	}
	const isKeyword = (i: number) => keywords.some(([from, to]) => i >= from && i < to);
	const lines: SentenceRun[][] = [];
	let line: SentenceRun[] = [];
	let length = 0;
	const put = (text: string, keyword: boolean) => {
		const last = line.at(-1);
		if (last && last.keyword === keyword) line[line.length - 1] = { text: last.text + text, keyword };
		else line.push({ text, keyword });
	};
	// A no-break space (French puts one inside « » and before a colon) never ends a line.
	for (const word of text.matchAll(/[^ \t\n\r]+/g)) {
		if (length > 0 && length + 1 + word[0].length > width) {
			lines.push(line);
			line = [];
			length = 0;
		}
		if (length > 0) {
			put(' ', false);
			length += 1;
		}
		for (let i = 0; i < word[0].length; i++) put(word[0][i], isKeyword((word.index ?? 0) + i));
		length += word[0].length;
	}
	if (line.length > 0) lines.push(line);
	return lines;
}
