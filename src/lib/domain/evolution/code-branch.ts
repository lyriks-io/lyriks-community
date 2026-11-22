import { ALLOW, firstRefusal, guard, type Guarded } from './guard';

/**
 * The code of a request on a branch of its own, from its start to its merge
 * (feat-evo-code-branch). A project names its deployment branch; a request's
 * code is written on a branch derived from it and named after the request, so
 * the whole change can be undone with git until it is merged. Lyriks never
 * touches the repository: the person's AI reports what git says (the branch,
 * where it started, its last commit of code, whether the tree is clean, how
 * many proofs were taken on another commit), a person validates one commit,
 * and the merge of that commit into the deployment branch is the one moment
 * the request's drafts become the official specification.
 *
 * Pure: the operations server reads and writes what these functions return.
 */

/** One commit of code the branch reported, in the order they came. */
export interface CodeCommit {
	readonly sha: string;
	readonly at: string;
	/** False when the tree held uncommitted code at that report. */
	readonly clean: boolean;
}

/** The repository the code lives in, as git's remote names it (ac-evo-branch-repository). */
export interface CodeRepository {
	/** owner/name from the remote, or the checkout's folder when it has no remote. */
	readonly name: string;
	/** The remote's address, its credentials taken out; null when the checkout has no remote. */
	readonly url: string | null;
}

/** One commit of the branch as git lists it (ac-evo-branch-history). */
export interface BranchCommit {
	readonly sha: string;
	readonly subject: string;
	readonly author: string;
	readonly at: string;
	/** False when the commit only records the index or the test report. */
	readonly code: boolean;
}

/** The branch's commits since the commit it started from, newest first, as git listed them at the last report. */
export interface BranchHistory {
	/** Every commit of the branch since its start; `commits` holds the newest of them. */
	readonly count: number;
	readonly commits: readonly BranchCommit[];
}

/** Where the request's code stands in git, as its AI last reported it. */
export interface CodeTrack {
	readonly repository: CodeRepository | null;
	readonly branch: string;
	/** The commit of the deployment branch the branch started from (git merge-base). */
	readonly baseCommit: string | null;
	readonly head: string;
	/** The branch's last commit of code: the index and the test report left out (ac-evo-branch-state). */
	readonly codeHead: string;
	readonly clean: boolean;
	/** The proofs the last sync carried, and how many of them were taken on uncommitted code or another commit. */
	readonly proofsChecked: number;
	readonly proofsOnOtherCommits: number;
	readonly reportedAt: string;
	/**
	 * The report that bound the branch: from then to its last report, an index
	 * sync is the request's code, never the product's (ac-evo-branch-not-outside).
	 * Absent on a track written before it was kept.
	 */
	readonly boundAt?: string;
	readonly commits: readonly CodeCommit[];
	readonly history: BranchHistory | null;
	/** The commit the last approval awaited fixed, and who gave it (ac-evo-branch-validate, EVO-011). */
	readonly validated: { readonly commit: string; readonly at: string; readonly by: string } | null;
	/** A commit of code came after the approval: the merge waits for a new one (ac-evo-branch-moved, EVO-011). */
	readonly validationSetAside: boolean;
	/**
	 * The merge into the deployment branch, once reported with the validated
	 * commit in it (ac-evo-branch-merge), with the code it brought: what the code
	 * read then that the reference did not, by code element key, so the merged
	 * code is what later changes are read against (ac-evo-branch-not-outside).
	 */
	readonly merged: { readonly into: string; readonly commit: string; readonly at: string; readonly code?: Readonly<Record<string, string>> } | null;
}

/** What the person's AI reports at an index sync. */
export interface CodeReport {
	/** Null from a tool that does not report them yet: what the request holds stays. */
	readonly repository?: CodeRepository | null;
	readonly history?: BranchHistory | null;
	readonly branch: string;
	readonly baseCommit: string | null;
	readonly head: string;
	readonly codeHead: string;
	readonly clean: boolean;
	readonly proofsChecked: number;
	readonly proofsOnOtherCommits: number;
}

/** What the person's AI reports once the branch is merged. */
export interface MergeReport {
	readonly branch: string;
	readonly into: string;
	readonly mergeCommit: string;
	readonly containsValidated: boolean;
}

/** How many commits of the branch a report lists; the count still says how many there are. */
export const HISTORY_LISTED = 200;

/**
 * A remote's address without the user or token written in it: a remote such as
 * https://user:token@host/owner/name.git must never reach Lyriks
 * (ac-evo-branch-repository). An scp-like address (git@host:owner/name) keeps
 * its user, which is no secret.
 */
export function withoutCredentials(url: string): string {
	return url.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, '$1');
}

