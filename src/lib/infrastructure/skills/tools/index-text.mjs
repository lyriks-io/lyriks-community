// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Rewrites the
// members of one JSON object inside the text of `.unspa.json` without touching
// anything else: every member that did not change keeps its bytes, and a new or
// replaced one is written in the style of its neighbours (same indentation,
// same line ending, one line or several). A 6,000-entry index that gains eight
// entries shows up in a diff as eight entries. No dependencies, Node 18+.

const isSpace = (char) => char === ' ' || char === '\t' || char === '\n' || char === '\r';

function skipSpace(text, i) {
	while (i < text.length && isSpace(text[i])) i += 1;
	return i;
}

function skipString(text, i) {
	for (i += 1; i < text.length; i += 1) {
		if (text[i] === '\\') i += 1;
		else if (text[i] === '"') return i + 1;
	}
	throw new Error('Unterminated string in the index file.');
}

/** The end (exclusive) of the JSON value that starts at `i`. */
function skipValue(text, i) {
	const first = text[i];
	if (first === '"') return skipString(text, i);
	if (first !== '{' && first !== '[') {
		while (i < text.length && !isSpace(text[i]) && !',}]'.includes(text[i])) i += 1;
		return i;
	}
	let depth = 0;
	for (; i < text.length; i += 1) {
		const char = text[i];
		if (char === '"') i = skipString(text, i) - 1;
		else if (char === '{' || char === '[') depth += 1;
		else if (char === '}' || char === ']') {
			depth -= 1;
			if (depth === 0) return i + 1;
		}
	}
	throw new Error('Unterminated object or array in the index file.');
}

/** The members of the object whose `{` is at `open`: key and value spans, in file order. */
export function objectMembers(text, open) {
	if (text[open] !== '{') throw new Error('The index file does not hold an object where one was expected.');
	const members = [];
	let i = skipSpace(text, open + 1);
	if (text[i] === '}') return { open, close: i, members };
	for (;;) {
		const keyStart = i;
		const keyEnd = skipString(text, i);
		const valueStart = skipSpace(text, skipSpace(text, keyEnd) + 1);
		const valueEnd = skipValue(text, valueStart);
		members.push({ key: JSON.parse(text.slice(keyStart, keyEnd)), keyStart, keyEnd, valueStart, valueEnd });
		i = skipSpace(text, valueEnd);
		if (text[i] === '}') return { open, close: i, members };
		if (text[i] !== ',') throw new Error(`Unexpected "${text[i]}" in the index file at offset ${i}.`);
		i = skipSpace(text, i + 1);
	}
}

/** The indentation of the line `pos` sits on, when only indentation precedes it. */
function lineIndent(text, pos) {
	let i = pos;
	while (i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) i -= 1;
	return i === 0 || text[i - 1] === '\n' ? text.slice(i, pos) : '';
}

/** One line, spaced the way `{ "a": 1, "b": [1, 2] }` is. */
function inline(value) {
	if (Array.isArray(value)) return value.length ? `[${value.map((item) => inline(item ?? null)).join(', ')}]` : '[]';
	if (value && typeof value === 'object') {
		const members = Object.entries(value).filter(([, item]) => item !== undefined);
		return members.length ? `{ ${members.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }` : '{}';
	}
	return JSON.stringify(value);
}

/** `value` written like `sample` (a value already in the file) on a line indented by `indent`. */
function serialize(value, sample, style, indent) {
	// An empty object or list says nothing about how a full one is written.
	if (sample !== null && /^[{[]\s*[}\]]$/.test(sample)) sample = null;
	if (sample !== null && !sample.includes('\n')) return /[:,] /.test(sample) ? inline(value) : JSON.stringify(value);
	if (sample === null && !style.unit) return JSON.stringify(value);
	return JSON.stringify(value, null, style.unit || '  ').split('\n').join(style.eol + indent);
}

/** The file's line ending and indentation unit (none for a one-line file). */
export function textStyle(text) {
	return { eol: text.includes('\r\n') ? '\r\n' : '\n', unit: /^([ \t]+)"/m.exec(text)?.[1] ?? '' };
}

/**
 * The text with the object at `open` rewritten: `set` (key to value) replaces a
 * member in place or appends it, `remove` drops members. Untouched members, and
 * the space around them, keep their exact bytes. `parentIndent` is the
 * indentation of the line the object opens on.
 */
export function editObject(text, open, parentIndent, { set = new Map(), remove = new Set() }) {
	const style = textStyle(text);
	const { close, members } = objectMembers(text, open);
	const first = members[0];
	const last = members[members.length - 1];
	const memberIndent = first ? lineIndent(text, first.keyStart) : parentIndent + style.unit;
	const multiLine = first ? text.slice(open, first.keyStart).includes('\n') : Boolean(style.unit);
	const separator = members.length > 1 ? text.slice(members[0].valueEnd, members[1].keyStart) : multiLine ? `,${style.eol}${memberIndent}` : ', ';
	const colon = first ? text.slice(first.keyEnd, first.valueStart) : ': ';
	const sample = last ? text.slice(last.valueStart, last.valueEnd) : null;

	const parts = [];
	const seen = new Set();
	for (const member of members) {
		seen.add(member.key);
		if (remove.has(member.key)) continue;
		if (!set.has(member.key)) {
			parts.push(text.slice(member.keyStart, member.valueEnd));
			continue;
		}
		const own = text.slice(member.valueStart, member.valueEnd);
		const value = serialize(set.get(member.key), own, style, lineIndent(text, member.keyStart));
		parts.push(text.slice(member.keyStart, member.valueStart) + value);
	}
	for (const [key, value] of set) {
		if (!seen.has(key)) parts.push(JSON.stringify(key) + colon + serialize(value, sample, style, memberIndent));
	}
	if (parts.length === 0) return `${text.slice(0, open)}{}${text.slice(close + 1)}`;
	const head = first ? text.slice(open + 1, first.keyStart) : multiLine ? style.eol + memberIndent : ' ';
	const tail = last ? text.slice(last.valueEnd, close) : multiLine ? style.eol + parentIndent : ' ';
	return text.slice(0, open + 1) + head + parts.join(separator) + tail + text.slice(close);
}

/** Where the object of member `key` of the object at `open` starts, and its line's indentation. */
export function memberObject(text, open, key) {
	const member = objectMembers(text, open).members.find((candidate) => candidate.key === key);
	if (!member || text[member.valueStart] !== '{') return null;
	return { open: member.valueStart, indent: lineIndent(text, member.keyStart) };
}
