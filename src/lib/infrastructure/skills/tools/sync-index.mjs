#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/sync-index.mjs [--feature <featureId>] [--since <revision>] [--positions] [--expect <revision>] [--project <id>] [--base-branch <branch>] [--no-git] [--url URL] [--token TOKEN]
// Sends `.unspa.json` to `sync_implementation_index`, because a large index
// cannot be typed as a tool argument. Ask your AI for the sync command
// (sync_implementation_index with command:true) and run it as it comes: it
// names this server and signs in by itself for twelve hours. The project is
// --project, else the index's `projectId`, else the binding block of CLAUDE.md
// (or AGENTS.md...); when the index and the block disagree and --project is not
// given, nothing is sent and the command to run is printed. Prints the counters
// and what each one means, never the whole answer; exits 1 when it is not ok.
//
// --feature sends one feature's slice: a report REPLACES what was located for
// an action or surface, so an action travels with all of its children, the
// server saying which keys belong to the feature (index_keys). --since
// <revision> sends what changed since that git revision, each unit a changed
// key belongs to whole (index-since.mjs). --positions sends places only: lines
// Lyriks already located move, no report is replaced, coverage stays.
// --expect <revision> refuses the write where another checkout wrote the same
// units since (every answer prints the revision it leaves).
//
// In a git checkout it then reports what git says to the request built on the
// branch (code-state.mjs) under `codeState`: a refusal as a warning, a branch
// no open request is built on as a note; --no-git skips it.
import { reportCodeState } from './code-state.mjs';
import { indexEntries, isMainModule, loadIndexFile } from './index-file.mjs';
import { projectForWrite } from './index-project.mjs';
import { indexAt, sinceSlice } from './index-since.mjs';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

/** What a terminal is told when the server asks for a sign-in the command does not carry (rules 031003f7, 1b113f69). */
export const SIGN_IN_REFUSED =
	'Lyriks refused the call (401): this installation asks for sign-in. Ask your AI for the sync command (sync_implementation_index with command:true) and run it as it comes: it signs in by itself for twelve hours.';

/** Every index key the feature declares, following the paging of a very large feature. */
async function featureKeys(session, projectId, featureId) {
	const keys = new Set();
	let offset;
	for (;;) {
		const answer = await callToolJson(session, 'get_behavior_feature', {
			project_id: projectId,
			feature_id: featureId,
			index_keys: true,
			...(offset === undefined ? {} : { offset })
		});
		// An older gateway ignores index_keys and answers the feature itself.
		if (!Array.isArray(answer.keys)) return null;
		for (const key of answer.keys) if (typeof key === 'string') keys.add(key);
		const next = answer.nextOffset;
		// A page that does not advance would loop forever on a faulty server.
		if (typeof next !== 'number' || next <= (offset ?? -1)) return keys;
		offset = next;
	}
}

/** The entries to send for one feature, or a refusal that says what to do instead. */
export async function sliceForFeature(session, projectId, featureId, entries) {
	const keys = await featureKeys(session, projectId, featureId);
	if (keys) return entries.filter(([key]) => keys.has(key));
	// Fallback for a gateway without index_keys: the entries' own `featureId`
	// field, which is only safe when EVERY entry carries one (a child without it
	// would be left behind and its parent's report would lose it).
	if (entries.length > 0 && entries.every(([, entry]) => typeof entry.featureId === 'string')) {
		return entries.filter(([, entry]) => entry.featureId === featureId);
	}
	throw new Error(
		`Cannot slice the index for feature ${featureId}: this gateway does not answer index_keys on get_behavior_feature, ` +
			'and the index entries do not all carry a featureId field. Update the Lyriks gateway, or run without --feature to send the whole index.'
	);
}

/** The size of a `{ total, entries }` block, a list or a plain number. */
function sizeOf(block) {
	if (typeof block === 'number') return block;
	if (Array.isArray(block)) return block.length;
	if (block && typeof block === 'object') {
		if (typeof block.total === 'number') return block.total;
		if (Array.isArray(block.entries)) return block.entries.length;
	}
	return undefined;
}

/** The rows of a `{ total, entries }` block or a list. */
const rowsOf = (block) => (Array.isArray(block) ? block : Array.isArray(block?.entries) ? block.entries : []);

