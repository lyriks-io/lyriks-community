#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/attach-source.mjs <feature_id> <path...> [--commit SHA] [--kind code|file] [--project <id>] [--url URL] [--token TOKEN]
// Attaches files as the evidence of one feature, read from the disk (or, with
// --commit, from that commit through `git show`) and sent exactly as they are.
// A file retyped as a tool argument comes back altered (a literal ¡ in the
// code is decoded on the way) and costs its size in tokens; the span offsets
// recorded against it then point at the wrong text. Prints one line per file:
// its path, the source id that spans and candidates name, and its length in
// characters, the unit the offsets count in.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findIndexFile, loadIndexFile } from './index-file.mjs';
import { projectForWrite } from './index-project.mjs';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

const USAGE =
	'Usage: attach-source.mjs <feature_id> <path...> [--commit SHA] [--kind code|file] [--project <id>] [--url URL] [--token TOKEN]';

/** The repo-relative path a source is named by: the index keeps it verbatim. */
const repoPath = (path) => path.replace(/\\/g, '/').replace(/^\.\//, '');

/** The exact text of a file, from the working tree or from a commit. */
function readSource(path, commit) {
	if (!commit) return readFileSync(path, 'utf8');
	try {
		return execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (error) {
		throw new Error(`git show ${commit}:${path} failed: ${String(error.stderr || error.message).trim()}`);
	}
}

function resolveProject(flags) {
	const loaded = findIndexFile() ? loadIndexFile() : null;
	const dirs = loaded ? [loaded.dir, process.cwd()] : [process.cwd()];
	return projectForWrite({ flag: flags.project, indexProject: loaded?.projectId ?? null, indexPath: loaded?.path, dirs }).projectId;
}

runScript(async () => {
	const { positional, flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'commit', 'kind', 'project']);
	const [featureId, ...paths] = positional;
	if (!featureId || paths.length === 0) throw new Error(USAGE);
	const kind = flags.kind === 'file' ? 'file' : 'code';
	const commit = typeof flags.commit === 'string' && flags.commit ? flags.commit : null;
	// Every file is read before anything is sent: a typo in the fifth path sends nothing.
	const files = paths.map((path) => ({ path: repoPath(path), content: readSource(repoPath(path), commit) }));
	const projectId = resolveProject(flags);

	const session = await openSession(resolveEndpoint(flags));
	let failed = 0;
	for (const file of files) {
		const answer = await callToolJson(session, 'attach_source', {
			project_id: projectId,
			feature_id: featureId,
			file_name: file.path,
			content: file.content,
			kind
		});
		if (answer?.ok === false || typeof answer?.sourceId !== 'string') {
			failed += 1;
			console.log(`${file.path}: NOT attached: ${answer?.error ?? JSON.stringify(answer)}`);
			continue;
		}
		console.log(`${file.path}: ${answer.sourceId} (${file.content.length} characters)`);
	}
	return failed === 0 ? 0 : 1;
});
