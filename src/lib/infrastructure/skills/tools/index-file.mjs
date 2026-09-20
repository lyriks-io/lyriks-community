// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Finds, reads
// and rewrites the repository's implementation index, `.unspa.json`. Shared by
// check-index, ingest-results, sync-index and apply-batch so they agree on where
// the index is, on what its two historical shapes look like, and on how a
// rewrite keeps the file's own formatting. No dependencies, Node 18+.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const INDEX_FILE_NAME = '.unspa.json';

/** The nearest `.unspa.json`, walking up from `from`: a script run from a subfolder still finds it. */
export function findIndexFile(from = process.cwd()) {
	let dir = resolve(from);
	for (;;) {
		const candidate = join(dir, INDEX_FILE_NAME);
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * The parsed index file. `index` is the key to entry map: the `index` object of
 * the current format, or the whole document for an older bare map. `text` is
 * kept so a rewrite can detect the indentation the file was written with.
 */
export function loadIndexFile(from = process.cwd()) {
	const path = findIndexFile(from);
	if (!path) {
		throw new Error(`No ${INDEX_FILE_NAME} found in ${resolve(from)} or any parent folder.`);
	}
	const text = readFileSync(path, 'utf8');
	let doc;
	try {
		doc = JSON.parse(text);
	} catch (error) {
		throw new Error(`${path} is not valid JSON: ${error.message}`);
	}
	if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
		throw new Error(`${path} does not hold an index object.`);
	}
	const wrapped = doc.index && typeof doc.index === 'object' && !Array.isArray(doc.index);
	return {
		path,
		dir: dirname(path),
		text,
		doc,
		index: wrapped ? doc.index : doc,
		projectId: typeof doc.projectId === 'string' && doc.projectId.trim() ? doc.projectId.trim() : null
	};
}

/** The entries that are real index rows (an object), whatever else the document carries. */
export function indexEntries(index) {
	return Object.entries(index).filter(
		([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry)
	);
}

/**
 * Writes a loaded index back after its entries were edited in place (`index` is
 * a view into `doc`). Same indentation and same final newline as the file had,
 * so a rewrite shows up in a diff as the fields that changed and little else.
 */
export function writeIndexFile(loaded) {
	const indent = /^([ \t]+)"/m.exec(loaded.text)?.[1];
	const tail = loaded.text.endsWith('\n') ? '\n' : '';
	writeFileSync(loaded.path, JSON.stringify(loaded.doc, null, indent) + tail);
}
