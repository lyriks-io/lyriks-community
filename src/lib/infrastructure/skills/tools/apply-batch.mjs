#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/apply-batch.mjs <feature_id> <ops.json> [--dry-run] [--expect <updatedAt>] [--project <id>] [--url URL] [--token TOKEN]
//   node .lyriks/tools/apply-batch.mjs <feature_id> --commit TOKEN
// Sends a behavior batch read from a file to `apply_behavior_batch`, because a
// real batch (tens of kilobytes) cannot be typed as a tool argument. Dry-run
// first, then commit the token it returns: the operations are not resent, and
// what is saved is exactly what was validated. The project comes from
// --project, else `.unspa.json` (`projectId`), else the binding block of
// CLAUDE.md; when those two name different projects, nothing is sent.
// With --expect, the batch carries the feature `updatedAt` it was written
// against: when another writer moved the feature in between, nothing is applied
// and the answer names what changed. Pass it whenever someone else may be
// editing the same feature.
import { readFileSync } from 'node:fs';
import { findIndexFile, loadIndexFile } from './index-file.mjs';
import { projectForWrite } from './index-project.mjs';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

const USAGE =
	'Usage: apply-batch.mjs <feature_id> <ops.json> [--dry-run | --commit TOKEN] [--expect <updatedAt>] [--project <id>] [--url URL] [--token TOKEN]';

/** The operations of a batch file: a bare array, or an object holding `operations`. */
function readOperations(path) {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		throw new Error(`${path} cannot be read as JSON: ${error.message}`);
	}
	const operations = Array.isArray(parsed) ? parsed : parsed?.operations;
	if (!Array.isArray(operations) || operations.length === 0) {
		throw new Error(`${path} holds no operations: expected an array of ops, or { "operations": [...] }.`);
	}
	return operations;
}

function resolveProject(flags) {
	// A repository without an index yet can still name its project in the binding block.
	const loaded = findIndexFile() ? loadIndexFile() : null;
	const dirs = loaded ? [loaded.dir, process.cwd()] : [process.cwd()];
	return projectForWrite({ flag: flags.project, indexProject: loaded?.projectId ?? null, indexPath: loaded?.path, dirs }).projectId;
}

runScript(async () => {
	const { positional, flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'commit', 'project', 'expect']);
	const [featureId, opsPath] = positional;
	const commit = typeof flags.commit === 'string' ? flags.commit : null;
	if (!featureId || (!opsPath && !commit)) throw new Error(USAGE);
	if (commit && flags['dry-run']) throw new Error('--dry-run and --commit exclude each other: a commit saves a batch already validated.');

	const args = { project_id: resolveProject(flags), feature_id: featureId };
	// Guard the write on the version the ops were written against. A commit is
	// guarded too: the minutes between a dry run and its commit are exactly when
	// another writer slips in.
	if (typeof flags.expect === 'string' && flags.expect) args.expected_updated_at = flags.expect;
	// A commit replays the validated batch by its token: the operations stay home.
	if (commit) args.commit = commit;
	else {
		args.operations = readOperations(opsPath);
		if (flags['dry-run']) args.dry_run = true;
	}

	const session = await openSession(resolveEndpoint(flags));
	const answer = await callToolJson(session, 'apply_behavior_batch', args);
	const batch = answer.batch && typeof answer.batch === 'object' ? answer.batch : {};
	const scenarios = batch.scenarios ?? answer.scenarios;
	const summary = {
		ok: batch.ok === true,
		errors: batch.errors ?? [],
		refs: batch.refs ?? {},
		commitToken: batch.commitToken ?? null,
		// A refused write says what moved, so a rebase reads only those elements.
		...(batch.conflict === true
			? {
					conflict: true,
					currentUpdatedAt: batch.currentUpdatedAt ?? null,
					changedSince: batch.changedSince ?? [],
					changedSinceTotal: batch.changedSinceTotal ?? null
				}
			: {}),
		...(batch.updatedAt !== undefined ? { updatedAt: batch.updatedAt } : {}),
		...(batch.relatedElsewhere !== undefined ? { relatedElsewhere: batch.relatedElsewhere } : {}),
		...(scenarios !== undefined ? { scenarios } : {}),
		...(Array.isArray(answer.warnings) && answer.warnings.length > 0 ? { warnings: answer.warnings } : {})
	};
	console.log(JSON.stringify(summary, null, 2));
	return summary.ok ? 0 : 1;
});