/** The files a commit of code leaves out: what the tools write after the tests ran. */
export const CODE_FILES_LEFT_OUT = ['.unspa.json', 'test-report.json'] as const;

/** Small words a branch name leaves out, so it keeps the words that say what the change is. */
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'with', 'by', 'from', 'at', 'is', 'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'en', 'au', 'aux', 'pour', 'sur']);
const BRANCH_WORDS = 4;

/**
 * The branch a request's code is written on (ac-evo-branch-name):
 * evo/<request key>-<its title in a few words>, e.g. "evo/EVO-001-fix-problems-retro-spec".
 */
export function branchNameFor(key: string, title: string): string {
	const words = title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w !== '' && !SMALL_WORDS.has(w))
		.slice(0, BRANCH_WORDS);
	return `evo/${key}${words.length > 0 ? `-${words.join('-')}` : ''}`;
}

/** A commit as people read it: its first seven characters. */
export const shortSha = (sha: string | null | undefined): string => (sha ?? '').slice(0, 7);

/** The git command that creates the request's branch from the deployment branch. */
export const createCommand = (branch: string, deploymentBranch: string): string => `git switch -c ${branch} ${deploymentBranch}`;
/** The git command that deletes the request's branch once the request is cancelled (ac-evo-branch-cancel). */
export const deleteCommand = (branch: string): string => `git branch -D ${branch}`;

const reported = (r: { stage: string; status: string }) => r.status === 'open' && (r.stage === 'implementation' || r.stage === 'acceptance' || r.stage === 'delivered');

/**
 * Whether a report of the code is taken for this request (ac-evo-branch-derived):
 * never from the deployment branch, never from another branch than the one it
 * holds, the first one from the name Lyriks gave it, and only from the Build
 * until the merge.
 */
export function codeReportRefusal(
	request: { readonly stage: string; readonly status: string; readonly code?: CodeTrack },
	deploymentBranch: string,
	expectedBranch: string,
	report: CodeReport
): Guarded {
	const holds = request.code?.branch ?? null;
	return firstRefusal(
		guard(!deploymentBranch, 'The project names no deployment branch.', 'A project names its deployment branch before its code is followed in git.'),
		guard(!reported(request), 'Code is reported from the Build until the merge.', 'Before the freeze there is no version to build; after the merge nothing moves.'),
		guard(!report.branch || !report.codeHead || !report.head, 'A report names the branch, its head and its last commit of code.', 'The Lyriks tools read them from git.'),
		guard(
			report.branch === deploymentBranch,
			`Code is never written on the deployment branch ${deploymentBranch}: report it from ${holds ?? expectedBranch}.`,
			'The deployment branch only receives validated code, by its merge: code written on it could not be taken back.'
		),
		guard(holds !== null && report.branch !== holds, `This request's code is on ${holds}: report it from there.`, 'One request, one branch: code from elsewhere is another change.'),
		guard(holds === null && report.branch !== expectedBranch, `This request's code is written on ${expectedBranch}.`, 'Lyriks names the branch; the first report from it binds it.')
	);
}

/**
 * The request's code after a report: the branch bound by the first one, each
 * new commit of code kept in order, and a validation set aside by a commit
 * that came after it (ac-evo-branch-state, ac-evo-branch-moved).
 */
export function withCodeReport(code: CodeTrack | undefined, report: CodeReport, at: string): { code: CodeTrack; newCommit: boolean; setAside: boolean } {
	const last = code?.commits.at(-1);
	const newCommit = !last || last.sha !== report.codeHead || last.clean !== report.clean;
	const setAside = !!code?.validated && report.codeHead !== code.validated.commit && !code.validationSetAside;
	return {
		newCommit,
		setAside,
		code: {
			repository: report.repository ?? code?.repository ?? null,
			branch: report.branch,
			baseCommit: code?.baseCommit ?? report.baseCommit ?? null,
			head: report.head,
			codeHead: report.codeHead,
			clean: report.clean,
			proofsChecked: report.proofsChecked,
			proofsOnOtherCommits: report.proofsOnOtherCommits,
			reportedAt: at,
			boundAt: code ? (code.boundAt ?? code.commits[0]?.at ?? code.reportedAt) : at,
			commits: newCommit ? [...(code?.commits ?? []), { sha: report.codeHead, at, clean: report.clean }].slice(-50) : (code?.commits ?? []),
			// git's list replaces the one before: it is what the branch holds now.
			history: report.history ?? code?.history ?? null,
			validated: code?.validated ?? null,
			validationSetAside: (code?.validationSetAside ?? false) || setAside,
			merged: code?.merged ?? null
		}
	};
}

