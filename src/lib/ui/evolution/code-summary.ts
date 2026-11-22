import { shortSha } from '$domain/evolution';

/**
 * Where the request's code stands, said in one chip for the summary of
 * "Code on its branch": the one thing a person needs at a glance, the most
 * urgent first, with what it means and how it was established on hover;
 * every technical detail stays behind the card's Details.
 */
export interface CodeGlance {
	readonly deploymentBranch: string;
	readonly branch: string | null;
	readonly codeHead: string | null;
	readonly clean: boolean | null;
	readonly proofsChecked: number;
	readonly proofsOnOtherCommits: number;
	readonly validatedCommit: string | null;
	readonly validationSetAside: boolean;
	readonly mergedCommit: string | null;
	readonly mergedInto: string | null;
}

export type GlanceTone = 'ok' | 'warn' | 'muted';

/** What "all committed" means, said wherever the word stands. */
export const COMMITTED_TIP =
	'Nothing is left uncommitted on the branch (the implementation index and the test report aside): what was tested is exactly this commit.';

/** How the tests were established, said on hover wherever their count stands. */
export function testedTip(code: Pick<CodeGlance, 'codeHead' | 'proofsChecked' | 'proofsOnOtherCommits'>): string {
	if (code.proofsChecked === 0) return `No test result was reported on ${shortSha(code.codeHead)} yet.`;
	const on = code.proofsChecked - code.proofsOnOtherCommits;
	return `${on} of ${code.proofsChecked} test results were taken on ${shortSha(code.codeHead)}, the branch's last commit of code: one per acceptance criterion and one per action whose scenarios all passed. Your AI ran them against the real code and reported them with the index; Lyriks did not run them itself.`;
}

export function codeSummary(code: CodeGlance): { word: string; tone: GlanceTone; tip: string } {
	if (!code.branch)
		return { word: 'not created yet', tone: 'muted', tip: `The branch is created from ${code.deploymentBranch} with the command beside it; your AI's first index sync from it binds it to the request.` };
	if (code.mergedCommit)
		return {
			word: `merged into ${code.mergedInto}@${shortSha(code.mergedCommit)} · official`,
			tone: 'ok',
			tip: `The validated commit was merged into ${code.mergedInto}: the change is now the official specification.`
		};
	if (code.validationSetAside)
		return { word: 'moved since the approval: approve again', tone: 'warn', tip: 'A commit of code came after the one the approval fixed: the approval is asked again before the merge.' };
	if (code.clean === false)
		return {
			word: 'uncommitted changes',
			tone: 'warn',
			tip: 'The last index sync saw changes not committed yet: a test taken on them proves no commit. Commit, run the tests again, then sync.'
		};
	if (code.proofsOnOtherCommits > 0)
		return {
			word: `${code.proofsOnOtherCommits} ${code.proofsOnOtherCommits === 1 ? 'test' : 'tests'} on another commit`,
			tone: 'warn',
			tip: `${testedTip(code)} The others prove nothing about ${shortSha(code.codeHead)}: run the tests on it, then sync.`
		};
	if (code.validatedCommit)
		return { word: `validated at ${shortSha(code.validatedCommit)}`, tone: 'ok', tip: `The approval fixed ${shortSha(code.validatedCommit)}: that commit is what the merge brings into ${code.deploymentBranch}.` };
	return code.proofsChecked > 0
		? { word: `tested on ${shortSha(code.codeHead)}`, tone: 'ok', tip: `${testedTip(code)} ${COMMITTED_TIP}` }
		: { word: `committed · ${shortSha(code.codeHead)}`, tone: 'muted', tip: `${COMMITTED_TIP} No test result was reported on it yet.` };
}
