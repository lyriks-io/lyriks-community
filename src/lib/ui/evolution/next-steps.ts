import { shortSha, type CloseStep, type CodeReading, type LandingCheck } from '$domain/evolution';

/**
 * What happens next once the verification has nothing left open
 * (ac-evo-verd-next-steps): the steps left until the change is live, in order,
 * each done, to take now or later, with what it does. Where the project names a
 * deployment branch, the last step is the merge of the request's branch, with
 * the git commands that make it; elsewhere it is closing the evolution by hand.
 * A step done says what it did, with its facts, and once the change is live
 * what comes next follows (ac-evo-verd-next-steps-done).
 */

export type NextStepId = 'accept' | 'approve' | 'live';
export type NextStepState = 'done' | 'now' | 'later';

export interface NextStep {
	readonly id: NextStepId;
	readonly title: string;
	readonly text: string;
	readonly state: NextStepState;
	/** Once live, on the step that made it official: whether everything is in the specification (ac-evo-verd-landed-check). */
	readonly check?: LandingCheck;
	/** What the person's AI is handed when this step is sent to it (ac-evo-verd-steps-to-ai). */
	readonly handOff?: HandOff;
}

/** A step of the close the person's AI carries out in git or in the index, and the brief it gets. */
export interface HandOff {
	readonly step: CloseStep;
	readonly brief: string;
}

/** What is left to do once the change is live: a command to copy, or a page to open. */
export interface AfterStep {
	readonly id: 'sync' | 'branch' | 'spec';
	readonly title: string;
	readonly text: string;
	readonly command: string | null;
	readonly href: string | null;
	readonly handOff?: HandOff;
}

export interface NextSteps {
	readonly steps: readonly NextStep[];
	/** The git commands that merge the request's branch and report it; null where no deployment branch is named. */
	readonly commands: readonly string[] | null;
	/** The change is live: every step reads what happened. */
	readonly live: boolean;
	/** What comes next once it is live; empty before. */
	readonly after: readonly AfterStep[];
}

/** What the close made official, as the closing reading counts it. */
export interface LandedFacts {
	/** "14 features changed, 1 table changed"; empty when the request changed nothing. */
	readonly changes: string;
	readonly version: { readonly from: string; readonly to: string } | null;
	readonly specHref: string;
	/** Everything the request carried, checked again on the specification as it stands; null when it could not be read. */
	readonly check: LandingCheck | null;
}

export interface NextStepsInput {
	readonly stage: string;
	readonly status: string;
	/** Nothing is left open in the report: the request may leave the Build. */
	readonly gateOk: boolean;
	/** The people the approval still waits on, by name. */
	readonly awaited: readonly string[];
	/** The people who signed the approval, by name. */
	readonly approvedBy: readonly string[];
	readonly code: Pick<
		CodeReading,
		'deploymentBranch' | 'expectedBranch' | 'branch' | 'codeHead' | 'validatedCommit' | 'validatedAt' | 'mergedCommit' | 'mergedInto' | 'mergedAt'
	> | null;
	/** When the change was declared live, by its merge or by hand. */
	readonly closedAt: string | null;
	/** What the close made official; null until it is closed. */
	readonly landed: LandedFacts | null;
	/** Index entries still held for the change: syncing the index again is offered only while some are (ac-evo-branch-merge-syncs). */
	readonly heldEntries: number;
	/** This install's MCP, the address its AI connection instructions give: the merge report runs as copied. */
	readonly mcpUrl: string;
}

/** How far the request has gone: the Build, acceptance testing, approved, live. */
function reached(stage: string, status: string): number {
	if (status === 'closed') return 3;
	return stage === 'delivered' ? 2 : stage === 'acceptance' ? 1 : 0;
}

const stateAt = (at: number, step: number): NextStepState => (at > step ? 'done' : at === step ? 'now' : 'later');

const MOMENT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "29 Oct, 16:41": a step done is a record, read as a date and not as an age. */
export function momentOf(at: string): string {
	const date = new Date(at);
	return Number.isNaN(date.getTime()) ? '' : MOMENT.format(date);
}

const on = (at: string | null | undefined) => {
	const moment = at ? momentOf(at) : '';
	return moment ? ` on ${moment}` : '';
};

/** "Now official in the specification: 14 features changed (Specification 360° v3 → v4)." */
function officialOf(landed: LandedFacts | null): string {
	if (!landed) return "The request's drafts are now the official specification.";
	const version = landed.version ? ` (specification ${landed.version.from} → ${landed.version.to})` : '';
	return landed.changes ? `Now official in the specification: ${landed.changes}${version}.` : `The specification is now the reference${version}.`;
}

