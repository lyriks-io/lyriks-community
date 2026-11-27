// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Reports what
// git says of the checkout to the Evolution request built on its branch
// (`report_code_state`, feat-evo-code-branch), for sync-index.mjs: repository,
// branch, start commit, head, last commit of code, uncommitted code, the proofs
// of the request's own features taken on another commit (criterion 4a83650a),
// commits since the start. A branch no
// open request is built on is not a refusal: the answer says so as a note
// (`noRequest`), and nothing is sent at all when the board shows no open
// request; a refusal for a request that exists stays a refusal. Never throws.
// No dependencies, Node 18+, no network except the endpoint.
import { branchHistory, defaultBranchOf, gitState, proofsAgainst, repositoryOf } from './git-state.mjs';
import { callToolJson } from './mcp-client.mjs';

/** The Evolution board's cards, and whether the list is whole; null when the board cannot be read. */
async function boardOf(session, projectId) {
	try {
		const board = await callToolJson(session, 'get_evolution', { project_id: projectId });
		if (!Array.isArray(board.requests)) return null;
		// A capped answer may have cut the list: a request missing from it may still be open.
		return { cards: board.requests, whole: board.capped !== true };
	} catch {
		// An older gateway or a project with no Evolution section: nothing to say.
		return null;
	}
}

/** The deployment branch the project names on Lyriks, read off the board's cards; null when none is named or the board cannot tell. */
function deploymentBranchOf(board) {
	for (const card of board?.cards ?? []) {
		const branch = card?.code?.deploymentBranch;
		if (typeof branch === 'string' && branch) return branch;
	}
	return null;
}

/** True only when the whole board is read and no request on it is open (a card that names no status may be). */
function noOpenRequest(board) {
	return Boolean(board?.whole) && !board.cards.some((card) => card?.status === undefined || card?.status === 'open');
}

/** A list the gateway may have capped into `{ items, total, returned }`: whole, or null when it was cut. */
function wholeList(list) {
	if (Array.isArray(list)) return list;
	if (list && Array.isArray(list.items) && list.returned === list.total) return list.items;
	return null;
}

/** The open card of the request built on this branch, among cards a board or a batch answer shows; null when none is. */
function cardOfBranch(cards, branch) {
	return (
		(cards ?? []).find(
			(card) => (card?.status === undefined || card.status === 'open') && (card?.code?.branch === branch || card?.code?.expectedBranch === branch)
		) ?? null
	);
}

/**
 * Every index key of the given features (a draft answers the keys of the
 * feature it makes, the criteria it adds among them); null when one cannot be
 * read, and every proof of the index then counts, as before.
 */
async function keysOf(leafIds, featureKeys) {
	const ids = (leafIds ?? []).filter((id) => typeof id === 'string' && id);
	if (!featureKeys || ids.length === 0) return null;
	const keys = new Set();
	for (const id of ids) {
		let found;
		try {
			found = await featureKeys(id);
		} catch {
			return null;
		}
		if (!found) return null;
		for (const key of found) keys.add(key);
	}
	return keys;
}

const NO_REQUEST = 'no open Evolution request: code state not attached';

/** Outside a git repository no commit can carry the change: the AI offers the person to create one, and creates it only on their yes (criterion f6d786d2). */
const NO_GIT = 'No git repository here: this change cannot go through a commit. Create one (git init, then a first commit) and name the deployment branch.';

/** What the AI is told while the project names no deployment branch: the branch git reads, and the operation that pre-fills the card with it. */
function branchToSuggest(guess) {
	if (!guess) return 'not reported: the project names no deployment branch, and git names no default branch to suggest: ask the person which branch the project deploys from';
	const op = JSON.stringify({ op: 'suggest_deployment_branch', branch: guess.branch, why: guess.why });
	return `not reported: the project names no deployment branch. git reads ${guess.branch} (${guess.why}): suggest it with apply_evolution_batch [${op}], then a person names it with Save on the card Code on its branch, or tells you to`;
}

/**
 * True when the platform found no request to attach the report to: it names
 * the request of every refusal it resolved, so a refusal of this report with
 * `requestId: null` means no open request holds the branch or is named for it.
 * An older gateway that does not know the operation is refused the same way,
 * and that one stays a refusal.
 */
