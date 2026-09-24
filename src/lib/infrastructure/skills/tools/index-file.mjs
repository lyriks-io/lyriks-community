#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Finds, reads
// and rewrites the repository's implementation index, `.unspa.json`. Shared by
// check-index, ingest-results, sync-index and apply-batch so they agree on where
// the index is, on what its two historical shapes look like, and on how a
// rewrite keeps the file's own formatting. Also the command that edits it:
//   node .lyriks/tools/index-file.mjs upsert <entries.json | -> [--sync [--feature <featureId>]] [--project <id>] [--dry-run] [--json]
//   node .lyriks/tools/index-file.mjs remove <key...> [--sync --feature <featureId>] [--project <id>] [--dry-run] [--json]
//   node .lyriks/tools/index-file.mjs set-project <id>
// (see index-command.mjs). Never rewrite the index with another tool: a
// re-serialized file changes every line it holds. No dependencies, Node 18+.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editObject, memberObject } from './index-text.mjs';

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
 * Writes a loaded index back after its entries (or the document's own fields)
 * were edited in place (`index` is a view into `doc`). Only what changed is
 * rewritten: every other entry keeps its exact bytes, and a new or changed one
 * is written in the style of its neighbours, so a rewrite shows up in a diff as
 * the entries that changed and nothing else.
 */
export function writeIndexFile(loaded) {
	const before = JSON.parse(loaded.text);
	const wrapped = loaded.index !== loaded.doc;
	const root = loaded.text.search(/\S/);
	let text = loaded.text;
	// The index object first: editing it leaves the offsets of the root intact
	// up to its own opening brace, and the root is re-read afterwards.
	if (wrapped) {
		const at = memberObject(text, root, 'index');
		const beforeIndex = before.index && typeof before.index === 'object' ? before.index : {};
		if (at) text = editObject(text, at.open, at.indent, changesBetween(beforeIndex, loaded.index));
	}
	text = editObject(text, root, '', changesBetween(before, loaded.doc, wrapped ? 'index' : null));
	// Never write a file that no longer reads back as the index it was meant to be.
	if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(loaded.doc)) {
		const indent = /^([ \t]+)"/m.exec(loaded.text)?.[1];
		text = JSON.stringify(loaded.doc, null, indent) + (loaded.text.endsWith('\n') ? '\n' : '');
	}
	writeFileSync(loaded.path, text);
	loaded.text = text;
}

/** The members of `after` that differ from `before` (`set`) or left it (`remove`), `skip` aside. */
function changesBetween(before, after, skip = null) {
	const set = new Map();
	const remove = new Set();
	for (const [key, value] of Object.entries(after)) {
		if (key !== skip && JSON.stringify(value) !== JSON.stringify(before[key])) set.set(key, value);
	}
	for (const key of Object.keys(before)) if (key !== skip && !(key in after)) remove.add(key);
	return { set, remove };
}

/** True when this module is the script node was asked to run, not an import of it. */
export function isMainModule(url) {
	if (!process.argv[1]) return false;
	try {
		return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
	} catch {
		return false;
	}
}

if (isMainModule(import.meta.url)) {
	import('./index-command.mjs').then(({ runIndexCommand }) => runIndexCommand(process.argv.slice(2)));
}
