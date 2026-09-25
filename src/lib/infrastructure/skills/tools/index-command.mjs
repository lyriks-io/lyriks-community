// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). The commands
// of `node .lyriks/tools/index-file.mjs`, which edit `.unspa.json` the one way
// that keeps its formatting (see index-text.mjs):
//   upsert <entries.json | -> [--sync [--feature <featureId>]] [--project <id>] [--dry-run] [--json] [--url URL] [--token TOKEN]
//       adds or replaces entries by key. The file holds `{ "<key>": { entry } }`
//       or `{ "index": { ... } }`.
//   remove <key...> [--sync --feature <featureId>] [--project <id>] [--dry-run] [--json]
//       drops the entries of renamed or removed elements.
//   set-project <id>
//       corrects the projectId the index names.
// --sync then sends what changed to sync_implementation_index. Criterion keys
// travel alone. Any other key belongs to an action or a surface, which the
// engine replaces WITH all of its children: those go as the whole slice of
// --feature, never as a few loose keys. Not run directly: index-file.mjs is.
import { readFileSync } from 'node:fs';
import { indexEntries, loadIndexFile, writeIndexFile } from './index-file.mjs';
import { printProjectWarnings, resolveProject } from './index-project.mjs';

const USAGE = [
	'Usage: node .lyriks/tools/index-file.mjs upsert <entries.json | -> [--sync [--feature <featureId>]] [--project <id>] [--dry-run] [--json]',
	'       node .lyriks/tools/index-file.mjs remove <key...> [--sync --feature <featureId>] [--project <id>] [--dry-run] [--json]',
	'       node .lyriks/tools/index-file.mjs set-project <id>'
].join('\n');
const KEY = /^[a-z_]+:\S/;
const isEntry = (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);

/** The entries of an upsert file: a bare key map, or one holding `index`. */
function readEntries(source) {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(source === '-' ? 0 : source, 'utf8'));
	} catch (error) {
		throw new Error(`${source === '-' ? 'stdin' : source} cannot be read as JSON: ${error.message}`);
	}
	const map = isEntry(parsed?.index) ? parsed.index : parsed;
	if (!isEntry(map)) throw new Error(`${source} holds no entries: expected { "<key>": { ... } } or { "index": { ... } }.`);
	const entries = Object.entries(map);
	const bad = entries.filter(([key, entry]) => !KEY.test(key) || !isEntry(entry)).map(([key]) => key);
	if (bad.length > 0) throw new Error(`Not an index entry (a key like action:<id> holding an object): ${bad.join(', ')}.`);
	if (entries.length === 0) throw new Error(`${source} holds no entries.`);
	return entries;
}

/** Applies the command to the loaded index in place and says what each key became. */
function edit(loaded, command, upserts, removals) {
	const outcome = { added: [], replaced: [], unchanged: [], removed: [], absent: [] };
	if (command === 'upsert') {
		for (const [key, entry] of upserts) {
			const had = loaded.index[key];
			const kind = had === undefined ? 'added' : JSON.stringify(had) === JSON.stringify(entry) ? 'unchanged' : 'replaced';
			outcome[kind].push(key);
			loaded.index[key] = entry;
		}
	} else {
		for (const key of removals) {
			if (loaded.index[key] === undefined) outcome.absent.push(key);
			else {
				delete loaded.index[key];
				outcome.removed.push(key);
			}
		}
	}
	return outcome;
}

/**
 * Why `--sync` cannot send these keys as asked, checked before anything is
 * written: a key other than a criterion goes as its feature's slice, and only
 * to a project nobody disputes.
 */
function syncRefusal(flags, keys, project) {
	const loose = keys.filter((key) => !key.startsWith('criterion:'));
	if (loose.length > 0 && typeof flags.feature !== 'string') {
		return (
			`${loose.slice(0, 5).join(', ')}${loose.length > 5 ? ', ...' : ''} belong to an action or a surface, which the engine replaces ` +
			'with all of its children, so they are sent as their feature whole: add --feature <featureId> (the feature they belong to).'
		);
	}
	if (project.conflict) return `two different projects are named. ${project.warnings.at(-1)}`;
	if (!project.projectId) return 'no project is named: pass --project <id> (the Lyriks project this repository is specified in).';
	return null;
}