function attachedToNoRequest(answer) {
	const result = Array.isArray(answer?.results) ? answer.results[0] : null;
	if (!result || result.ok !== false || !('requestId' in result) || result.requestId !== null) return false;
	return !/^Unknown operation/.test(String(result.reason ?? result.summary ?? ''));
}

/** The first sentence an apply_evolution_batch answer gives about its one operation. */
function verdictOf(answer) {
	const result = Array.isArray(answer?.results) ? answer.results[0] : null;
	const ok = answer?.ok !== false && result?.ok !== false;
	const said = result?.reason ?? result?.summary ?? answer?.error ?? answer?.reason ?? '';
	return { ok, said: typeof said === 'string' ? said : JSON.stringify(said) };
}

/**
 * Reports the checkout's git state to the request built on this branch, and
 * what the platform answered; outside a git repository, that none holds the
 * change (noGit). `featureKeys(featureId)` reads a feature's index keys, so only
 * the proofs of the request's own features are counted. Never throws, so
 * a refusal or a gateway without the operation leaves the sync standing.
 */
export async function reportCodeState(session, projectId, dir, slice, { baseBranch = null, featureKeys = null } = {}) {
	if (!gitState(dir)) return { reported: false, noGit: true, answer: NO_GIT };
	const board = await boardOf(session, projectId);
	const deploymentBranch = baseBranch || deploymentBranchOf(board);
	const git = gitState(dir, { deploymentBranch });
	if (!git.branch) return { reported: false, answer: 'not reported: the checkout is on a detached head, on no branch' };
	if (deploymentBranch && git.branch === deploymentBranch) {
		return { reported: false, branch: git.branch, answer: `not reported: ${git.branch} is the deployment branch, and code is never written on it` };
	}
	const base = {
		op: 'report_code_state',
		repository: repositoryOf(git.top),
		history: branchHistory(git.top, git.baseCommit),
		branch: git.branch,
		baseCommit: git.baseCommit,
		head: git.head,
		codeHead: git.codeHead,
		clean: git.clean === true
	};
	// Only the proofs of the request's own features count (criterion 4a83650a): its card names them.
	let keys = featureKeys ? await keysOf(wholeList(cardOfBranch(board?.cards, git.branch)?.leafIds), featureKeys) : null;
	let counted = proofsAgainst(slice, git.codeHead, { keys });
	const opWith = ({ proofsLeftOut: _left, ...proofs }) => ({ ...base, ...proofs });
	const factsOf = (op) => {
		const { op: _name, history, ...rest } = op; // the commits travel to Lyriks, the summary only counts them
		// What was left out of the count stays in the summary the AI reads: Lyriks only weighs what a run here could take again.
		return { ...rest, commitCount: history?.count ?? null, proofsScope: keys ? 'request' : 'index', proofsLeftOut: counted.proofsLeftOut };
	};
	if (noOpenRequest(board)) return { reported: false, noRequest: true, ...factsOf(opWith(counted)), answer: NO_REQUEST };
	// No branch is named yet: the sign-in of this command only reports, so it says what git reads for the AI to suggest (action db883b80).
	if (board && !deploymentBranch) return { reported: false, ...factsOf(opWith(counted)), answer: branchToSuggest(defaultBranchOf(git.top)) };
	const send = (op) => callToolJson(session, 'apply_evolution_batch', { project_id: projectId, operations: [op] });
	try {
		let answer = await send(opWith(counted));
		let { ok, said } = verdictOf(answer);
		if (!ok && attachedToNoRequest(answer)) return { reported: false, noRequest: true, ...factsOf(opWith(counted)), answer: `${NO_REQUEST} (none is built on ${git.branch})` };
		// A board the gateway capped shows no card whole: the request the platform resolved names its features in
		// its answer, and the count is sent again on them alone.
		if (ok && !keys && featureKeys) {
			keys = await keysOf(wholeList(cardOfBranch(answer?.requests, git.branch)?.leafIds), featureKeys);
			if (keys) {
				counted = proofsAgainst(slice, git.codeHead, { keys });
				answer = await send(opWith(counted));
				({ ok, said } = verdictOf(answer));
			}
		}
		return { reported: ok, ...factsOf(opWith(counted)), answer: ok ? `accepted${said ? `: ${said}` : ''}` : `refused: ${said || 'no reason given'}` };
	} catch (error) {
		return { reported: false, ...factsOf(opWith(counted)), answer: `refused: ${error instanceof Error ? error.message : String(error)}` };
	}
}
