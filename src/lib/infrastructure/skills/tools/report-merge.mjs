#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/report-merge.mjs --branch <request branch> [--into <branch>] [--request <id>] [--project <id>] [--no-sync] [--url URL] [--token TOKEN]
// Run in the checkout once the request's branch is merged, the deployment
// branch checked out at the merge commit. Reads the commit a person validated
// for the request (get_evolution, `code.validatedCommit`), asks git whether that
// commit is in the history of HEAD, and reports the merge (`report_merge`): into
// the current branch (or --into), with HEAD as the merge commit. Lyriks records
// it only when the validated commit is in it, and that is the moment the
// request's drafts become the official specification (feat-evo-code-branch,
// ac-evo-branch-merge). The request is the one --request names, else the one
// the board shows on --branch. Once the merge is recorded, it syncs the
// checkout's index in the same run (ac-evo-branch-merge-syncs), so the entries
// held while the request was open resolve without another step; --no-sync
// leaves that to sync-index.mjs. Prints what was sent and the answers; exits 1
// when the merge was not recorded.
import { findIndexFile, indexEntries, isMainModule, loadIndexFile } from './index-file.mjs';
import { projectForWrite } from './index-project.mjs';
import { gitState, isAncestor } from './git-state.mjs';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';
import { projectForSync, sendEntries } from './sync-index.mjs';

const USAGE = 'Usage: node .lyriks/tools/report-merge.mjs --branch <request branch> [--into <branch>] [--request <id>] [--project <id>] [--no-sync] [--url URL] [--token TOKEN]';

function projectOf(flags) {
	// A repository without an index yet can still name its project in the binding block.
	const loaded = findIndexFile() ? loadIndexFile() : null;
	const dirs = loaded ? [loaded.dir, process.cwd()] : [process.cwd()];
	return projectForWrite({ flag: flags.project, indexProject: loaded?.projectId ?? null, indexPath: loaded?.path, dirs }).projectId;
}

/** The request and its `code` facts: the one --request names, else the card of the board bound to (or expecting) the branch. */
export async function requestForMerge(session, projectId, { requestId, branch }) {
	if (requestId) {
		const answer = await callToolJson(session, 'get_evolution', { project_id: projectId, request_id: requestId });
		const request = answer.request && typeof answer.request === 'object' ? answer.request : answer;
		return { id: request.id ?? requestId, code: request.code ?? answer.code ?? null };
	}
	const board = await callToolJson(session, 'get_evolution', { project_id: projectId });
	const cards = Array.isArray(board.requests) ? board.requests : [];
	const card = cards.find((c) => c?.code?.branch === branch) ?? cards.find((c) => c?.code?.expectedBranch === branch);
	if (!card) throw new Error(`No request on the board of ${projectId} is built on ${branch}: pass --request <id>.`);
	return { id: card.id, code: card.code ?? null };
}

/**
 * The checkout's whole index sent once the merge is recorded: the deployment
 * branch at the merge commit is the product's code now. Never throws: a sync
 * that cannot run is said, and the merge stays recorded.
 */
export async function syncAfterMerge(session) {
	if (!findIndexFile()) return { ran: false, reason: 'no .unspa.json in this checkout' };
	const loaded = loadIndexFile();
	const entries = indexEntries(loaded.index);
	if (entries.length === 0) return { ran: false, reason: 'the index holds no entry' };
	try {
		const { answer, summary } = await sendEntries(session, projectForSync({}, loaded), entries, null);
		return { ran: true, ok: answer.ok !== false, ...summary };
	} catch (error) {
		return { ran: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

if (isMainModule(import.meta.url)) {
	runScript(async () => {
		const { flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'branch', 'into', 'request', 'project']);
		const branch = typeof flags.branch === 'string' ? flags.branch : null;
		if (!branch) throw new Error(`--branch names the request's branch. ${USAGE}`);
		const git = gitState(process.cwd());
		if (!git?.head) throw new Error('Not in a git checkout with a commit: run it in the repository, on the deployment branch, after the merge.');
		const into = typeof flags.into === 'string' ? flags.into : git.branch;
		if (!into) throw new Error('HEAD is detached: check out the deployment branch, or pass --into <branch>.');
		const projectId = projectOf(flags);
		const session = await openSession(resolveEndpoint(flags));
		const request = await requestForMerge(session, projectId, { requestId: typeof flags.request === 'string' ? flags.request : null, branch });
		const validated = request.code?.validatedCommit;
		if (typeof validated !== 'string' || !validated) {
			throw new Error(`Request ${request.id} has no validated commit: validate its verification first, then merge.`);
		}
		const contains = isAncestor(git.top, validated, git.head);
		if (contains === null) throw new Error(`git does not know the validated commit ${validated}: fetch the request's branch, then run this again.`);
		const op = { op: 'report_merge', requestId: request.id, branch, into, mergeCommit: git.head, containsValidated: contains };
		const answer = await callToolJson(session, 'apply_evolution_batch', { project_id: projectId, operations: [op] });
		const result = Array.isArray(answer.results) ? answer.results[0] : null;
		const ok = answer.ok !== false && result?.ok !== false;
		const said = result?.reason ?? result?.summary ?? answer.error ?? '';
		const indexSync = ok && !flags['no-sync'] ? await syncAfterMerge(session) : null;
		if (indexSync && indexSync.ran && !indexSync.ok) process.stderr.write('warning: the index sync after the merge reported orphans or refusals: read indexSync, then run node .lyriks/tools/sync-index.mjs again\n');
		if (indexSync && !indexSync.ran && indexSync.reason !== 'the index holds no entry' && indexSync.reason !== 'no .unspa.json in this checkout')
			process.stderr.write(`warning: the index was not synced after the merge (${indexSync.reason}): run node .lyriks/tools/sync-index.mjs\n`);
		console.log(
			JSON.stringify(
				{ project: projectId, request: request.id, branch, into, mergeCommit: git.head, validatedCommit: validated, containsValidated: contains, recorded: ok, answer: said, ...(indexSync ? { indexSync } : {}) },
				null,
				2
			)
		);
		return ok ? 0 : 1;
	});
}