/** What the log says of a report that moved something; null when nothing moved. */
export function codeReportSummary(code: CodeTrack, previous: CodeTrack | undefined, deploymentBranch: string, moved: { newCommit: boolean; setAside: boolean }): string | null {
	if (moved.setAside) return `The branch moved after the approval (now ${shortSha(code.codeHead)}): the approval is asked again`;
	if (!previous) return `Branch ${code.branch} bound, from ${deploymentBranch}${code.baseCommit ? `@${shortSha(code.baseCommit)}` : ''}: last commit of code ${shortSha(code.codeHead)}${code.clean ? '' : ', with uncommitted code'}`;
	if (!moved.newCommit) return null;
	return code.clean ? `New commit of code on ${code.branch}: ${shortSha(code.codeHead)}` : `Uncommitted code on ${code.branch} (last commit ${shortSha(code.codeHead)})`;
}

/** What a request carries that tells whether it brings code (ac-evo-branch-no-code). */
export interface ChangeCarrier {
	readonly drafts?: readonly unknown[];
	readonly dataDrafts?: readonly unknown[];
	readonly sectionDrafts?: readonly unknown[];
	readonly ruleDrafts?: readonly unknown[];
	readonly findingDrafts?: readonly unknown[];
	readonly proposals?: readonly { readonly acceptedAt: string | null; readonly canonicalSection: string }[];
}

/**
 * Whether a request brings code (ac-evo-branch-no-code). One that changes
 * nothing of the product's spec but the findings of Project health it settles
 * brings none: what fixed them is already in the product, so it has no branch
 * to build on nor to merge. Any other change (a feature, data, a page or a rule
 * drafted, a value it wrote into the spec) brings code, and so does a request
 * that settles no finding at all.
 */
export function bringsCode(request: ChangeCarrier): boolean {
	if ((request.findingDrafts?.length ?? 0) === 0) return true;
	const drafted = [request.drafts, request.dataDrafts, request.sectionDrafts, request.ruleDrafts].some((list) => (list?.length ?? 0) > 0);
	return drafted || (request.proposals ?? []).some((p) => p.acceptedAt !== null && p.canonicalSection !== 'request');
}

/**
 * Whether the verification can be validated, read on the code when the project
 * names a deployment branch (ac-evo-branch-validate): code reported from the
 * request's branch, no uncommitted code, every proof taken on its last commit.
 * A request that brings no code has none to validate (ac-evo-branch-no-code).
 */
export function validationRefusal(code: CodeTrack | undefined, deploymentBranch: string, withCode = true): Guarded {
	if (!deploymentBranch || !withCode) return ALLOW;
	return firstRefusal(
		guard(!code, "No code was reported from the request's branch yet.", 'Each index sync from the branch reports where its code stands; the validated commit is one of its commits.'),
		guard(
			!!code && !code.clean,
			'The branch holds uncommitted code: commit it, run the tests again, then validate.',
			'Uncommitted code is in no commit: nothing could be merged that holds what was tested.'
		),
		guard(
			!!code && code.proofsOnOtherCommits > 0,
			`${code?.proofsOnOtherCommits ?? 0} ${code?.proofsOnOtherCommits === 1 ? 'proof was' : 'proofs were'} taken on another commit: run the tests on ${shortSha(code?.codeHead)}.`,
			'A proof taken on another commit says nothing about the commit being validated.'
		)
	);
}

/**
 * Closing the verification fixes no commit (EVO-011, rules c8ed0817, 3b2c723b):
 * one an earlier approval fixed is let go until the last approval awaited fixes one again.
 */
export function withoutValidatedCommit(code: CodeTrack): CodeTrack {
	return code.validated || code.validationSetAside ? { ...code, validated: null, validationSetAside: false } : code;
}

/** The commit the approval fixes: the branch's last commit of code. */
export function withValidatedCommit(code: CodeTrack, by: string, at: string): CodeTrack {
	return { ...code, validated: { commit: code.codeHead, at, by }, validationSetAside: false };
}

/**
 * Whether a merge is recorded (ac-evo-branch-merge): after the approval, into
 * the deployment branch, from the request's branch, with the validated commit
 * in it, and no commit of code after the validation.
 */
export function mergeRefusal(request: { readonly stage: string; readonly status: string; readonly code?: CodeTrack }, deploymentBranch: string, merge: MergeReport): Guarded {
	const code = request.code;
	return firstRefusal(
		guard(!deploymentBranch, 'The project names no deployment branch.', 'A merge is recorded against the deployment branch the project names.'),
		guard(request.status !== 'open', 'Only an open request is merged.', 'A closed or cancelled request has nothing left to merge.'),
		guard(request.stage !== 'delivered', 'The merge comes once the change is approved.', 'The merge closes the path: the change was validated and approved first.'),
		guard(!code?.validated, 'No commit was validated.', 'What goes live is the commit the approval fixed.'),
		guard(!!merge.branch && !!code && merge.branch !== code.branch, `This request's code is on ${code?.branch}.`, 'The merge brings the request\'s own branch.'),
		guard(merge.into !== deploymentBranch, `The change is merged into ${deploymentBranch}.`, 'Only the deployment branch makes a change live.'),
		guard(!merge.mergeCommit, 'A merge names the commit it made.', 'The Lyriks tools read it from git.'),
		guard(!!code?.validationSetAside, 'The branch moved after the approval: approve the change again.', 'Code that came after the approval was never approved.'),
		guard(!merge.containsValidated, `git says the validated commit ${shortSha(code?.validated?.commit)} is not in this merge.`, 'What goes live is what was validated.')
	);
}

