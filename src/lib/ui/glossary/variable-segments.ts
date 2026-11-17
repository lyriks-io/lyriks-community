import { segmentText, type GlossaryTerm, type Mark } from '$domain/glossary';
import type { VariableHint } from '$domain/rules';

export interface DecoratedSegment {
	readonly text: string;
	readonly offset: number;
	readonly mark?: Mark;
	readonly identifiers?: readonly string[];
	readonly definitions?: readonly Mark[];
}

/** Variables and glossary definitions share one target where their spans overlap. */
export function variableSegments(text: string, terms: GlossaryTerm[], hints: readonly VariableHint[]): DecoratedSegment[] {
	let offset = 0;
	const glossary = segmentText(text, terms).map((segment) => {
		const at = offset;
		offset += segment.text.length;
		return { ...segment, start: at, end: offset };
	});
	if (!hints.length) return glossary.map((part) => ({ text: part.text, offset: part.start, ...(part.mark ? { mark: part.mark } : {}) }));
	const variables = hints.filter((hint) => Number.isInteger(hint.start) && Number.isInteger(hint.end) && hint.start >= 0 && hint.end > hint.start && hint.end <= text.length && hint.identifiers.length)
		.toSorted((a, b) => a.start - b.start);
	const result: DecoratedSegment[] = [];
	let cursor = 0;
	let index = 0;
	let glossaryIndex = 0;
	while (cursor < text.length) {
		while (index < variables.length && variables[index].start < cursor) index++;
		const variable = variables[index];
		if (variable?.start === cursor) {
			const definitions = glossary.filter((part) => part.mark && part.start < variable.end && part.end > cursor)
				.map((part) => part.mark!);
			result.push({ text: text.slice(cursor, variable.end), offset: cursor, identifiers: variable.identifiers, definitions });
			cursor = variable.end;
			index++;
		} else {
			while (glossary[glossaryIndex].end <= cursor) glossaryIndex++;
			const part = glossary[glossaryIndex];
			const end = Math.min(part.end, variable?.start ?? text.length);
			result.push({ text: text.slice(cursor, end), offset: cursor, ...(part.mark ? { mark: part.mark } : {}) });
			cursor = end;
		}
	}
	return result;
}