function liveStep(input: NextStepsInput, at: number, branch: string): NextStep {
	const { code } = input;
	const state = stateAt(at, 2);
	if (state === 'done') {
		const official = officialOf(input.landed);
		const check = input.landed?.check ? { check: input.landed.check } : {};
		if (code?.mergedCommit) {
			const into = code.mergedInto ?? code.deploymentBranch;
			const validated = code.validatedCommit ? `, with the validated commit ${shortSha(code.validatedCommit)} in it` : '';
			return {
				id: 'live',
				title: `Merged into ${into}`,
				text: `${branch} merged into ${into}@${shortSha(code.mergedCommit)}${on(code.mergedAt ?? input.closedAt)}${validated}. ${official} The request is closed as live.`,
				state,
				...check
			};
		}
		return { id: 'live', title: 'Evolution closed', text: `Declared live${on(input.closedAt)}. ${official}`, state, ...check };
	}
	return code
		? {
				id: 'live',
				title: `Merge into ${code.deploymentBranch}`,
				text: `Merge ${branch}, then report the merge: Lyriks checks that the validated commit${code.validatedCommit ? ` ${shortSha(code.validatedCommit)}` : ''} is in it, writes the request's drafts into the official specification and closes the request as live, and the report syncs the index. Until then nothing is official, and deleting the branch undoes it all.`,
				state,
				...(code.validatedCommit
					? {
							handOff: {
								step: 'merge' as const,
								brief: [
									`Merge the branch of this evolution into ${code.deploymentBranch} in my checkout of the repository, then report the merge:`,
									...mergeCommands(code.deploymentBranch, branch, input.mcpUrl),
									`Lyriks makes the change official once it finds the validated commit ${shortSha(code.validatedCommit)} in the merge, and report-merge.mjs then syncs the implementation index. Never push.`
								].join('\n')
							}
						}
					: {})
			}
		: {
				id: 'live',
				title: 'Close the evolution',
				text: "Closing declares the change live and writes the request's drafts into the official specification.",
				state
			};
}

const mergeCommands = (deploymentBranch: string, branch: string, mcpUrl: string) => [
	`git switch ${deploymentBranch}`,
	`git merge --no-ff ${branch}`,
	`node .lyriks/tools/report-merge.mjs --branch ${branch} --url ${mcpUrl}`
];

/** Once live: sync the index again, delete the merged branch, open the specification as it stands. */
function afterOf(input: NextStepsInput, branch: string): AfterStep[] {
	const { code, landed, mcpUrl } = input;
	const from = code ? ` from ${code.mergedInto ?? code.deploymentBranch}` : '';
	const sync = `node .lyriks/tools/sync-index.mjs --url ${mcpUrl}`;
	const after: AfterStep[] = [];
	// Done by the merge report itself: offered only while the request still holds entries for it.
	if (input.heldEntries > 0)
		after.push({
			id: 'sync',
			title: 'Sync the implementation index again',
			text: `Lyriks sends the index again${from}: the ${input.heldEntries === 1 ? 'entry' : `${input.heldEntries} entries`} held while the request was open then resolve against the official specification.`,
			command: sync,
			href: null,
			handOff: { step: 'sync', brief: [`The change of this evolution is live: sync the implementation index again${from}.`, sync].join('\n') }
		});
	if (code?.mergedCommit && branch) {
		const remove = `git branch -d ${branch}`;
		after.push({
			id: 'branch',
			title: `Delete ${branch}`,
			text: 'It is merged: deleting it loses no commit.',
			command: remove,
			href: null,
			handOff: { step: 'branch', brief: [`Delete the merged branch of this evolution in my checkout:`, remove, `It is merged into ${code.mergedInto ?? code.deploymentBranch}: deleting it loses no commit. Never force it with -D.`].join('\n') }
		});
	}
	if (landed)
		after.push({
			id: 'spec',
			title: 'Open the specification',
			text: `It now holds the change${landed.version ? `, as ${landed.version.to}` : ''}.`,
			command: null,
			href: landed.specHref
		});
	return after;
}

/** The steps left until the change is live; null while lines are still open, before the Build, or once cancelled. */
export function nextStepsOf(input: NextStepsInput): NextSteps | null {
	const { stage, status, gateOk, awaited, approvedBy, code, mcpUrl } = input;
	if (status === 'cancelled') return null;
	if (stage !== 'implementation' && stage !== 'acceptance' && stage !== 'delivered' && status !== 'closed') return null;
	const at = reached(stage, status);
	if (at === 0 && !gateOk) return null;
	const branch = code ? (code.branch ?? code.expectedBranch) : '';
	const commit = code ? shortSha(code.validatedCommit ?? code.codeHead) : '';
	const acceptState = stateAt(at, 0);
	const approveState = stateAt(at, 1);
	const steps: NextStep[] = [
		acceptState === 'done'
			? {
					id: 'accept',
					title: 'Verification closed',
					text: code && commit ? `Closed${on(code.validatedAt)}: it validated ${commit} on ${branch}.` : 'Closed: nothing was left open in the report.',
					state: acceptState
				}
			: {
					id: 'accept',
					title: 'Start acceptance testing',
					text: code && commit
						? `Closes the verification and fixes the commit it validates: ${commit} on ${branch}. Nothing is official yet.`
						: 'Closes the verification. Nothing is official yet.',
					state: acceptState
				},
		approveState === 'done'
			? { id: 'approve', title: 'Change approved', text: approvedBy.length > 0 ? `Approved by ${approvedBy.join(', ')}.` : 'Approved.', state: approveState }
			: {
					id: 'approve',
					title: 'Approve the change',
					text: `Walk the change as its users would, then approve it${awaited.length > 0 ? `: ${awaited.join(', ')} still to sign` : ''}.`,
					state: approveState
				},
		liveStep(input, at, branch)
	];
	const commands = code ? mergeCommands(code.deploymentBranch, branch, mcpUrl) : null;
	const live = at === 3;
	return { steps, commands, live, after: live ? afterOf(input, branch) : [] };
}

/** The step to take now, if any. */
export const stepNow = (next: NextSteps | null): NextStep | null => next?.steps.find((s) => s.state === 'now') ?? null;