export function withMerge(code: CodeTrack, merge: MergeReport, at: string, brought: Readonly<Record<string, string>> = {}): CodeTrack {
	return { ...code, merged: { into: merge.into, commit: merge.mergeCommit, at, ...(Object.keys(brought).length ? { code: brought } : {}) } };
}

/** A person declares live by hand only where no deployment branch makes the merge do it (ac-evo-branch-merge). */
export function declareByHandRefusal(code: CodeTrack | undefined, deploymentBranch: string, withCode = true): Guarded {
	return guard(
		// A request that brings no code has no branch to merge: a person declares it (ac-evo-branch-no-code).
		!!deploymentBranch && withCode && !code?.merged,
		"Merge the request's branch: its merge declares the change live.",
		'With a deployment branch named, declaring live by hand would let the specification say one thing and the branch another.'
	);
}

/** Whether a deployment branch name is one git takes. */
export function deploymentBranchRefusal(branch: string): Guarded {
	return guard(
		!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..'),
		'Name the deployment branch as git names it.',
		'Letters, digits, dots, dashes, underscores and slashes, as in main or release/2026.'
	);
}

/** Where the request's code stands, as the page and the MCP read it; null where the project names no deployment branch. */
export interface CodeReading {
	readonly repository: CodeRepository | null;
	readonly deploymentBranch: string;
	readonly expectedBranch: string;
	readonly createCommand: string;
	readonly branch: string | null;
	readonly baseCommit: string | null;
	readonly head: string | null;
	readonly codeHead: string | null;
	readonly clean: boolean | null;
	readonly proofsChecked: number;
	readonly proofsOnOtherCommits: number;
	readonly reportedAt: string | null;
	readonly commits: readonly CodeCommit[];
	/** Every commit of the branch since its start, newest first, and how many there are (ac-evo-branch-history). */
	readonly history: readonly BranchCommit[];
	readonly commitCount: number;
	readonly validatedCommit: string | null;
	readonly validatedAt: string | null;
	/** Who gave the approval that fixed it (criterion e33a838a). */
	readonly validatedBy: string | null;
	readonly validationSetAside: boolean;
	readonly mergedCommit: string | null;
	readonly mergedInto: string | null;
	readonly mergedAt: string | null;
	/** Once cancelled, the command that deletes the branch (ac-evo-branch-cancel). */
	readonly deleteCommand: string | null;
}

export function codeReadingOf(request: { readonly status: string; readonly title: string; readonly code?: CodeTrack } & ChangeCarrier, key: string, deploymentBranch: string): CodeReading | null {
	// No branch is followed for a request that brings no code: it reads like a project naming none (ac-evo-branch-no-code).
	if (!deploymentBranch || !bringsCode(request)) return null;
	const code = request.code;
	const expectedBranch = code?.branch ?? branchNameFor(key, request.title);
	return {
		repository: code?.repository ?? null,
		deploymentBranch,
		expectedBranch,
		createCommand: createCommand(expectedBranch, deploymentBranch),
		branch: code?.branch ?? null,
		baseCommit: code?.baseCommit ?? null,
		head: code?.head ?? null,
		codeHead: code?.codeHead ?? null,
		clean: code ? code.clean : null,
		proofsChecked: code?.proofsChecked ?? 0,
		proofsOnOtherCommits: code?.proofsOnOtherCommits ?? 0,
		reportedAt: code?.reportedAt ?? null,
		commits: code?.commits ?? [],
		history: code?.history?.commits ?? [],
		commitCount: code?.history?.count ?? 0,
		validatedCommit: code?.validated?.commit ?? null,
		validatedAt: code?.validated?.at ?? null,
		validatedBy: code?.validated?.by ?? null,
		validationSetAside: code?.validationSetAside ?? false,
		mergedCommit: code?.merged?.commit ?? null,
		mergedInto: code?.merged?.into ?? null,
		mergedAt: code?.merged?.at ?? null,
		deleteCommand: request.status === 'cancelled' && code ? deleteCommand(code.branch) : null
	};
}