/** What an agent needs from a sync answer: the counters, what is actionable, and the definitions. */
export function summarize(answer, sent, featureId) {
	const counters = {};
	for (const [name, value] of Object.entries(answer)) {
		if (typeof value === 'number' || typeof value === 'boolean') counters[name] = value;
	}
	for (const name of ['orphans', 'shared', 'stale', 'healed', 'failedAcks', 'notLocated']) {
		const size = sizeOf(answer[name]);
		if (size !== undefined) counters[name] = size;
	}
	const summary = { sent, ...(featureId ? { feature: featureId } : {}), counters };
	// Orphans, refused reports and keys a move cannot place are the blocks that call for an edit.
	if (counters.orphans > 0) summary.orphans = answer.orphans.entries ?? answer.orphans;
	if (counters.failedAcks > 0) summary.failedAcks = answer.failedAcks;
	if (counters.notLocated > 0) summary.notLocated = rowsOf(answer.notLocated);
	// A write refused because another checkout wrote the same units since the revision named.
	if (answer.refused === 'revision') {
		summary.refused = { message: answer.message, units: answer.units, total: answer.total, currentRevision: answer.currentRevision };
	}
	if (answer.semantics) summary.semantics = answer.semantics;
	return summary;
}

/** The project a sync addresses, with every disagreement about it (throws on a conflict). */
export function projectForSync(flags, loaded) {
	return projectForWrite({ flag: flags.project, indexProject: loaded.projectId, indexPath: loaded.path, dirs: [loaded.dir, process.cwd()] });
}

/**
 * Sends entries as a (partial) index and returns what an agent reads of the
 * answer. `positions` sends them as places only; `expectedRevision` refuses the
 * write where another one touched the same units since.
 */
export async function sendEntries(session, project, slice, featureId, { positions = false, expectedRevision = null } = {}) {
	const answer = await callToolJson(session, 'sync_implementation_index', {
		project_id: project.projectId,
		index: Object.fromEntries(slice),
		...(positions ? { positions_only: true } : {}),
		...(expectedRevision === null ? {} : { expected_revision: expectedRevision })
	});
	const summary = { project: project.projectId, projectSource: project.source, ...summarize(answer, slice.length, featureId) };
	if (project.warnings.length > 0) summary.projectWarnings = project.warnings;
	return { answer, summary };
}

/** The revision --expect names, or null; anything else is refused before the network. */
function expectedRevisionOf(flags) {
	if (flags.expect === undefined) return null;
	const revision = Number(flags.expect);
	if (!Number.isSafeInteger(revision) || revision < 0) {
		throw new Error(`--expect takes the revision an earlier sync printed (a whole number), not "${flags.expect}".`);
	}
	return revision;
}

if (isMainModule(import.meta.url)) {
	runScript(async () => {
		const { flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'feature', 'project', 'base-branch', 'since', 'expect']);
		const loaded = loadIndexFile();
		const project = projectForSync(flags, loaded);
		const expectedRevision = expectedRevisionOf(flags);
		const entries = indexEntries(loaded.index);
		const featureId = typeof flags.feature === 'string' ? flags.feature : null;
		const since = typeof flags.since === 'string' ? flags.since : null;
		// Read before the network: a revision git cannot read sends nothing.
		const before = since ? indexAt(loaded, since) : null;
		try {
			const session = await openSession(resolveEndpoint(flags));
			let slice;
			let sinceReport = null;
			if (since) {
				({ slice, since: sinceReport } = await sinceSlice(session, project.projectId, loaded.index, before, { since, positions: Boolean(flags.positions), featureId }));
				if (slice.length === 0) {
					const nothing = { project: project.projectId, projectSource: project.source, sent: 0, since: sinceReport };
					console.log(JSON.stringify({ ...nothing, note: `Nothing of ${loaded.path} to send since ${since}.` }, null, 2));
					return sinceReport.orphans?.length > 0 ? 1 : 0;
				}
			} else {
				slice = featureId ? await sliceForFeature(session, project.projectId, featureId, entries) : entries;
			}
			if (slice.length === 0) {
				throw new Error(
					featureId
						? `No entry of ${loaded.path} belongs to feature ${featureId}: nothing to send.`
						: `${loaded.path} holds no entry: nothing to send.`
				);
			}
			const { answer, summary } = await sendEntries(session, project, slice, featureId, { positions: Boolean(flags.positions), expectedRevision });
			if (sinceReport) summary.since = sinceReport;
			if (!flags['no-git'] && !flags.positions) {
				// Every proof the index holds, not only the slice sent: a slice would report its own few as the request's.
				const codeState = await reportCodeState(session, project.projectId, loaded.dir, entries, {
					baseBranch: typeof flags['base-branch'] === 'string' ? flags['base-branch'] : null
				});
				if (codeState) {
					summary.codeState = codeState;
					// No request on this branch is information, already in the summary: not a warning.
					if (!codeState.reported && !codeState.noRequest && !codeState.noGit) process.stderr.write(`warning: code state ${codeState.answer}\n`);
				}
			}
			console.log(JSON.stringify(summary, null, 2));
			// `ok:false` means orphan keys, refused reports, keys a move cannot place or a refused revision.
			return answer.ok === false || sinceReport?.orphans?.length > 0 ? 1 : 0;
		} catch (error) {
			if (error?.status === 401) throw new Error(SIGN_IN_REFUSED);
			throw error;
		}
	});
}
