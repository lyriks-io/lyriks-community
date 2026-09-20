#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/sync-index.mjs [--feature <featureId>] [--project <id>] [--url URL] [--token TOKEN]
// Sends `.unspa.json` to `sync_implementation_index`, because a large index
// cannot be typed as a tool argument. The project comes from the index file
// (`projectId`) unless --project names it. Prints the counters and what each
// one means, never the whole answer.
//
// --feature sends one feature's slice. The engine leaves untouched every action
// and surface absent from what it receives, but a report REPLACES what was
// located for an action or surface: an action must travel with all of its
// children. The index does not record parentage, so the server is asked which
// keys belong to the feature (get_behavior_feature with index_keys:true).
import { indexEntries, loadIndexFile } from './index-file.mjs';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

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
async function sliceForFeature(session, projectId, featureId, entries) {
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

/** What an agent needs from a sync answer: the counters, what is actionable, and the definitions. */
function summarize(answer, sent, featureId) {
	const counters = {};
	for (const [name, value] of Object.entries(answer)) {
		if (typeof value === 'number' || typeof value === 'boolean') counters[name] = value;
	}
	for (const name of ['orphans', 'shared', 'stale', 'healed', 'failedAcks']) {
		const size = sizeOf(answer[name]);
		if (size !== undefined) counters[name] = size;
	}
	const summary = { sent, ...(featureId ? { feature: featureId } : {}), counters };
	// Orphans and refused reports are the two blocks that call for an edit.
	if (counters.orphans > 0) summary.orphans = answer.orphans.entries ?? answer.orphans;
	if (counters.failedAcks > 0) summary.failedAcks = answer.failedAcks;
	if (answer.semantics) summary.semantics = answer.semantics;
	return summary;
}

runScript(async () => {
	const { flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'feature', 'project']);
	const loaded = loadIndexFile();
	const projectId = typeof flags.project === 'string' ? flags.project : loaded.projectId;
	if (!projectId) {
		throw new Error(`${loaded.path} names no projectId: pass --project <id> (the Lyriks project this repository is specified in).`);
	}
	const entries = indexEntries(loaded.index);
	const session = await openSession(resolveEndpoint(flags));
	const featureId = typeof flags.feature === 'string' ? flags.feature : null;
	const slice = featureId ? await sliceForFeature(session, projectId, featureId, entries) : entries;
	if (slice.length === 0) {
		throw new Error(
			featureId
				? `No entry of ${loaded.path} belongs to feature ${featureId}: nothing to send.`
				: `${loaded.path} holds no entry: nothing to send.`
		);
	}
	const answer = await callToolJson(session, 'sync_implementation_index', {
		project_id: projectId,
		index: Object.fromEntries(slice)
	});
	console.log(JSON.stringify(summarize(answer, slice.length, featureId), null, 2));
	// `ok:false` means orphan keys or refused reports: worth a failing exit code.
	return answer.ok === false ? 1 : 0;
});
