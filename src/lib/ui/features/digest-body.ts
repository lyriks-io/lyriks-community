/**
 * Trims the engine's feature digest for display INSIDE the leaf drawer.
 *
 * The digest is a standalone document: it opens with the feature name as an H1
 * and its description as a blockquote. Both already head the drawer, so
 * rendering them again pushes the part that carries information (what the
 * feature actually does) below the fold. This drops that duplicated preamble
 * and nothing else: the digest stays the engine's text, never rewritten here.
 */
export function digestBody(markdown: string, name: string, description: string): string {
	const lines = markdown.split('\n');
	let i = 0;
	const isBlank = (line: string) => line.trim().length === 0;
	const same = (a: string, b: string) =>
		a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

	// A leading H1 that repeats the feature name (any H1 opening the document is
	// the digest's own title; a differing name still means the same thing).
	while (i < lines.length && isBlank(lines[i])) i += 1;
	if (i < lines.length && /^#\s+/.test(lines[i])) {
		const title = lines[i].replace(/^#\s+/, '');
		if (!name || same(title, name)) i += 1;
	}

	// Then a blockquote holding the description the drawer already shows.
	while (i < lines.length && isBlank(lines[i])) i += 1;
	const quoteStart = i;
	const quoted: string[] = [];
	while (i < lines.length && lines[i].trimStart().startsWith('>')) {
		quoted.push(lines[i].trimStart().replace(/^>\s?/, ''));
		i += 1;
	}
	if (quoted.length > 0 && description && !same(quoted.join(' '), description)) {
		i = quoteStart; // a blockquote saying something else is content, keep it
	}

	while (i < lines.length && isBlank(lines[i])) i += 1;
	return lines.slice(i).join('\n').trim();
}