/** What to send for `--sync`: criterion keys alone, anything else as its feature's slice. */
async function syncChanges(flags, loaded, outcome, project) {
	const { openSession, resolveEndpoint } = await import('./mcp-client.mjs');
	const { sendEntries, sliceForFeature } = await import('./sync-index.mjs');
	const touched = [...outcome.added, ...outcome.replaced, ...outcome.unchanged, ...outcome.removed];
	const featureId = typeof flags.feature === 'string' ? flags.feature : null;
	const session = await openSession(resolveEndpoint(flags));
	let slice;
	let notInFeature = [];
	if (featureId) {
		slice = await sliceForFeature(session, project.projectId, featureId, indexEntries(loaded.index));
		const inSlice = new Set(slice.map(([key]) => key));
		notInFeature = touched.filter((key) => !outcome.removed.includes(key) && !inSlice.has(key));
		// A removed criterion is no longer in the slice; `missing` is what drops its record.
		for (const key of outcome.removed) if (key.startsWith('criterion:')) slice.push([key, { status: 'missing' }]);
	} else {
		// A removed criterion is sent as `missing`, which is what drops its record.
		slice = touched.map((key) => [key, outcome.removed.includes(key) ? { status: 'missing' } : loaded.index[key]]);
	}
	const { summary } = await sendEntries(session, project, slice, featureId);
	return { summary, notInFeature };
}

function print(result) {
	for (const kind of ['added', 'replaced', 'unchanged', 'removed', 'absent']) {
		for (const key of result[kind]) console.log(`${kind.padEnd(9)} ${key}`);
	}
	const counts = ['added', 'replaced', 'unchanged', 'removed'].map((kind) => `${result[kind].length} ${kind}`).join(', ');
	console.log(`${result.indexFile}: ${counts}${result.dryRun ? ' (dry run: nothing written)' : result.written ? '.' : ' (nothing to write).'}`);
	if (result.notInFeature?.length) console.log(`Not in feature ${result.sync.feature}, so not sent: ${result.notInFeature.join(', ')}.`);
	if (result.sync) console.log(JSON.stringify(result.sync, null, 2));
}

export async function runIndexCommand(argv) {
	const { parseArgs } = await import('./mcp-client.mjs');
	try {
		const { positional, flags } = parseArgs(argv, ['url', 'token', 'feature', 'project']);
		const [command, ...rest] = positional;
		const loaded = loadIndexFile();
		if (command === 'set-project') {
			if (rest.length !== 1 || !rest[0].trim()) throw new Error(USAGE);
			const before = loaded.projectId;
			loaded.doc.projectId = rest[0].trim();
			writeIndexFile(loaded);
			console.log(`${loaded.path}: projectId ${before ?? '(none)'} -> ${loaded.doc.projectId}`);
			return;
		}
		if (command !== 'upsert' && command !== 'remove') throw new Error(USAGE);
		if (command === 'upsert' ? rest.length !== 1 : rest.length === 0) throw new Error(USAGE);
		const upserts = command === 'upsert' ? readEntries(rest[0]) : [];
		const project = resolveProject({ flag: flags.project, indexProject: loaded.projectId, indexPath: loaded.path, dirs: [loaded.dir, process.cwd()] });
		const refusal = flags.sync && !flags['dry-run'] ? syncRefusal(flags, command === 'upsert' ? upserts.map(([key]) => key) : rest, project) : null;
		if (refusal) throw new Error(`Nothing was written or sent: ${refusal}`);
		const outcome = edit(loaded, command, upserts, rest);
		const changed = outcome.added.length + outcome.replaced.length + outcome.removed.length > 0;
		const result = { indexFile: loaded.path, project: project.projectId, dryRun: Boolean(flags['dry-run']), written: false, ...outcome };
		if (project.warnings.length > 0) result.projectWarnings = project.warnings;
		if (changed && !result.dryRun) {
			writeIndexFile(loaded);
			result.written = true;
		}
		if (flags.sync && !result.dryRun) {
			printProjectWarnings(project.warnings);
			const { summary, notInFeature } = await syncChanges(flags, loaded, outcome, project);
			if (notInFeature.length > 0) result.notInFeature = notInFeature;
			result.sync = summary;
		}
		if (!flags.sync || result.dryRun) printProjectWarnings(project.warnings);
		if (flags.json) console.log(JSON.stringify(result, null, 2));
		else print(result);
		process.exitCode = result.sync?.counters?.ok === false ? 1 : 0;
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
