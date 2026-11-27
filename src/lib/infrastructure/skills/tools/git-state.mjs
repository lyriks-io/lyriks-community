// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). What git
// says of the checkout, for the scripts that report it to Lyriks: Lyriks never
// reads the repository itself (feat-evo-code-branch, ac-evo-branch-no-repo),
// the person's AI reports these facts the way it reports test results.
// No dependencies; every fact is null outside a git repository.
import { execFileSync } from 'node:child_process';

/**
 * The files a test run writes back into the checkout: the index records what
 * proved the code and the JSON report is what the run left. Neither is code, so
 * a commit touching only them is no new commit of code, and leaving them
 * uncommitted does not make the tree dirty.
 */
export const NOT_CODE = ['.unspa.json', 'test-report.json'];
const PATHSPEC = ['.', ...NOT_CODE.map((name) => `:(exclude,glob)**/${name}`)];

function git(cwd, args) {
	try {
		return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
	} catch {
		return null;
	}
}

/**
 * The checkout's state: its top folder, the branch (null on a detached head),
 * the head, the last commit of code (the files above left out), whether the
 * tree holds uncommitted code, and the commit it shares with the deployment
 * branch when that branch is named and known here. Null outside a repository.
 */
export function gitState(dir = process.cwd(), { deploymentBranch = null } = {}) {
	const top = git(dir, ['rev-parse', '--show-toplevel']);
	if (!top) return null;
	const status = git(top, ['status', '--porcelain', '--', ...PATHSPEC]);
	return {
		top,
		branch: git(top, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || null,
		head: git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']) || null,
		codeHead: git(top, ['log', '-1', '--format=%H', '--', ...PATHSPEC]) || null,
		clean: status === null ? null : status === '',
		baseCommit: deploymentBranch ? git(top, ['merge-base', 'HEAD', deploymentBranch]) || null : null
	};
}

/**
 * The branch git names as the repository's default: origin/HEAD, else main or
 * master when the checkout holds one, with what says so. What the AI suggests as
 * the deployment branch while the project names none (action db883b80); null
 * when git names none.
 */
export function defaultBranchOf(top) {
	const remote = git(top, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
	if (remote) return { branch: remote.replace(/^origin\//, ''), why: 'the default branch of origin' };
	for (const name of ['main', 'master']) {
		if (git(top, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])) return { branch: name, why: `the ${name} branch of the checkout` };
	}
	return null;
}

/**
 * A remote's address without the user or token written in it: Lyriks never
 * receives a credential (ac-evo-branch-repository). An scp-like address
 * (git@host:owner/name) keeps its user, which is no secret.
 */
export function withoutCredentials(url) {
	return url.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, '$1');
}

/** owner/name as a remote address names the repository; null when the address holds no path. */
export function repositoryNameOf(url) {
	const path = url
		.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
		.replace(/^[^/:]+:/, '')
		.replace(/\.git\/?$/, '')
		.split('/')
		.filter((part) => part !== '');
	return path.length > 0 ? path.slice(-2).join('/') : null;
}

/**
 * The repository the checkout belongs to: its `origin` remote (else its first
 * one) as owner/name with the address, credentials taken out, or the top
 * folder's name with no address when it has no remote.
 */
export function repositoryOf(top) {
	const remotes = (git(top, ['remote']) ?? '').split('\n').filter(Boolean);
	const remote = remotes.includes('origin') ? 'origin' : remotes[0];
	const url = remote ? git(top, ['remote', 'get-url', remote]) : null;
	const clean = url ? withoutCredentials(url) : null;
	return { name: (clean && repositoryNameOf(clean)) || top.split(/[\\/]/).filter(Boolean).at(-1) || top, url: clean };
}

const UNIT = '\x1f';
/** How many commits of the branch a report lists, newest first; the count still says how many there are. */
export const HISTORY_LISTED = 200;

/**
 * The branch's commits since `baseCommit`, newest first, as git lists them
 * (ac-evo-branch-history): id, message, author, date, and whether the commit
 * holds code or only the files a test run writes back. Null without a start
 * commit: the whole history of the repository is not the branch's.
 */
export function branchHistory(top, baseCommit) {
	if (!baseCommit) return null;
	const range = `${baseCommit}..HEAD`;
	const count = Number.parseInt(git(top, ['rev-list', '--count', range]) ?? '', 10);
	const listed = git(top, ['log', `--max-count=${HISTORY_LISTED}`, `--format=%H${UNIT}%an${UNIT}%aI${UNIT}%s`, range]);
	if (!Number.isInteger(count) || listed === null) return null;
	const ofCode = new Set((git(top, ['log', `--max-count=${HISTORY_LISTED}`, '--format=%H', range, '--', ...PATHSPEC]) ?? '').split('\n').filter(Boolean));
	const commits = listed
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [sha, author, at, ...subject] = line.split(UNIT);
			return { sha, subject: subject.join(UNIT), author, at, code: ofCode.has(sha) };
		});
	return { count, commits };
}

