// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Creates the
// repository's implementation index: the `init` command of index-file.mjs, and
// the index an `upsert` creates when the repository has none yet, so the first
// entry needs no other step and no session writes the file by hand. The file is
// `{ "projectId": "<id>", "index": {} }`, what the engine and every script read,
// created in the current folder for the project --project names, else the one
// the binding block of CLAUDE.md (or AGENTS.md...) names. An index found here or
// in a parent folder is never replaced. No dependencies, Node 18+.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { INDEX_FILE_NAME, findIndexFile, loadIndexFile } from './index-file.mjs';
import { printProjectWarnings, resolveProject } from './index-project.mjs';

const NAME_THE_PROJECT = '--project <id> (the Lyriks project this repository is specified in)';

/** A new, empty index for `projectId` in `dir`, loaded as `loadIndexFile` returns one and not yet written. */
export function newIndexFile(dir, projectId) {
	const path = join(resolve(dir), INDEX_FILE_NAME);
	const doc = { projectId, index: {} };
	return { path, dir: dirname(path), text: `${JSON.stringify(doc, null, 2)}\n`, doc, index: doc.index, projectId, created: true };
}

/**
 * The project a new index is created for: --project, else the binding block of
 * the instruction file in the current folder. Without either, a refusal that
 * says how to name it, before anything is written.
 */
function projectToCreate(flags, command) {
	const project = resolveProject({ flag: flags.project, indexProject: null, indexPath: null, dirs: [process.cwd()] });
	if (project.projectId) return project;
	const how =
		command === 'init'
			? `pass ${NAME_THE_PROJECT}, or bind the repository with sync_skills, whose binding block in CLAUDE.md names it.`
			: `pass ${NAME_THE_PROJECT}, or create the index first: node .lyriks/tools/index-file.mjs init --project <id>.`;
	throw new Error(`No ${INDEX_FILE_NAME} found in ${process.cwd()} or any parent folder, and no project is named to create one, so nothing was written: ${how}`);
}

/** The index an upsert edits: the one found, or a new one in the current folder, which the upsert writes with its entries. */
export function indexToUpsert(flags) {
	return findIndexFile() ? loadIndexFile() : newIndexFile(process.cwd(), projectToCreate(flags, 'upsert').projectId);
}

/** The `init` command: creates the index in the current folder, unless one is already found here or above. */
export function init(flags) {
	if (findIndexFile()) {
		const loaded = loadIndexFile();
		const project = resolveProject({ flag: flags.project, indexProject: loaded.projectId, indexPath: loaded.path, dirs: [loaded.dir, process.cwd()] });
		printProjectWarnings(project.warnings);
		const result = { indexFile: loaded.path, project: loaded.projectId, created: false };
		if (flags.json) console.log(JSON.stringify(result, null, 2));
		else console.log(`${loaded.path} already exists (projectId ${loaded.projectId ?? 'none'}): nothing written.`);
		return;
	}
	const project = projectToCreate(flags, 'init');
	const loaded = newIndexFile(process.cwd(), project.projectId);
	// `wx`: a file written in between is never replaced.
	writeFileSync(loaded.path, loaded.text, { flag: 'wx' });
	printProjectWarnings(project.warnings);
	const result = { indexFile: loaded.path, project: project.projectId, projectSource: project.source, created: true };
	if (flags.json) console.log(JSON.stringify(result, null, 2));
	else console.log(`${loaded.path}: created for project ${project.projectId} (named by ${project.source}).`);
}
