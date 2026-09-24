/**
 * Text between quotation marks is a citation of what the product or a source
 * says, and the vocabulary of the project does not govern it (aab20171). It is
 * blanked before the words are matched, so a quoted state such as "in progress"
 * is never flagged.
 */
export function withoutQuotations(value: string): string {
	return value.replace(/"[^"\n]*"|\u201c[^\u201d\n]*\u201d|\u00ab[^\u00bb\n]*\u00bb/g, (quoted) => ' '.repeat(quoted.length));
}
