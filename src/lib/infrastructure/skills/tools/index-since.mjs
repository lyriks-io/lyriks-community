// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). What changed
// in `.unspa.json` since a git revision, and which units those keys travel with,
// for `sync-index.mjs --since <revision>` (feat-100, criterion bae110ba): a sync
// replaces what was located under every action or surface it names, so each unit
// a changed key belongs to is sent whole from the local index, and nothing else.
// Lyriks answers where the keys belong (get_implementation_status with keys), so
// no feature has to be read first. No dependencies, Node 18+.
import { execFileSync } from 'node:child_process';
import { relative, sep } from 'node:path';
import { callToolJson } from './mcp-client.mjs';

/**
 * The most keys one lookup carries; Lyriks refuses more (constant
 * maxKeysPerLookup of the specification). Keys beyond it go in further calls.
 */
export const MAX_KEYS_PER_LOOKUP = 150;

function git(cwd, args) {
	try {
		return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024 });
	} catch {
		return null;
	}
}

/**
 * The index as it stood at `revision`, read with git from the checkout that
 * holds `loaded`. An index the revision did not have yet reads empty (every
 * entry is then new). Throws, sending nothing, when git cannot read the
 * revision here: without it there is no telling what changed.
 */
export function indexAt(loaded, revision) {
	const top = git(loaded.dir, ['rev-parse', '--show-toplevel'])?.trim();
	const commit = top ? git(top, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`])?.trim() : null;
	if (!commit) {
		throw new Error(
			`git cannot read ${revision} in this checkout: nothing was sent. Name a commit, a tag or a branch git knows here, or run without --since to send the whole index.`
		);
	}
	const path = relative(top, loaded.path).split(sep).join('/');
	const text = git(top, ['show', `${commit}:${path}`]);
	if (text === null) return {};
	let doc;
	try {
		doc = JSON.parse(text);
	} catch (error) {
		throw new Error(`${path} at ${revision} is not valid JSON: ${error.message}`);
	}
	if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {};
	return doc.index && typeof doc.index === 'object' && !Array.isArray(doc.index) ? doc.index : doc;
}

/** The keys whose entry was added, changed or removed between two indexes, in the order of the newer one. */
export function changedKeys(before, after) {
	const changed = [];
	for (const [key, entry] of Object.entries(after)) {
		if (JSON.stringify(entry) !== JSON.stringify(before[key])) changed.push(key);
	}
	for (const key of Object.keys(before)) if (!(key in after)) changed.push(key);
	return changed;
}

/** A row of a lookup answer: a feature that declares keys, or a draft of an open request that adds some. */
const rowIdOf = (row) => (row.requestId === undefined ? `feature\u0000${row.featureId}` : `request\u0000${row.requestId}\u0000${row.draftId}`);

/**
 * Where each key belongs, asked in calls of at most MAX_KEYS_PER_LOOKUP keys:
 * the features that declare it, and the drafts of open Evolution requests that
 * add it (`requests`), each with the units holding it. A gateway answers whole
 * keys while they fit one answer and names the others under `remainingKeys`:
 * those are asked again, so no unit ever comes back cut.
 */
export async function ownersOf(session, projectId, keys) {
	const rows = new Map();
	const orphans = new Set();
	const notRead = new Set();
	let pending = [...new Set(keys)];
	while (pending.length > 0) {
		const asked = pending.slice(0, MAX_KEYS_PER_LOOKUP);
		const answer = await callToolJson(session, 'get_implementation_status', { project_id: projectId, keys: asked });
		if (!Array.isArray(answer.features)) {
			throw new Error(
				'This Lyriks gateway does not answer where index keys belong (get_implementation_status with keys): update it, or run without --since.'
			);
		}
		for (const row of [...answer.features, ...(Array.isArray(answer.requests) ? answer.requests : [])]) {
			const held = rows.get(rowIdOf(row)) ?? { ...row, units: new Map(), alone: new Set() };
			for (const unit of row.units ?? []) held.units.set(unit.unit, unit.keys);
			for (const key of row.alone ?? []) held.alone.add(key);
			rows.set(rowIdOf(row), held);
		}
		for (const key of answer.orphans ?? []) orphans.add(key);
		// A request whose drafts could not be read: a key it adds may sit among the orphans.
		for (const id of answer.requestsNotRead ?? []) notRead.add(id);
		const remaining = Array.isArray(answer.remainingKeys) ? answer.remainingKeys.filter((key) => asked.includes(key)) : [];
		// A gateway that answers nothing of what it was asked would loop forever.
		if (remaining.length >= asked.length) throw new Error('Lyriks answered none of the keys asked: nothing was sent.');
		pending = [...remaining, ...pending.slice(asked.length)];
	}
	const done = [...rows.values()].map((row) => ({ ...row, units: [...row.units].map(([unit, unitKeys]) => ({ unit, keys: unitKeys })), alone: [...row.alone] }));
	const unread = notRead.size > 0 ? { requestsNotRead: [...notRead] } : {};
	return { features: done.filter((row) => row.requestId === undefined), requests: done.filter((row) => row.requestId !== undefined), orphans: [...orphans], ...unread };
}

/**
 * What a --since sync sends: every unit a changed key belongs to, whole from the
 * local index (a child it lost since is left out, so its report drops it), and
 * every changed key that travels on its own and is still in the index. A unit a
 * request's draft places a key in goes the same way, and the sync holds the key
 * on that request. `featureId` keeps one feature's units only (a draft's, by its id).
 */
export function sliceForChanges(owners, index, featureId = null) {
	const slice = new Map();
	const units = [];
	const features = [];
	const requests = [];
	for (const row of [...owners.features, ...(owners.requests ?? [])]) {
		if (featureId && (row.requestId === undefined ? row.featureId : row.draftId) !== featureId) continue;
		let sent = false;
		for (const unit of row.units) {
			const held = unit.keys.filter((key) => index[key] && typeof index[key] === 'object');
			if (held.length === 0) continue;
			for (const key of held) slice.set(key, index[key]);
			units.push(unit.unit);
			sent = true;
		}
		for (const key of row.alone) {
			if (!index[key] || typeof index[key] !== 'object') continue;
			slice.set(key, index[key]);
			sent = true;
		}
		if (!sent) continue;
		if (row.requestId === undefined) features.push(row.featureId);
		else requests.push({ requestId: row.requestId, draftId: row.draftId });
	}
	return { slice: [...slice], units: [...new Set(units)], features, requests };
}

/**
 * The entries a --since run sends, and what it prints about them: with
 * `positions` the entries that changed (a moved place travels alone), else
 * every unit a changed key belongs to, whole. `before` is the index at `since`.
 */
export async function sinceSlice(session, projectId, index, before, { since, positions = false, featureId = null }) {
	const changed = changedKeys(before, index);
	if (positions) {
		const slice = changed.filter((key) => index[key] && typeof index[key] === 'object').map((key) => [key, index[key]]);
		return { slice, since: { revision: since, changed: changed.length } };
	}
	const owners = changed.length > 0 ? await ownersOf(session, projectId, changed) : { features: [], requests: [], orphans: [] };
	const { slice, units, features, requests } = sliceForChanges(owners, index, featureId);
	// Long lists are printed to their head; the total is kept.
	const head = units.slice(0, 50);
	const more = units.length > head.length ? { unitsTotal: units.length } : {};
	const held = { ...(requests.length > 0 ? { requests } : {}), ...(owners.requestsNotRead ? { requestsNotRead: owners.requestsNotRead } : {}) };
	return { slice, since: { revision: since, changed: changed.length, features, units: head, ...more, ...held, orphans: owners.orphans } };
}