/** Whether `ancestor` is in the history of `of`: true, false, or null when git cannot tell (an unknown commit). */
export function isAncestor(dir, ancestor, of = 'HEAD') {
	try {
		execFileSync('git', ['merge-base', '--is-ancestor', ancestor, of], { cwd: dir, stdio: 'ignore', timeout: 5000 });
		return true;
	} catch (error) {
		return error && typeof error === 'object' && error.status === 1 ? false : null;
	}
}

/** Two commit ids name the same commit, one possibly abbreviated (7 characters at least). */
export function sameCommit(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length < 7 || b.length < 7) return false;
	return a.startsWith(b) || b.startsWith(a);
}

/** Checks a person makes: no run of the tests takes them again. */
const BY_HAND = new Set(['manual', 'visual']);

/** A path outside the checkout: one that climbs out of it, or an absolute one. */
function outsideCheckout(file) {
	return typeof file === 'string' && (file.startsWith('../') || file.startsWith('/'));
}

/**
 * Why a run of this repository's tests could not take the proof again, or null
 * when it could: a check made by hand, or a proof whose files all lie in another
 * repository, whose commits this branch never holds.
 */
function notRetakenHere(key, entry) {
	if (key.startsWith('criterion:')) {
		if (BY_HAND.has(entry.verification?.kind)) return 'byHand';
		const files = Array.isArray(entry.verification?.files) ? entry.verification.files : [];
		return files.length > 0 && files.every(outsideCheckout) ? 'otherRepositories' : null;
	}
	return outsideCheckout(entry.file) ? 'otherRepositories' : null;
}

/**
 * Over index entries, the passing results that prove something and how many of
 * them were taken on another commit than `codeHead` or on uncommitted code. A
 * result that names no commit proves nothing about the code at hand, so it
 * counts as taken elsewhere (ac-evo-branch-proof-commit).
 *
 * Only a proof a run on this commit could take again is counted (criterion
 * 4a83650a): a check made by hand, a proof whose files all lie in another
 * repository and, when `keys` names the request's own index keys, a proof of
 * another feature are left out, counted apart in `proofsLeftOut`, so the Build
 * never waits on a proof nobody could take here.
 */
export function proofsAgainst(entries, codeHead, { keys = null } = {}) {
	let proofsChecked = 0;
	let proofsOnOtherCommits = 0;
	const proofsLeftOut = { otherFeatures: 0, byHand: 0, otherRepositories: 0 };
	for (const [key, entry] of entries) {
		if (!entry || typeof entry !== 'object') continue;
		let onOtherCommit;
		if (key.startsWith('criterion:')) {
			const result = entry.verification?.lastResult;
			if (!result || typeof result !== 'object' || result.passed !== true) continue;
			onOtherCommit = result.dirty === true || !sameCommit(result.revision, codeHead);
		} else if (key.startsWith('action:') && typeof entry.verifiedAt === 'string' && entry.verifiedAt) {
			onOtherCommit = entry.verifiedDirty === true || !sameCommit(entry.verifiedRevision, codeHead);
		} else continue;
		if (keys && !keys.has(key)) {
			proofsLeftOut.otherFeatures += 1;
			continue;
		}
		const why = notRetakenHere(key, entry);
		if (why) {
			proofsLeftOut[why] += 1;
			continue;
		}
		proofsChecked += 1;
		if (onOtherCommit) proofsOnOtherCommits += 1;
	}
	return { proofsChecked, proofsOnOtherCommits, proofsLeftOut };
}
